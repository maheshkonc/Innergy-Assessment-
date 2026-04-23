// Web chat API — drives the same FSM that WhatsApp drives, but returns
// structured JSON (actions + widget hint) instead of calling a messaging
// provider. Cookie-based anonymous identity (see core/web-session/identity).
//
// Contract (POST):
//   request:  { text?: string, tenantSlug?: string }
//   response: {
//     sessionId, state, actions: [{kind:"text"|"image", body?, imageUrl?}],
//     widget: { kind, ...fields }
//   }
// Empty/absent text on the first call bootstraps: creates the user +
// session, returns the welcome messages + the "welcome" widget.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/db/client";
import { readOrMintWebId } from "@/core/web-session/identity";
import { handleInbound, type OutboundAction } from "@/core/state-machine/engine";
import { finaliseResults, resendLatestResults } from "@/core/state-machine/results";
import { resolveMessageTemplate } from "@/core/templates/resolve";
import { renderTemplate } from "@/core/templates/render";
import type { FsmContext } from "@/core/state-machine/types";
import type { Prisma, Session, Tenant, User } from "@prisma/client";
import { log } from "@/core/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WebAction {
  kind: "text" | "image";
  body?: string;
  imageUrl?: string;
}

type Widget =
  | { kind: "welcome" }
  | { kind: "text_input"; placeholder: string }
  | {
      kind: "question";
      questionNumber: number;
      total: number;
      sectionName: string;
      stem: string;
      options: Array<{ label: "A" | "B" | "C" | "D"; text: string }>;
    }
  | { kind: "yes_no"; context: "debrief_cta" | "coaching_interest" }
  | {
      kind: "results";
      resultId: string;
      imageUrl: string;
      overall: { score: number; maxScore: number; band: string };
      dimensions: Array<{ name: string; score: number; maxScore: number; band: string }>;
    }
  | { kind: "closed"; message: string }
  | { kind: "unsupported"; state: string };

interface ChatResponse {
  sessionId: string;
  state: string;
  actions: WebAction[];
  widget: Widget;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    tenantSlug?: string;
    reset?: boolean;
  };
  const identity = readOrMintWebId(req);

  const tenant = await resolveTenant(body.tenantSlug);
  if (!tenant) {
    return NextResponse.json({ error: "no tenant configured" }, { status: 503 });
  }

  const user = await prisma.user.upsert({
    where: {
      tenantId_whatsappPhoneHash: {
        tenantId: tenant.id,
        whatsappPhoneHash: identity.userHash,
      },
    },
    update: { lastSeenAt: new Date() },
    create: { tenantId: tenant.id, whatsappPhoneHash: identity.userHash },
  });

  // Explicit restart: abandon any in-progress session and fall through to
  // the new-session branch below.
  if (body.reset) {
    await prisma.session.updateMany({
      where: { tenantId: tenant.id, userId: user.id, status: "in_progress" },
      data: { status: "abandoned", abandonedAt: new Date(), whatsappPhone: null },
    });
  }

  let session = await prisma.session.findFirst({
    where: { tenantId: tenant.id, userId: user.id, status: "in_progress" },
  });

  const actions: OutboundAction[] = [];

  // --- Bootstrap: first call, no in-progress session yet ---
  if (!session) {
    const ti = await prisma.tenantInstrument.findFirst({ where: { tenantId: tenant.id } });
    if (!ti) {
      return NextResponse.json({ error: "tenant has no instrument assigned" }, { status: 500 });
    }
    session = await prisma.session.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        instrumentVersionId: ti.instrumentVersionId,
        status: "in_progress",
        fsmState: { state: "welcome" } as unknown as Prisma.InputJsonValue,
      },
    });
    actions.push(...(await renderWelcomeActions(tenant)));

    const resp: ChatResponse = {
      sessionId: session.id,
      state: "welcome",
      actions: toWebActions(actions),
      widget: { kind: "welcome" },
    };
    return withCookie(NextResponse.json(resp), identity.setCookie);
  }

  // --- Step the FSM when we have text ---
  const text = (body.text ?? "").trim();
  let newContext = session.fsmState as unknown as FsmContext;
  let terminalStatus: "completed" | "abandoned" | "escalated" | undefined;

  if (text) {
    const result = await handleInbound(prisma, {
      tenant,
      user,
      session,
      text,
      inputWasVoice: false,
    });
    actions.push(...result.actions);
    newContext = result.newContext;
    terminalStatus = result.terminalStatus;

    await prisma.session.update({
      where: { id: session.id },
      data: {
        fsmState: JSON.parse(JSON.stringify(newContext)) as Prisma.InputJsonValue,
        lastMessageAt: new Date(),
        ...(terminalStatus
          ? { status: terminalStatus, completedAt: new Date() }
          : {}),
      },
    });

    if (newContext.state === "computing") {
      const finalised = await finaliseResults(prisma, { tenant, user, session });
      actions.push(...finalised.actions);
      newContext = { state: "debrief_cta" };
      await prisma.session.update({
        where: { id: session.id },
        data: {
          fsmState: JSON.parse(JSON.stringify(newContext)) as Prisma.InputJsonValue,
        },
      });
    }
  } else {
    // Resuming a mid-flow session (page reload, browser restored). The
    // client's chat thread is empty on reload — re-hydrate it with the
    // prompt for the current state so the widget below makes sense.
    actions.push(...(await renderResumeActions(tenant, user, session, newContext)));
  }

  // Expand any resend_latest_results action (e.g. closed state RESULTS command)
  const expanded: OutboundAction[] = [];
  for (const a of actions) {
    if (a.kind === "resend_latest_results") {
      const { actions: resendActions } = await resendLatestResults(prisma, { tenant, user });
      expanded.push(...resendActions);
    } else {
      expanded.push(a);
    }
  }

  const widget = await buildWidget(prisma, tenant, user, session, newContext);

  // Avoid duplicating the question in the chat thread when the widget is
  // already rendering it structurally. The FSM's question_body template
  // ends up in `actions` as a text bubble; drop it when we hand the client
  // a `question` widget.
  const chatActions = widget.kind === "question"
    ? expanded.filter((a) => !(a.kind === "text" && a.body.includes(widget.stem)))
    : expanded;

  const resp: ChatResponse = {
    sessionId: session.id,
    state: newContext.state,
    actions: toWebActions(chatActions),
    widget,
  };
  return withCookie(NextResponse.json(resp), identity.setCookie);
}

