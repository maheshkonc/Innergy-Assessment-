// State machine engine — the orchestrator for a single inbound message.
//
// Philosophy: the engine decides WHAT to say next given current state + input.
// It does NOT talk to WhatsApp directly. Side effects are expressed as an
// ordered list of `OutboundAction`s returned from handleInbound(), which the
// caller (the webhook handler) then executes against the MessagingProvider.
// This keeps the engine pure-ish and testable.

import type { PrismaClient, Session, Tenant, User } from "@prisma/client";
import { renderTemplate, TemplateError } from "../templates/render";
import { resolveMessageTemplate } from "../templates/resolve";
import { normaliseOptionReply } from "../scoring/normalise";
import type { FsmContext, FsmState } from "./types";

export type OutboundAction =
  | { kind: "text"; body: string }
  | { kind: "voice_if_enabled"; body: string }  // caller decides based on flag
  | { kind: "image_results_circle"; resultId: string }
  | { kind: "resend_latest_results" }           // caller re-sends the last stored result
  | { kind: "delay_ms"; ms: number }
  | { kind: "log_invalid"; reason: string };

export interface HandleInboundInput {
  tenant: Tenant;
  user: User;
  session: Session;
  text: string;                    // normalised inbound text (post-STT if voice)
  voiceTranscript?: string;        // raw transcript, for confirm flows
  inputWasVoice: boolean;
}

export interface HandleInboundResult {
  actions: OutboundAction[];
  newContext: FsmContext;
  // If the machine advanced to a terminal state, set this so the webhook
  // can persist the session update.
  terminalStatus?: "completed" | "abandoned" | "escalated";
}

export async function handleInbound(
  prisma: PrismaClient,
  input: HandleInboundInput,
): Promise<HandleInboundResult> {
  const ctx = (input.session.fsmState as unknown as FsmContext) ?? { state: "welcome" };
  const actions: OutboundAction[] = [];

  switch (ctx.state) {
    case "welcome":
    case "later_reminder":
      // Returning after LATER is treated as a fresh welcome — if they say
      // YES/anything-positive we advance; if they say LATER again we just
      // re-ack. PRD §11.9: user can resume anytime.
      return handleWelcome(prisma, input, ctx, actions);
    case "ask_name":
      return handleAskName(prisma, input, ctx, actions);
    case "ask_org":
      return handleAskOrg(prisma, input, ctx, actions);
    case "question":
      return handleQuestion(prisma, input, ctx, actions);
    case "debrief_cta":
      return handleDebriefCta(prisma, input, ctx, actions);
    case "coaching_interest":
      return handleCoachingInterest(prisma, input, ctx, actions);
    case "results":
    case "closed":
      return handlePostFlow(prisma, input, ctx, actions);
    default:
      // Not yet implemented for some states; default to "no-op" so we don't crash.
      actions.push({ kind: "log_invalid", reason: `unhandled state ${ctx.state}` });
      return { actions, newContext: ctx };
  }
}

// -------------------------------------------------------------------------
// Handlers — each returns { actions, newContext } for its state.
// -------------------------------------------------------------------------

async function handleWelcome(
  prisma: PrismaClient,
  input: HandleInboundInput,
  _ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const reply = input.text.trim().toLowerCase();
  // Explicit defer keeps the defined off-ramp (PRD §6 later_ack path).
  if (/^(later|l|not\s*now|no|nope)\b/.test(reply)) {
    const body = await render(prisma, "later_ack", input.tenant, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "later_reminder" } };
  }
  // Anything else — "yes", "hi", "hello", "ready", "start", etc. — the user
  // already opted in by sending a message after the QR scan, so advance.
  const body = await render(prisma, "ask_name", input.tenant, {});
  actions.push({ kind: "text", body });
  return { actions, newContext: { state: "ask_name" } };
}

async function handleAskName(
  prisma: PrismaClient,
  input: HandleInboundInput,
  _ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const name = sanitiseFreeText(input.text);
  if (!name) {
    const body = await render(prisma, "invalid_answer", input.tenant, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "ask_name" } };
  }

  // Voice path: confirm before storing (FR-10.3).
  if (input.inputWasVoice) {
    const body = await render(prisma, "voice_confirm_name", input.tenant, {
      heard: input.voiceTranscript ?? name,
    });
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "confirm_name", pendingName: name } };
  }

  await prisma.user.update({ where: { id: input.user.id }, data: { firstName: name } });
  const body = await render(prisma, "ask_organisation", input.tenant, { name });
  actions.push({ kind: "text", body });
  return { actions, newContext: { state: "ask_org" } };
}

