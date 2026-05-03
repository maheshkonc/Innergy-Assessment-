// Results finaliser. Runs after the last question is answered (after the
// "calculating…" delay). Computes score + interpretation + persists the
// Result row + returns the ordered WhatsApp messages to send.

import type { PrismaClient, Session, Tenant, User } from "@prisma/client";
import { scoreInstrument } from "../scoring/engine";
import type {
  AnswerInput,
  InstrumentSpec,
  OptionLabel,
} from "../scoring/types";
import { interpret, type InterpretResult } from "../interpretation/index";
import { resolveMessageTemplate } from "../templates/resolve";
import { renderTemplate } from "../templates/render";
import type { LLMProvider } from "../../providers/llm/types";
import type { OutboundAction } from "./engine";
import { enqueueUserReportNotification } from "../notifications/create";
import { log } from "../logger";

export async function finaliseResults(
  prisma: PrismaClient,
  args: {
    tenant: Tenant;
    user: User;
    session: Session;
    llm?: LLMProvider;
  },
): Promise<{ actions: OutboundAction[]; resultId: string; interpretation: InterpretResult }> {
  const { tenant, user, session } = args;

  const spec = await loadInstrumentSpec(prisma, session.instrumentVersionId);
  const answers = await loadAnswerInputs(prisma, session.id);
  const score = scoreInstrument(spec, answers);

  const instrumentVersion = await prisma.instrumentVersion.findUniqueOrThrow({
    where: { id: session.instrumentVersionId },
    include: { instrument: true },
  });

  const interpretation = await interpret(prisma, {
    tenant,
    user,
    score,
    instrumentName: instrumentVersion.instrument.name,
    llm: args.llm,
  });

  const dimensionRows = await prisma.dimension.findMany({
    where: { id: { in: score.dimensions.map((d) => d.dimensionId) } },
  });
  const byName = new Map(dimensionRows.map((d) => [d.name, d]));

  const cog = score.dimensions.find((d) => byName.get("Section 1")?.id === d.dimensionId)!;
  const rel = score.dimensions.find((d) => byName.get("Section 2")?.id === d.dimensionId)!;
  const inner = score.dimensions.find((d) => byName.get("Section 3")?.id === d.dimensionId)!;

  const result = await prisma.result.create({
    data: {
      sessionId: session.id,
      tenantId: tenant.id,
      userId: user.id,
      instrumentVersionId: session.instrumentVersionId,

      cognitiveScore: cog.score,
      cognitiveBand: cog.band,
      relationalScore: rel.score,
      relationalBand: rel.band,
      innerScore: inner.score,
      innerBand: inner.band,

      overallScore: score.overallScore,
      overallBand: score.overallBand,
      lowestDimensionId: score.lowestDimensionId,

      interpretationMode: interpretation.mode,
      interpretationJson: {
        perDimension: interpretation.perDimension,
        overallNarrative: interpretation.overallNarrative,
        lowestDimensionId: interpretation.lowestDimensionId,
        lowestDimensionName: interpretation.lowestDimensionName,
        fellBack: interpretation.fellBack,
      },
    },
  });

  // Build outbound messages.
  const actions: OutboundAction[] = [];
  for (const d of interpretation.perDimension) {
    const tpl = await resolveMessageTemplate(prisma, {
      key: "dimension_result",
      tenantId: tenant.id,
    });
    if (!tpl) continue;
    const dimScore = score.dimensions.find((s) => s.dimensionId === d.dimensionId)!;
    const body = renderTemplate(tpl.body, {
      dimension_name: d.dimensionName,
      score: dimScore.score,
      max_score: dimScore.maxScore,
      band_label: dimScore.band,
      interpretation: d.narrative,
    }, { templateKey: "dimension_result" });
    actions.push({ kind: "text", body });
    actions.push({ kind: "voice_if_enabled", body });
  }

  const overallTpl = await resolveMessageTemplate(prisma, {
    key: "overall_result",
    tenantId: tenant.id,
  });
  if (overallTpl) {
    const body = renderTemplate(overallTpl.body, {
      overall_band_label: score.overallBand,
      overall_score: score.overallScore,
      overall_max_score: score.overallMaxScore,
      cognitive_score: cog.score,
      cognitive_max: cog.maxScore,
      relational_score: rel.score,
      relational_max: rel.maxScore,
      inner_score: inner.score,
      inner_max: inner.maxScore,
      overall_interpretation: interpretation.overallNarrative,
    }, { templateKey: "overall_result" });
    actions.push({ kind: "text", body });
    actions.push({ kind: "voice_if_enabled", body });
  }

  actions.push({ kind: "image_results_circle", resultId: result.id });

  // Debrief CTA.
  const coachJoin = await prisma.tenantCoach.findFirst({
    where: { tenantId: tenant.id, isPrimary: true },
    include: { coach: true },
  });
  const ctaVars = {
    name: user.firstName ?? "there",
    coach_name: coachJoin?.coach.name ?? "",
    coach_booking_url: coachJoin?.coach.bookingUrl ?? "",
    lowest_dimension_name: interpretation.lowestDimensionName,
  };
  const cta1 = await resolveMessageTemplate(prisma, { key: "debrief_cta_1", tenantId: tenant.id });
  const cta2 = await resolveMessageTemplate(prisma, { key: "debrief_cta_2", tenantId: tenant.id });
  if (cta1) {
    actions.push({
      kind: "text",
      body: renderTemplate(cta1.body, ctaVars, { allowMissing: true }),
    });
  }
  if (cta2) {
    actions.push({
      kind: "text",
      body: renderTemplate(cta2.body, ctaVars, { allowMissing: true }),
    });
  }

  // Email the leader their report (idempotent per session). Failure here
  // must not block the WhatsApp/web result delivery — log and continue.
  if (user.email) {
    try {
      await enqueueUserReportNotification(prisma, {
        tenantId: tenant.id,
        userId: user.id,
        sessionId: session.id,
        email: user.email,
      });
    } catch (err) {
      log.error({ err, sessionId: session.id }, "failed to enqueue user_report email");
    }
  }

  return { actions, resultId: result.id, interpretation };
}

