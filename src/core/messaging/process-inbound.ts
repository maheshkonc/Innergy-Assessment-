// Shared inbound-message processor. Both the Meta and MSG91 webhooks parse
// their provider-specific payloads into an InboundMessage and hand it here.

import type { PrismaClient } from "@prisma/client";
import { resolveTenant } from "@/core/tenancy/resolve";
import { hashPhone } from "@/core/tenancy/phone-hash";
import { handleInbound, type OutboundAction } from "@/core/state-machine/engine";
import { finaliseResults, resendLatestResults } from "@/core/state-machine/results";
import { classifyInputHybrid } from "@/core/safety/classifier";
import { AnthropicProvider } from "@/providers/llm/anthropic";
import { enqueueEscalationNotifications } from "@/core/notifications/create";
import type { InboundMessage, MessagingProvider } from "@/providers/messaging/types";
import { WhisperProvider } from "@/providers/stt/whisper";
import { ElevenLabsProvider } from "@/providers/tts/elevenlabs";
import { resolveMessageTemplate } from "@/core/templates/resolve";
import { renderTemplate } from "@/core/templates/render";
import { log } from "@/core/logger";

// In-memory dedup of already-processed provider message ids. MSG91 in
// particular has been observed re-delivering the same uuid, which replays
// old inputs into whatever state the FSM has since advanced to. A bounded
// Set is enough for dev; prod would move this to Redis.
const SEEN_LIMIT = 5000;
const seenProviderIds = new Set<string>();

function markSeen(id: string): boolean {
  if (!id) return false;
  if (seenProviderIds.has(id)) return true;
  seenProviderIds.add(id);
  if (seenProviderIds.size > SEEN_LIMIT) {
    const first = seenProviderIds.values().next().value;
    if (first) seenProviderIds.delete(first);
  }
  return false;
}

