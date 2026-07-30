// State machine engine — the orchestrator for a single inbound message.
//
// Philosophy: the engine decides WHAT to say next given current state + input.
// It does NOT talk to WhatsApp directly. Side effects are expressed as an
// ordered list of `OutboundAction`s returned from handleInbound(), which the
// caller (the webhook handler) then executes against the MessagingProvider.
// This keeps the engine pure-ish and testable.

import type { PrismaClient, Session, Tenant, User } from "@prisma/client";
import { renderTemplate, TemplateError } from "../templates/render";
import {
  getInstrumentCopy,
  resolveVariantTemplate,
  type InstrumentCopy,
} from "../templates/variant";
import { normaliseOptionReply } from "../scoring/normalise";
import { enqueueUserReportNotification } from "../notifications/create";
import { log } from "../logger";
import { DIMENSION_TAGS, loadDimensionsByTag } from "../dimensions";
import type { FsmContext, FsmState } from "./types";

// Where the name/company/email step sits in the flow. Configured per tenant
// via the `contact_capture_position` feature flag and editable from the admin
// Questions page. Default mirrors the launch flow: details after the
// questions, just before results.
export type ContactPosition =
  | "before_questions"
  | "after_questions"
  | "after_results";

export const DEFAULT_CONTACT_POSITION: ContactPosition = "after_questions";

export async function getContactPosition(
  prisma: PrismaClient,
  tenantId: string,
): Promise<ContactPosition> {
  const flag = await prisma.featureFlag.findUnique({
    where: { tenantId_key: { tenantId, key: "contact_capture_position" } },
  });
  const v = flag?.value;
  if (v === "before_questions" || v === "after_questions" || v === "after_results") {
    return v;
  }
  return DEFAULT_CONTACT_POSITION;
}

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

// The session's instrument decides which copy variant the handlers render.
// Resolved once per inbound message, then passed down.
type FlowInput = HandleInboundInput & { copy: InstrumentCopy };

export async function handleInbound(
  prisma: PrismaClient,
  rawInput: HandleInboundInput,
): Promise<HandleInboundResult> {
  const ctx = (rawInput.session.fsmState as unknown as FsmContext) ?? { state: "welcome" };
  const actions: OutboundAction[] = [];
  const input: FlowInput = {
    ...rawInput,
    copy: await getInstrumentCopy(prisma, rawInput.session.instrumentVersionId),
  };

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
    case "ask_email":
      return handleAskEmail(prisma, input, ctx, actions);
    case "question":
      return handleQuestion(prisma, input, ctx, actions);
    case "debrief_cta":
      return handleDebriefCta(prisma, input, ctx, actions);
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
  input: FlowInput,
  _ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const reply = input.text.trim().toLowerCase();
  // Explicit defer keeps the defined off-ramp (PRD §6 later_ack path).
  if (/^(later|l|not\s*now|no|nope)\b/.test(reply)) {
    const body = await render(prisma, "later_ack", input, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "later_reminder" } };
  }
  // Anything else — "yes", "hi", "hello", "ready", "start", etc. — the user
  // already opted in by sending a message after the QR scan, so advance.
  const position = await getContactPosition(prisma, input.tenant.id);
  if (position === "before_questions") {
    const body = await render(prisma, "ask_name", input, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "ask_name" } };
  }
  // Otherwise details are captured later — go straight into the diagnostic.
  return startDiagnostic(prisma, input, actions);
}

// Sends the first question, advancing to the question state. Shared by the
// welcome handler (start of flow).
//
// Section intros are deliberately not emitted — here or on section change.
// The diagnostic runs as one continuous run of questions so there are no
// breaks in the middle; how to answer is covered once, in the welcome copy,
// and each question already names its own section.
async function startDiagnostic(
  prisma: PrismaClient,
  input: FlowInput,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  await enqueueQuestion(prisma, input, 1, actions);
  return { actions, newContext: { state: "question", currentQuestionIndex: 1 } };
}

async function handleAskName(
  prisma: PrismaClient,
  input: FlowInput,
  _ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const name = sanitiseFreeText(input.text);
  if (!name) {
    const body = await render(prisma, "invalid_answer", input, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "ask_name" } };
  }

  // Voice path: confirm before storing (FR-10.3).
  if (input.inputWasVoice) {
    const body = await render(prisma, "voice_confirm_name", input, {
      heard: input.voiceTranscript ?? name,
    });
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "confirm_name", pendingName: name } };
  }

  await prisma.user.update({ where: { id: input.user.id }, data: { firstName: name } });
  const body = await render(prisma, "ask_organisation", input, { name });
  actions.push({ kind: "text", body });
  return { actions, newContext: { state: "ask_org" } };
}

async function handleAskOrg(
  prisma: PrismaClient,
  input: FlowInput,
  _ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const org = sanitiseFreeText(input.text);
  if (!org) {
    const body = await render(prisma, "invalid_answer", input, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "ask_org" } };
  }
  await prisma.user.update({ where: { id: input.user.id }, data: { organisation: org } });
  const name = input.user.firstName ?? org;
  const body = await render(prisma, "ask_email", input, { name });
  actions.push({ kind: "text", body });
  return { actions, newContext: { state: "ask_email" } };
}

