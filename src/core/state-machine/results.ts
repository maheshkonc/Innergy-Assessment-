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
import { getInstrumentCopy, resolveVariantTemplate } from "../templates/variant";
import { renderTemplate } from "../templates/render";
import type { LLMProvider } from "../../providers/llm/types";
import type { OutboundAction } from "./engine";
import { getContactPosition } from "./engine";
import { enqueueUserReportNotification } from "../notifications/create";
import { BAND_CUTOFFS } from "../../db/seed/fixtures/section-bands";
import { log } from "../logger";
import {
  DIMENSION_TAGS,
  loadDimensionsByTag,
  tagForStoredName,
  type DimensionTag,
} from "../dimensions";

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

  const copy = await getInstrumentCopy(prisma, session.instrumentVersionId);
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

  // Keyed on internalTag — display names are editable content.
  const dims = await loadDimensionsByTag(prisma);
  const forTag = (tag: DimensionTag) =>
    score.dimensions.find((d) => dims[tag]?.id === d.dimensionId)!;
  const cog = forTag("cognitive");
  const rel = forTag("relational");
  const inner = forTag("inner");

  const balanceAnalysis = await renderBalanceAnalysis(prisma, {
    tenantId: tenant.id,
    variant: copy.variant,
    dimensions: score.dimensions,
    nameById: new Map(
      interpretation.perDimension.map((d) => [d.dimensionId, d.dimensionName]),
    ),
    lowestDimensionId: score.lowestDimensionId,
  });

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
        // Stored so a resumed session re-renders the same sentence rather
        // than recomputing (or silently dropping) it.
        balanceAnalysis,
      },
    },
  });

  // Build outbound messages.
  const actions: OutboundAction[] = [];
  for (const d of interpretation.perDimension) {
    const tpl = await resolveVariantTemplate(prisma, {
      key: "dimension_result",
      tenantId: tenant.id,
      variant: copy.variant,
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

  const overallTpl = await resolveVariantTemplate(prisma, {
    key: "overall_result",
    tenantId: tenant.id,
    variant: copy.variant,
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
    balance_analysis: balanceAnalysis,
  };
  const cta1 = await resolveVariantTemplate(prisma, { key: "debrief_cta_1", tenantId: tenant.id, variant: copy.variant });
  const cta2 = await resolveVariantTemplate(prisma, { key: "debrief_cta_2", tenantId: tenant.id, variant: copy.variant });
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
  // When the contact step runs AFTER the results, the email isn't known yet
  // (and any email on the user row would be stale from a prior run), so the
  // enqueue is deferred to handleAskEmail. Otherwise the email is already
  // captured — re-fetch the user to read it (the `user` arg may be stale).
  const position = await getContactPosition(prisma, tenant.id);
  if (position !== "after_results") {
    const freshUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (freshUser?.email) {
      try {
        await enqueueUserReportNotification(prisma, {
          tenantId: tenant.id,
          userId: user.id,
          sessionId: session.id,
          email: freshUser.email,
        });
      } catch (err) {
        log.error({ err, sessionId: session.id }, "failed to enqueue user_report email");
      }
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

  const dims = await loadDimensionsByTag(prisma);

  const actions: OutboundAction[] = [];

  // Pinned to the instrument the result was produced on, so a re-send of an
  // older team result still renders team copy.
  const copy = await getInstrumentCopy(prisma, result.instrumentVersionId);
  const dimTpl = await resolveVariantTemplate(prisma, {
    key: "dimension_result",
    tenantId: tenant.id,
    variant: copy.variant,
  });
  const overallTpl = await resolveVariantTemplate(prisma, {
    key: "overall_result",
    tenantId: tenant.id,
    variant: copy.variant,
  });

  const scoreByTag: Record<DimensionTag, number> = {
    cognitive: result.cognitiveScore,
    relational: result.relationalScore,
    inner: result.innerScore,
  };
  const bandByTag: Record<DimensionTag, string> = {
    cognitive: result.cognitiveBand,
    relational: result.relationalBand,
    inner: result.innerBand,
  };
  const stats: Record<DimensionTag, { score: number; max: number; band: string }> =
    {} as Record<DimensionTag, { score: number; max: number; band: string }>;
  for (const tag of DIMENSION_TAGS) {
    stats[tag] = {
      score: scoreByTag[tag],
      max: await maxForDimension(prisma, result.instrumentVersionId, dims[tag]?.id),
      band: bandByTag[tag],
    };
  }

  if (dimTpl && stored.perDimension) {
    for (const d of stored.perDimension) {
      // Results generated before the dimension rename stored "Section 1/2/3".
      const tag = tagForStoredName(d.dimensionName, dims);
      if (!tag) continue;
      const s = stats[tag];
      const body = renderTemplate(
        dimTpl.body,
        {
          dimension_name: dims[tag]?.name ?? d.dimensionName,
          score: s.score,
          max_score: s.max,
          band_label: s.band,
          interpretation: d.narrative,
        },
        { templateKey: "dimension_result" },
      );
      actions.push({ kind: "text", body });
      actions.push({ kind: "voice_if_enabled", body });
    }
  }

  if (overallTpl) {
    const cc = stats.cognitive;
    const ri = stats.relational;
    const im = stats.inner;
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

/**
 * Builds the debrief CTA's second paragraph from the reader's actual scores.
 *
 * This used to be a fixed illustration ("a team that scores 23 on Cognitive,
 * 21 on Relational and 9 on Inner Mastery…") lifted from the source document.
 * Printed directly beneath the reader's own totals it read as a description of
 * their team, with numbers that contradicted the ones above it.
 *
 * Dimensions are ranked by percentage of their own maximum, never by raw
 * score — the team sections run to 25 / 30 / 20, so Inner Mastery would
 * otherwise look weakest for almost everyone.
 *
 * The branch is on whether the weakest dimension is genuinely WEAK, not on how
 * far apart the three are. Branching on the spread alone claimed a team
 * scoring 88% / 80% / 73% was "waiting to break under pressure" purely because
 * the ends were 15 points apart — while the overall verdict on the same screen
 * read "AI-Ready … the foundation to thrive". Nothing there is a weak point;
 * the sentence was false.
 *
 * "Weak" means below the Developing floor, read from the same cutoffs that
 * draw the bands, so the copy and the band labels can never disagree.
 */

async function renderBalanceAnalysis(
  prisma: PrismaClient,
  args: {
    tenantId: string;
    variant: string;
    dimensions: ReadonlyArray<{ dimensionId: string; score: number; maxScore: number }>;
    nameById: Map<string, string>;
    /** The engine's own pick — see the note below on ties. */
    lowestDimensionId: string;
  },
): Promise<string> {
  const ranked = args.dimensions
    .map((d) => ({ ...d, pct: d.maxScore > 0 ? (d.score / d.maxScore) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const highest = ranked[0];
  // Deliberately the scoring engine's lowestDimensionId rather than the last
  // entry of this ranking. On an exact tie the two disagree — the engine sorts
  // ascending and keeps the first dimension in display order, this sorts
  // descending and would keep the last — and the CTA names the engine's pick
  // one line above. Recomputing it here would contradict that sentence.
  const lowest = ranked.find((d) => d.dimensionId === args.lowestDimensionId);
  if (!highest || !lowest) return "";

  const gapPoints = Math.round(highest.pct - lowest.pct);
  const weakFloor = BAND_CUTOFFS.developing * 100;
  const key =
    lowest.pct >= weakFloor
      // Nothing is a weak point, however far apart the three sit.
      ? "debrief_balance_solid"
      : highest.pct >= weakFloor
        // One dimension trails while the others hold — the source document's
        // "strong in two, weak in the third" case.
        ? "debrief_balance_gap"
        // Every dimension is below the floor; there is no strong pair to
        // contrast the weak one against.
        : "debrief_balance_broad";

  const tpl = await resolveVariantTemplate(prisma, {
    key,
    tenantId: args.tenantId,
    variant: args.variant,
  });
  // Instruments whose copy defines no analysis paragraph (the individual
  // diagnostic) simply render the CTA without one.
  if (!tpl) return "";

  return renderTemplate(
    tpl.body,
    {
      highest_dimension_name: args.nameById.get(highest.dimensionId) ?? "",
      highest_score: highest.score,
      highest_max: highest.maxScore,
      lowest_dimension_name: args.nameById.get(lowest.dimensionId) ?? "",
      lowest_score: lowest.score,
      lowest_max: lowest.maxScore,
      gap_points: gapPoints,
    },
    { templateKey: key },
  );
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