async function handleAskOrg(
  prisma: PrismaClient,
  input: HandleInboundInput,
  _ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const org = sanitiseFreeText(input.text);
  if (!org) {
    const body = await render(prisma, "invalid_answer", input.tenant, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "ask_org" } };
  }
  await prisma.user.update({ where: { id: input.user.id }, data: { organisation: org } });
  const name = input.user.firstName ?? org;

  // PDF step 3 close-out: "Perfect. Let's begin, [Name]."
  const ack = await render(prisma, "org_ack", input.tenant, { name }, { allowMissing: true });
  actions.push({ kind: "text", body: ack });

  // Kick off the diagnostic: send section-1 intro, then the first question.
  const firstSection = await prisma.section.findFirst({
    where: { instrumentVersionId: input.session.instrumentVersionId, displayOrder: 1 },
  });
  if (firstSection) {
    const intro = await render(prisma, firstSection.introTemplateKey, input.tenant, {});
    actions.push({ kind: "text", body: intro });
    actions.push({ kind: "voice_if_enabled", body: intro });
  }

  await enqueueQuestion(prisma, input, 1, actions);
  return { actions, newContext: { state: "question", currentQuestionIndex: 1 } };
}

async function handleQuestion(
  prisma: PrismaClient,
  input: HandleInboundInput,
  ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const idx = ctx.currentQuestionIndex ?? 1;
  const questions = await loadOrderedQuestions(prisma, input.session.instrumentVersionId);
  const q = questions[idx - 1];
  if (!q) {
    actions.push({ kind: "log_invalid", reason: "question index out of range" });
    return { actions, newContext: ctx };
  }

  const label = normaliseOptionReply(input.text);
  if (!label) {
    const body = await render(prisma, "invalid_answer", input.tenant, {});
    actions.push({ kind: "log_invalid", reason: `cannot parse ${input.text}` }, { kind: "text", body });
    return { actions, newContext: ctx };
  }

  const option = q.options.find((o) => o.label === label);
  if (!option) {
    const body = await render(prisma, "invalid_answer", input.tenant, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: ctx };
  }

  await prisma.answer.upsert({
    where: { sessionId_questionId: { sessionId: input.session.id, questionId: q.id } },
    update: {
      optionId: option.id,
      rawInput: input.text,
      rawInputType: input.inputWasVoice ? "voice" : "text",
      voiceTranscript: input.voiceTranscript ?? null,
    },
    create: {
      sessionId: input.session.id,
      questionId: q.id,
      optionId: option.id,
      rawInput: input.text,
      rawInputType: input.inputWasVoice ? "voice" : "text",
      voiceTranscript: input.voiceTranscript ?? null,
    },
  });

  const isLast = idx === questions.length;
  if (!isLast) {
    const nextIdx = idx + 1;
    const next = questions[nextIdx - 1]!;
    if (next.sectionId !== q.sectionId) {
      const section = await prisma.section.findUnique({ where: { id: next.sectionId } });
      if (section) {
        const intro = await render(prisma, section.introTemplateKey, input.tenant, {});
        actions.push({ kind: "text", body: intro });
        actions.push({ kind: "voice_if_enabled", body: intro });
      }
    }
    await enqueueQuestion(prisma, input, nextIdx, actions);
    return { actions, newContext: { ...ctx, state: "question", currentQuestionIndex: nextIdx } };
  }

  // Last question answered — move to computing.
  const calcBody = await render(
    prisma,
    "calculating",
    input.tenant,
    {
      total_questions: questions.length,
      name: input.user.firstName ?? "there",
    },
    { allowMissing: true },
  );
  actions.push({ kind: "text", body: calcBody });
  actions.push({ kind: "delay_ms", ms: 2500 });
  return { actions, newContext: { ...ctx, state: "computing" } };
}

async function handleDebriefCta(
  prisma: PrismaClient,
  input: HandleInboundInput,
  ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const reply = input.text.trim().toLowerCase();
  const isYes = reply === "yes" || reply === "y";
  const bodyKey = isYes ? "coaching_yes" : "coaching_no";
  const body = await render(prisma, bodyKey, input.tenant, {});
  actions.push({ kind: "text", body });

  // Follow with coaching-interest prompt regardless (FR-8.3).
  const prompt = await render(prisma, "coaching_interest_prompt", input.tenant, {});
  actions.push({ kind: "text", body: prompt });
  return { actions, newContext: { ...ctx, state: "coaching_interest" } };
}