export async function processInboundMessage(
  prisma: PrismaClient,
  provider: MessagingProvider,
  inbound: InboundMessage,
): Promise<void> {
  if (markSeen(inbound.providerMessageId)) {
    log.info(
      { providerMessageId: inbound.providerMessageId },
      "inbound dedup: skipping repeat delivery",
    );
    return;
  }

  const tenant = await resolveTenant(prisma, {
    toPhone: inbound.toPhone,
    messageText: inbound.text,
    referralPayload: inbound.referralPayload,
  });
  if (!tenant) {
    log.warn({ providerMessageId: inbound.providerMessageId }, "no tenant match");
    await provider.sendText({
      toPhone: inbound.fromPhone,
      body:
        "Sorry — I couldn't identify which organisation you're coming from. " +
        "Please scan the QR code shared by your company to get started.",
    });
    return;
  }

  const phoneHash = hashPhone(inbound.fromPhone);
  const user = await prisma.user.upsert({
    where: { tenantId_whatsappPhoneHash: { tenantId: tenant.id, whatsappPhoneHash: phoneHash } },
    update: { lastSeenAt: new Date() },
    create: { tenantId: tenant.id, whatsappPhoneHash: phoneHash },
  });

  let text = inbound.text?.trim() ?? "";
  let voiceTranscript: string | undefined;
  if (inbound.kind === "voice" && inbound.voiceMediaId) {
    if (!process.env.OPENAI_API_KEY) {
      log.warn({ tenantId: tenant.id, userId: user.id }, "STT disabled: OPENAI_API_KEY missing");
      await provider.sendText({
        toPhone: inbound.fromPhone,
        body: "Voice messages aren't supported yet in this environment — please reply by text.",
      });
      return;
    }
    try {
      const audio = await provider.downloadMedia(inbound.voiceMediaId);
      const stt = new WhisperProvider();
      const { text: transcript, latencyMs } = await stt.transcribe(audio, "audio/ogg");
      voiceTranscript = transcript;
      text = transcript;
      log.info(
        { tenantId: tenant.id, userId: user.id, chars: transcript.length, latencyMs },
        "voice transcribed",
      );
      if (!transcript) {
        await provider.sendText({
          toPhone: inbound.fromPhone,
          body: "Sorry — I couldn't hear that clearly. Could you try again, or type your answer?",
        });
        return;
      }
    } catch (err) {
      log.error({ err, tenantId: tenant.id, userId: user.id }, "voice transcription failed");
      await provider.sendText({
        toPhone: inbound.fromPhone,
        body: "Sorry — I had trouble with that voice note. Could you try again, or type your answer?",
      });
      return;
    }
  }

  const llm = process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : null;
  const safety = await classifyInputHybrid(text, llm);
  if (safety.triggered) {
    const active = await prisma.session.findFirst({
      where: { userId: user.id, status: "in_progress" },
    });
    if (active) {
      await prisma.session.update({
        where: { id: active.id },
        data: { status: "escalated", fsmState: { state: "escalated" }, whatsappPhone: null },
      });
    }
    await sendTemplatedText(provider, prisma, tenant, inbound.fromPhone, "safe_handoff");
    const { created } = await enqueueEscalationNotifications(prisma, {
      tenantId: tenant.id,
      userId: user.id,
      sessionId: active?.id,
      matchedPhrase: safety.matched,
      rawInputSnippet: text,
    });
    log.warn(
      { tenantId: tenant.id, userId: user.id, matched: safety.matched, notificationsCreated: created },
      "safety triggered",
    );
    return;
  }

  const upper = text.toUpperCase();
  if (upper === "VOICE ON" || upper === "VOICE OFF") {
    await prisma.user.update({
      where: { id: user.id },
      data: { voiceMode: upper === "VOICE ON" ? "on" : "off" },
    });
    await provider.sendText({
      toPhone: inbound.fromPhone,
      body: upper === "VOICE ON" ? "Voice mode ON." : "Voice mode OFF.",
    });
    return;
  }

  let session = await prisma.session.findFirst({
    where: { tenantId: tenant.id, userId: user.id, status: "in_progress" },
  });

  // RESULTS command: returning user requesting their prior readout.
  // Must be handled before new-session creation — otherwise "RESULTS" after
  // a completed session spawns a fresh welcome flow (PRD §11.10).
  if (!session && upper === "RESULTS") {
    const { actions } = await resendLatestResults(prisma, { tenant: tenant as never, user: user as never });
    if (actions.length > 0) {
      await executeActions(prisma, provider, inbound.fromPhone, actions, { tenant, user });
      return;
    }
    // Fall through to new-session if they have no prior result.
  }

  if (!session) {
    const ti = await prisma.tenantInstrument.findFirst({ where: { tenantId: tenant.id } });
    if (!ti) {
      log.error({ tenantId: tenant.id }, "tenant has no instrument assigned");
      return;
    }
    session = await prisma.session.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        instrumentVersionId: ti.instrumentVersionId,
        status: "in_progress",
        fsmState: { state: "welcome" },
        whatsappPhone: inbound.fromPhone,
      },
    });
    await sendWelcomeSequence(prisma, provider, tenant, inbound.fromPhone);
    // Welcome sequence ends with an explicit "Reply YES to start, or LATER"
    // prompt — wait for the user's next message instead of consuming the
    // trigger ("Hi", "START", etc.) as a YES and jumping ahead.
    return;
  }

  const result = await handleInbound(prisma, {
    tenant,
    user,
    session,
    text,
    voiceTranscript,
    inputWasVoice: inbound.kind === "voice",
  });

  await prisma.session.update({
    where: { id: session.id },
    data: {
      fsmState: JSON.parse(JSON.stringify(result.newContext)),
      lastMessageAt: new Date(),
      ...(result.terminalStatus
        ? { status: result.terminalStatus, completedAt: new Date(), whatsappPhone: null }
        : {}),
    },
  });

  await executeActions(prisma, provider, inbound.fromPhone, result.actions, { tenant, user });

  if (result.newContext.state === "computing") {
    const finalised = await finaliseResults(prisma, {
      tenant,
      user,
      session: { ...session, fsmState: result.newContext as unknown as object } as typeof session,
    });
    await executeActions(prisma, provider, inbound.fromPhone, finalised.actions, { tenant, user });
    await prisma.session.update({
      where: { id: session.id },
      data: { fsmState: { state: "debrief_cta" } },
    });
  }
}