/**
 * Re-emits the user's most recent completed result (PRD §11.10 — RESULTS command).
 * Reads the stored interpretationJson — no recomputation, no LLM calls.
 * Returns an empty action list (not an error) if the user has no result yet.
 */
export async function resendLatestResults(
  prisma: PrismaClient,
  args: { tenant: Tenant; user: User },
): Promise<{ actions: OutboundAction[] }> {
  const { tenant, user } = args;
  const result = await prisma.result.findFirst({
    where: { tenantId: tenant.id, userId: user.id },
    orderBy: { generatedAt: "desc" },
  });
  if (!result) return { actions: [] };

  const stored = result.interpretationJson as {
    perDimension?: Array<{ dimensionId: string; dimensionName: string; narrative: string }>;
    overallNarrative?: string;
  };

  const dimensionRows = await prisma.dimension.findMany();
  const dimByName = new Map(dimensionRows.map((d) => [d.name, d]));

  const actions: OutboundAction[] = [];

  const dimTpl = await resolveMessageTemplate(prisma, {
    key: "dimension_result",
    tenantId: tenant.id,
  });
  const overallTpl = await resolveMessageTemplate(prisma, {
    key: "overall_result",
    tenantId: tenant.id,
  });

  const dimensionBandMaxByName: Record<string, { score: number; max: number; band: string }> = {
    "Section 1": {
      score: result.cognitiveScore,
      max: await maxForDimension(prisma, result.instrumentVersionId, dimByName.get("Section 1")?.id),
      band: result.cognitiveBand,
    },
    "Section 2": {
      score: result.relationalScore,
      max: await maxForDimension(prisma, result.instrumentVersionId, dimByName.get("Section 2")?.id),
      band: result.relationalBand,
    },
    "Section 3": {
      score: result.innerScore,
      max: await maxForDimension(prisma, result.instrumentVersionId, dimByName.get("Section 3")?.id),
      band: result.innerBand,
    },
  };

  if (dimTpl && stored.perDimension) {
    for (const d of stored.perDimension) {
      const stats = dimensionBandMaxByName[d.dimensionName];
      if (!stats) continue;
      const body = renderTemplate(
        dimTpl.body,
        {
          dimension_name: d.dimensionName,
          score: stats.score,
          max_score: stats.max,
          band_label: stats.band,
          interpretation: d.narrative,
        },
        { templateKey: "dimension_result" },
      );
      actions.push({ kind: "text", body });
      actions.push({ kind: "voice_if_enabled", body });
    }
  }

  if (overallTpl) {
    const cc = dimensionBandMaxByName["Section 1"]!;
    const ri = dimensionBandMaxByName["Section 2"]!;
    const im = dimensionBandMaxByName["Section 3"]!;
    const body = renderTemplate(
      overallTpl.body,
      {
        overall_band_label: result.overallBand,
        overall_score: result.overallScore,
        overall_max_score: cc.max + ri.max + im.max,
        cognitive_score: result.cognitiveScore,
        cognitive_max: cc.max,
        relational_score: result.relationalScore,
        relational_max: ri.max,
        inner_score: result.innerScore,
        inner_max: im.max,
        overall_interpretation: stored.overallNarrative ?? "",
      },
      { templateKey: "overall_result" },
    );
    actions.push({ kind: "text", body });
    actions.push({ kind: "voice_if_enabled", body });
  }

  actions.push({ kind: "image_results_circle", resultId: result.id });
  return { actions };
}