async function handleAskEmail(
  prisma: PrismaClient,
  input: FlowInput,
  _ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const email = sanitiseFreeText(input.text);
  if (!email || !email.includes("@")) {
    const body = await render(prisma, "invalid_answer", input, {});
    actions.push({ kind: "text", body });
    return { actions, newContext: { state: "ask_email" } };
  }
  await prisma.user.update({
    where: { id: input.user.id },
    data: { email } as any
  });
  const name = input.user.firstName ?? "there";
  const position = await getContactPosition(prisma, input.tenant.id);

  // Details captured at the start of the flow: now kick off the diagnostic.
  if (position === "before_questions") {
    return startDiagnostic(prisma, input, actions);
  }

  // Details captured after the results: this is the final step — send the
  // closing message, enqueue the report email (the Result already exists), and
  // complete the session.
  if (position === "after_results") {
    const closing = await render(
      prisma,
      "closing",
      input,
      { name },
      { allowMissing: true },
    );
    actions.push({ kind: "text", body: closing });
    try {
      await enqueueUserReportNotification(prisma, {
        tenantId: input.tenant.id,
        userId: input.user.id,
        sessionId: input.session.id,
        email,
      });
    } catch (err) {
      log.error({ err, sessionId: input.session.id }, "failed to enqueue user_report email");
    }
    return { actions, newContext: { state: "closed" }, terminalStatus: "completed" };
  }

  // Default (after_questions): compute and show the results next (the report
  // email is enqueued in finaliseResults, once the Result row exists).
  const calcBody = await render(
    prisma,
    "calculating",
    input,
    { name },
    { allowMissing: true },
  );
  actions.push({ kind: "text", body: calcBody });
  actions.push({ kind: "delay_ms", ms: 2500 });
  return { actions, newContext: { state: "computing" } };
}

async function handleQuestion(
  prisma: PrismaClient,
  input: FlowInput,
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
    const body = await render(prisma, "invalid_answer", input, {});
    actions.push({ kind: "log_invalid", reason: `cannot parse ${input.text}` }, { kind: "text", body });
    return { actions, newContext: ctx };
  }

  const option = q.options.find((o) => o.label === label);
  if (!option) {
    const body = await render(prisma, "invalid_answer", input, {});
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
    await enqueueQuestion(prisma, input, nextIdx, actions);
    return { actions, newContext: { ...ctx, state: "question", currentQuestionIndex: nextIdx } };
  }

  // Last question answered. If details are captured here (after questions,
  // before results — the default), ask for the name now; the readout becomes
  // the incentive to finish the short form. Otherwise go straight to results.
  const position = await getContactPosition(prisma, input.tenant.id);
  if (position === "after_questions") {
    const askName = await render(prisma, "ask_name", input, {});
    actions.push({ kind: "text", body: askName });
    return { actions, newContext: { state: "ask_name" } };
  }

  const calcBody = await render(
    prisma,
    "calculating",
    input,
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
  input: FlowInput,
  ctx: FsmContext,
  actions: OutboundAction[],
): Promise<HandleInboundResult> {
  const reply = input.text.trim().toLowerCase();
  const isYes = reply === "yes" || reply === "y";
  const bodyKey = isYes ? "coaching_yes" : "coaching_no";
  const body = await render(prisma, bodyKey, input, {});
  actions.push({ kind: "text", body });

  // If details are captured after the results, collect them now (name → org →
  // email); the closing message + report email fire from handleAskEmail.
  const position = await getContactPosition(prisma, input.tenant.id);
  if (position === "after_results") {
    const askName = await render(prisma, "ask_name", input, {});
    actions.push({ kind: "text", body: askName });
    return { actions, newContext: { state: "ask_name" } };
  }

  // Transition to closing message and terminal state.
  const closing = await render(
    prisma,
    "closing",
    input,
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
  input: FlowInput,
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
  input: FlowInput,
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

  const body = await render(prisma, "question_body", input, {
    question_number: questionInSection,
    question_count: sectionQuestions.length,
    section_name: section?.dimension.name ?? "",
    stem: q.stem,
    option_a: optByLabel.A ?? "",
    option_b: optByLabel.B ?? "",
    option_c: optByLabel.C ?? "",
    option_d: optByLabel.D ?? "",
    // Only 5-point Likert instruments carry an E; A–D questions render "".
    option_e: optByLabel.E ?? "",
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
  input: FlowInput,
  extraVars: Record<string, string | number>,
  opts: { allowMissing?: boolean } = {},
): Promise<string> {
  const tpl = await resolveVariantTemplate(prisma, {
    key,
    tenantId: input.tenant.id,
    variant: input.copy.variant,
  });
  if (!tpl) throw new TemplateError(`no template for key=${key}`, { templateKey: key });
  const base = await buildBaseVars(prisma, input.tenant, input.copy);
  return renderTemplate(tpl.body, { ...base, ...extraVars }, { templateKey: key, allowMissing: opts.allowMissing });
}

async function buildBaseVars(prisma: PrismaClient, tenant: Tenant, copy: InstrumentCopy) {
  // Coach is looked up fresh each render so edits propagate immediately.
  const coachJoin = await prisma.tenantCoach.findFirst({
    where: { tenantId: tenant.id, isPrimary: true },
    include: { coach: true },
  });
  const dims = await loadDimensionsByTag(prisma);
  const dimensionNamesList = DIMENSION_TAGS.map((t) => dims[t]?.name)
    .filter(Boolean)
    .join(", ");
  return {
    tenant_name: tenant.name,
    coach_name: coachJoin?.coach.name ?? "",
    coach_booking_url: coachJoin?.coach.bookingUrl ?? "",
    coach_linkedin_url: coachJoin?.coach.linkedinUrl ?? tenant.linkedinUrl ?? "",
    name_or_there: "there",
    // Length/duration come from the instrument version, so the 15-question
    // team diagnostic doesn't advertise the individual one's 25.
    duration_estimate: copy.durationEstimate,
    dimension_names_list: dimensionNamesList,
    question_count: copy.questionCount,
  } as Record<string, string | number>;
}