async function sendTemplatedText(
  provider: MessagingProvider,
  db: PrismaClient,
  tenant: { id: string; name: string },
  toPhone: string,
  key: string,
) {
  const tpl = await resolveMessageTemplate(db, { key, tenantId: tenant.id });
  if (!tpl) {
    log.error({ tenantId: tenant.id, key }, "template missing");
    return;
  }
  const coachJoin = await db.tenantCoach.findFirst({
    where: { tenantId: tenant.id, isPrimary: true },
    include: { coach: true },
  });
  const body = renderTemplate(
    tpl.body,
    {
      tenant_name: tenant.name,
      coach_name: coachJoin?.coach.name ?? "",
      coach_booking_url: coachJoin?.coach.bookingUrl ?? "",
      coach_linkedin_url: coachJoin?.coach.linkedinUrl ?? "",
    },
    { templateKey: key, allowMissing: true },
  );
  await provider.sendText({ toPhone, body });
}

async function sendWelcomeSequence(
  db: PrismaClient,
  provider: MessagingProvider,
  tenant: { id: string; name: string },
  toPhone: string,
) {
  const coachJoin = await db.tenantCoach.findFirst({
    where: { tenantId: tenant.id, isPrimary: true },
    include: { coach: true },
  });
  const vars = {
    name_or_there: "there",
    tenant_name: tenant.name,
    coach_name: coachJoin?.coach.name ?? "",
    dimension_names_list: "Cognitive Clarity, Relational Influence, Inner Mastery",
    duration_estimate: "10–12 minutes",
    question_count: 25,
  };

  for (const key of ["welcome_1", "welcome_2", "welcome_3"] as const) {
    const tpl = await resolveMessageTemplate(db, { key, tenantId: tenant.id });
    if (!tpl) {
      log.error({ tenantId: tenant.id, key }, "welcome template missing — check seed");
      continue;
    }
    const body = renderTemplate(tpl.body, vars, { templateKey: key, allowMissing: true });
    await provider.sendText({ toPhone, body });
  }
}

async function executeActions(
  prisma: PrismaClient,
  provider: MessagingProvider,
  toPhone: string,
  actions: OutboundAction[],
  ctx?: {
    tenant: { id: string; name: string };
    user: { id: string; voiceMode?: "on" | "off" };
  },
) {
  for (const a of actions) {
    try {
      switch (a.kind) {
        case "text":
          await provider.sendText({ toPhone, body: a.body });
          break;
        case "voice_if_enabled":
          if (ctx?.user.voiceMode !== "on") break;
          if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
            log.warn("voice_if_enabled requested but ElevenLabs not configured; skipping");
            break;
          }
          try {
            const tts = new ElevenLabsProvider();
            const { audio, mime } = await tts.synthesise(a.body);
            const mediaId = await provider.uploadMedia(audio, mime);
            await provider.sendVoice({ toPhone, mediaId });
          } catch (err) {
            log.error({ err }, "TTS send failed; leaving text-only");
          }
          break;
        case "delay_ms":
          await new Promise((r) => setTimeout(r, Math.min(a.ms, 5000)));
          break;
        case "image_results_circle": {
          const base = process.env.APP_BASE_URL;
          if (!base) {
            log.warn({ resultId: a.resultId }, "APP_BASE_URL not set; skipping results image");
            break;
          }
          const imageUrl = `${base.replace(/\/$/, "")}/api/image/result/${a.resultId}`;
          await provider.sendImage({ toPhone, imageUrl });
          break;
        }
        case "resend_latest_results": {
          if (!ctx) {
            log.warn("resend_latest_results requested without tenant/user context");
            break;
          }
          const { actions: resendActions } = await resendLatestResults(prisma, {
            tenant: ctx.tenant as never,
            user: ctx.user as never,
          });
          if (resendActions.length === 0) {
            await provider.sendText({
              toPhone,
              body: "No results on file yet — reply YES to take the assessment.",
            });
          } else {
            await executeActions(prisma, provider, toPhone, resendActions, ctx);
          }
          break;
        }
        case "log_invalid":
          log.info({ reason: a.reason }, "invalid input");
          break;
      }
    } catch (err) {
      // A single action failure (e.g. provider sendImage against an unsupported
      // media shape) must not abort the rest of the batch — the debrief CTA
      // that follows the results circle is more important than the image.
      log.error({ err, actionKind: a.kind }, "outbound action failed; continuing");
    }
  }
}