async function handleCoachingInterest(
  prisma: PrismaClient,
  input: HandleInboundInput,
  ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const reply = input.text.trim().toLowerCase();
  const isYes = reply === "yes" || reply === "y";

  if (isYes) {
    // Enqueue a coach-notification job. The notifications worker picks it up.
    await prisma.notification.create({
      data: {
        tenantId: input.tenant.id,
        userId: input.user.id,
        sessionId: input.session.id,
        type: "coaching_interest",
        channel: "email", // overridden from tenant config in the worker
        payload: {},
        status: "pending",
      },
    });
  }

  // PDF step 15: send a YES / NO acknowledgement before the closing message.
  const interestKey = isYes ? "coaching_interest_yes" : "coaching_interest_no";
  const interestAck = await render(
    prisma,
    interestKey,
    input.tenant,
    { name: input.user.firstName ?? "there" },
    { allowMissing: true },
  );
  actions.push({ kind: "text", body: interestAck });

  const closing = await render(
    prisma,
    "closing",
    input.tenant,
    { name: input.user.firstName ?? "there" },
    { allowMissing: true },
  );
  actions.push({ kind: "text", body: closing });
  return {
    actions,
    newContext: { ...ctx, state: "closed" },
    terminalStatus: "completed",
  };
}

async function handlePostFlow(
  _prisma: PrismaClient,
  input: HandleInboundInput,
  ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const reply = input.text.trim().toUpperCase();
  if (reply === "RESULTS") {
    actions.push({ kind: "resend_latest_results" });
  }
  return { actions, newContext: ctx };
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function sanitiseFreeText(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned.length < 1 || cleaned.length > 120) return null;
  return cleaned;
}

async function enqueueQuestion(
  prisma: PrismaClient,
  input: HandleInboundInput,
  index: number,
  actions: OutboundAction[],
) {
  const questions = await loadOrderedQuestions(prisma, input.session.instrumentVersionId);
  const q = questions[index - 1];
  if (!q) return;
  const optByLabel = Object.fromEntries(q.options.map((o) => [o.label, o.text]));

  const section = await prisma.section.findUnique({
    where: { id: q.sectionId },
    include: { dimension: true },
  });
  // PDF shows per-section counter (e.g. "Q1 of 8") rather than global.
  const sectionQuestions = questions.filter((x) => x.sectionId === q.sectionId);
  const questionInSection = sectionQuestions.findIndex((x) => x.id === q.id) + 1;

  const body = await render(prisma, "question_body", input.tenant, {
    question_number: questionInSection,
    question_count: sectionQuestions.length,
    section_name: section?.dimension.name ?? "",
    stem: q.stem,
    option_a: optByLabel.A ?? "",
    option_b: optByLabel.B ?? "",
    option_c: optByLabel.C ?? "",
    option_d: optByLabel.D ?? "",
  });
  actions.push({ kind: "text", body });
}

async function loadOrderedQuestions(prisma: PrismaClient, instrumentVersionId: string) {
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
  return sections.flatMap((s) => s.questions);
}

async function render(
  prisma: PrismaClient,
  key: string,
  tenant: Tenant,
  extraVars: Record<string, string | number>,
  opts: { allowMissing?: boolean } = {},
): Promise<string> {
  const tpl = await resolveMessageTemplate(prisma, { key, tenantId: tenant.id });
  if (!tpl) throw new TemplateError(`no template for key=${key}`, { templateKey: key });
  const base = await buildBaseVars(prisma, tenant);
  return renderTemplate(tpl.body, { ...base, ...extraVars }, { templateKey: key, allowMissing: opts.allowMissing });
}

async function buildBaseVars(prisma: PrismaClient, tenant: Tenant) {
  // Coach is looked up fresh each render so edits propagate immediately.
  const coachJoin = await prisma.tenantCoach.findFirst({
    where: { tenantId: tenant.id, isPrimary: true },
    include: { coach: true },
  });
  return {
    tenant_name: tenant.name,
    coach_name: coachJoin?.coach.name ?? "",
    coach_booking_url: coachJoin?.coach.bookingUrl ?? "",
    coach_linkedin_url: coachJoin?.coach.linkedinUrl ?? tenant.linkedinUrl ?? "",
    name_or_there: "there",
    duration_estimate: "10–12 minutes",
    dimension_names_list: "Section 1, Section 2, Section 3",
    question_count: 25,
  } as Record<string, string | number>;
}