// ----------------- helpers -----------------

async function resolveTenant(slug?: string): Promise<Tenant | null> {
  if (slug) {
    return prisma.tenant.findUnique({ where: { slug } });
  }
  return prisma.tenant.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
  });
}

async function renderResumeActions(
  tenant: Tenant,
  user: User,
  session: Session,
  ctx: FsmContext,
): Promise<OutboundAction[]> {
  const out: OutboundAction[] = [];
  const baseVars = await buildBaseVars(tenant);

  const pushTemplate = async (key: string, extra: Record<string, string | number> = {}) => {
    const tpl = await resolveMessageTemplate(prisma, { key, tenantId: tenant.id });
    if (!tpl) return;
    out.push({
      kind: "text",
      body: renderTemplate(tpl.body, { ...baseVars, ...extra }, { templateKey: key, allowMissing: true }),
    });
  };

  switch (ctx.state) {
    case "welcome":
    case "later_reminder":
      // Re-emit the full welcome so returning users get the full context,
      // not a naked widget.
      out.push(...(await renderWelcomeActions(tenant)));
      break;

    case "ask_name":
      await pushTemplate("ask_name");
      break;

    case "ask_org":
      await pushTemplate("ask_organisation", { name: user.firstName ?? "" });
      break;

    case "question": {
      const idx = ctx.currentQuestionIndex ?? 1;
      const questions = await prisma.section.findMany({
        where: { instrumentVersionId: session.instrumentVersionId },
        orderBy: { displayOrder: "asc" },
        include: {
          dimension: true,
          questions: { orderBy: { displayOrder: "asc" } },
        },
      });
      const flat = questions.flatMap((s) => s.questions.map((q) => ({ q, sectionKey: s.introTemplateKey, sectionId: s.id })));
      const target = flat[idx - 1];
      if (target) {
        // If they're at the first question of a section, show the section intro.
        const atSectionStart =
          idx === 1 ||
          (flat[idx - 2] && flat[idx - 2]!.sectionId !== target.sectionId);
        if (atSectionStart) {
          await pushTemplate(target.sectionKey);
        }
      }
      break;
    }

    case "debrief_cta": {
      const res = await prisma.result.findFirst({
        where: { tenantId: tenant.id, userId: user.id },
        orderBy: { generatedAt: "desc" },
      });
      if (res) {
        const stored = res.interpretationJson as {
          overallNarrative?: string;
          lowestDimensionName?: string;
        };
        if (stored.overallNarrative) {
          out.push({ kind: "text", body: stored.overallNarrative });
        }
        await pushTemplate("debrief_cta_1", {
          lowest_dimension_name: stored.lowestDimensionName ?? "",
        });
        await pushTemplate("debrief_cta_2");
      }
      break;
    }

    case "coaching_interest":
      await pushTemplate("coaching_interest_prompt");
      break;

    case "closed":
    case "results":
      await pushTemplate("closing", { name: user.firstName ?? "there" });
      break;
  }
  return out;
}

async function buildBaseVars(tenant: Tenant): Promise<Record<string, string | number>> {
  const coachJoin = await prisma.tenantCoach.findFirst({
    where: { tenantId: tenant.id, isPrimary: true },
    include: { coach: true },
  });
  return {
    tenant_name: tenant.name,
    coach_name: coachJoin?.coach.name ?? "",
    coach_booking_url: coachJoin?.coach.bookingUrl ?? "",
    coach_linkedin_url: coachJoin?.coach.linkedinUrl ?? "",
    name_or_there: "there",
    duration_estimate: "10–12 minutes",
    dimension_names_list: "Section 1, Section 2, Section 3",
    question_count: 25,
  };
}