async function maxForDimension(
  prisma: PrismaClient,
  instrumentVersionId: string,
  dimensionId: string | undefined,
): Promise<number> {
  if (!dimensionId) return 0;
  const bands = await prisma.dimensionBand.findMany({
    where: { instrumentVersionId, dimensionId },
  });
  return bands.reduce((m, b) => Math.max(m, b.maxScore), 0);
}

async function loadInstrumentSpec(
  prisma: PrismaClient,
  instrumentVersionId: string,
): Promise<InstrumentSpec> {
  const sections = await prisma.section.findMany({
    where: { instrumentVersionId },
    orderBy: { displayOrder: "asc" },
    include: {
      questions: {
        orderBy: { displayOrder: "asc" },
        include: { options: { orderBy: { displayOrder: "asc" } } },
      },
    },
  });
  const dimensionBands = await prisma.dimensionBand.findMany({
    where: { instrumentVersionId },
  });
  const overallBands = await prisma.overallBand.findMany({
    where: { instrumentVersionId },
  });
  return {
    instrumentVersionId,
    sections: sections.map((s) => ({
      id: s.id,
      dimensionId: s.dimensionId,
      displayOrder: s.displayOrder,
      questions: s.questions.map((q) => ({
        id: q.id,
        sectionId: q.sectionId,
        options: q.options.map((o) => ({ label: o.label as OptionLabel, score: o.score })),
      })),
    })),
    dimensionBands: dimensionBands.map((b) => ({
      dimensionId: b.dimensionId,
      minScore: b.minScore,
      maxScore: b.maxScore,
      bandLabel: b.bandLabel,
    })),
    overallBands: overallBands.map((b) => ({
      minScore: b.minScore,
      maxScore: b.maxScore,
      bandLabel: b.bandLabel,
    })),
  };
}

async function loadAnswerInputs(
  prisma: PrismaClient,
  sessionId: string,
): Promise<AnswerInput[]> {
  const rows = await prisma.answer.findMany({
    where: { sessionId },
    include: { option: true },
  });
  return rows.map((r) => ({
    questionId: r.questionId,
    optionLabel: r.option.label as OptionLabel,
  }));
}