async function renderWelcomeActions(tenant: Tenant): Promise<OutboundAction[]> {
  const coachJoin = await prisma.tenantCoach.findFirst({
    where: { tenantId: tenant.id, isPrimary: true },
    include: { coach: true },
  });
  const vars = {
    name_or_there: "there",
    tenant_name: tenant.name,
    coach_name: coachJoin?.coach.name ?? "",
    dimension_names_list: "Section 1, Section 2, Section 3",
    duration_estimate: "10–12 minutes",
    question_count: 25,
  };
  const out: OutboundAction[] = [];
  for (const key of ["welcome_1", "welcome_2", "welcome_3"] as const) {
    const tpl = await resolveMessageTemplate(prisma, { key, tenantId: tenant.id });
    if (!tpl) {
      log.error({ key, tenantId: tenant.id }, "welcome template missing");
      continue;
    }
    out.push({
      kind: "text",
      body: renderTemplate(tpl.body, vars, { templateKey: key, allowMissing: true }),
    });
  }
  return out;
}

async function buildWidget(
  db: typeof prisma,
  tenant: Tenant,
  user: User,
  session: Session,
  ctx: FsmContext,
): Promise<Widget> {
  switch (ctx.state) {
    case "welcome":
    case "later_reminder":
      return { kind: "welcome" };

    case "ask_name":
      return { kind: "text_input", placeholder: "Your first name" };

    case "ask_org":
      return { kind: "text_input", placeholder: "Your organisation" };

    case "question": {
      const idx = ctx.currentQuestionIndex ?? 1;
      const questions = await loadOrderedQuestions(db, session.instrumentVersionId);
      const q = questions[idx - 1];
      if (!q) return { kind: "unsupported", state: ctx.state };
      return {
        kind: "question",
        questionNumber: idx,
        total: questions.length,
        sectionName: q.sectionName,
        stem: q.stem,
        options: q.options,
      };
    }

    case "debrief_cta":
      return { kind: "yes_no", context: "debrief_cta" };

    case "coaching_interest":
      return { kind: "yes_no", context: "coaching_interest" };

    case "closed":
    case "results": {
      const res = await db.result.findFirst({
        where: { tenantId: tenant.id, userId: user.id },
        orderBy: { generatedAt: "desc" },
      });
      if (!res) return { kind: "closed", message: "Session ended." };
      const bands = await db.dimensionBand.findMany({
        where: { instrumentVersionId: res.instrumentVersionId },
        include: { dimension: true },
      });
      const maxFor = (name: string) =>
        bands.filter((b) => b.dimension.name === name).reduce((m, b) => Math.max(m, b.maxScore), 0);
      const ccMax = maxFor("Section 1");
      const riMax = maxFor("Section 2");
      const imMax = maxFor("Section 3");
      const base = process.env.APP_BASE_URL ?? "";
      return {
        kind: "results",
        resultId: res.id,
        imageUrl: `${base.replace(/\/$/, "")}/api/image/result/${res.id}`,
        overall: {
          score: res.overallScore,
          maxScore: ccMax + riMax + imMax,
          band: res.overallBand,
        },
        dimensions: [
          { name: "Section 1", score: res.cognitiveScore, maxScore: ccMax, band: res.cognitiveBand },
          { name: "Section 2", score: res.relationalScore, maxScore: riMax, band: res.relationalBand },
          { name: "Section 3", score: res.innerScore, maxScore: imMax, band: res.innerBand },
        ],
      };
    }

    default:
      return { kind: "unsupported", state: ctx.state };
  }
}

async function loadOrderedQuestions(db: typeof prisma, instrumentVersionId: string) {
  const sections = await db.section.findMany({
    where: { instrumentVersionId },
    orderBy: { displayOrder: "asc" },
    include: {
      dimension: true,
      questions: {
        orderBy: { displayOrder: "asc" },
        include: { options: { orderBy: { displayOrder: "asc" } } },
      },
    },
  });
  return sections.flatMap((s) =>
    s.questions.map((q) => ({
      id: q.id,
      stem: q.stem,
      sectionName: s.dimension.name,
      options: q.options.map((o) => ({ label: o.label as "A" | "B" | "C" | "D", text: o.text })),
    })),
  );
}

function toWebActions(actions: OutboundAction[]): WebAction[] {
  const out: WebAction[] = [];
  for (const a of actions) {
    if (a.kind === "text") out.push({ kind: "text", body: a.body });
    else if (a.kind === "image_results_circle") {
      const base = process.env.APP_BASE_URL ?? "";
      out.push({ kind: "image", imageUrl: `${base.replace(/\/$/, "")}/api/image/result/${a.resultId}` });
    }
    // voice_if_enabled / delay_ms / log_invalid / resend_latest_results are ignored for web
  }
  return out;
}

function withCookie(res: NextResponse, cookie?: string): NextResponse {
  if (cookie) res.headers.append("Set-Cookie", cookie);
  return res;
}
