// Coach-notification worker (FR-9.1/9.2). Delivers coaching-interest and
// escalation notifications via email or WhatsApp with 3-attempt retry.
//
// Channel routing:
//   - whatsapp: via WhatsAppCloudProvider.sendText to the coach's
//     notificationAddress (E.164).
//   - email: SMTP send (if configured) — when not configured the worker
//     logs the composed message and marks the row sent. This keeps the
//     end-to-end flow testable without live SMTP creds.

import type { Notification } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { log } from "../core/logger";
import { WhatsAppCloudProvider } from "../providers/messaging/whatsapp";

const MAX_ATTEMPTS = 3;

interface EnrichedPayload {
  userName: string | null;
  organisation: string | null;
  cognitive: { score: number; band: string } | null;
  relational: { score: number; band: string } | null;
  inner: { score: number; band: string } | null;
  overall: { score: number; band: string } | null;
  generatedAt: string | null;
}

async function tick() {
  const pending = await prisma.notification.findMany({
    where: { status: "pending", attempts: { lt: MAX_ATTEMPTS } },
    take: 25,
    orderBy: { createdAt: "asc" },
  });

  const provider = new WhatsAppCloudProvider();

  for (const n of pending) {
    try {
      const enriched = await enrich(n);
      await deliver(provider, n, enriched);
      const mergedPayload = {
        ...(n.payload as object),
        enriched: enriched as unknown as Prisma.JsonObject,
      } as Prisma.InputJsonObject;
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          payload: mergedPayload,
        },
      });
      log.info({ notificationId: n.id, type: n.type, channel: n.channel }, "notification sent");
    } catch (err) {
      const attempts = n.attempts + 1;
      const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          attempts,
          status,
          lastError: err instanceof Error ? err.message : String(err),
        },
      });
      log.error({ err, notificationId: n.id, attempts }, "notification delivery failed");
    }
  }
}

async function enrich(n: Notification): Promise<EnrichedPayload | null> {
  if (!n.userId || !n.sessionId) return null;
  const [user, result] = await Promise.all([
    prisma.user.findUnique({ where: { id: n.userId } }),
    prisma.result.findUnique({ where: { sessionId: n.sessionId } }),
  ]);
  return {
    userName: user?.firstName ?? null,
    organisation: user?.organisation ?? null,
    cognitive: result && { score: result.cognitiveScore, band: result.cognitiveBand },
    relational: result && { score: result.relationalScore, band: result.relationalBand },
    inner: result && { score: result.innerScore, band: result.innerBand },
    overall: result && { score: result.overallScore, band: result.overallBand },
    generatedAt: result?.generatedAt.toISOString() ?? null,
  };
}

async function deliver(
  provider: WhatsAppCloudProvider,
  n: Notification,
  enriched: EnrichedPayload | null,
): Promise<void> {
  const address = await resolveRecipient(n);
  if (!address) {
    throw new Error(`no recipient address resolved for notification ${n.id}`);
  }
  const body = renderBody(n, enriched);

  if (n.channel === "whatsapp") {
    await provider.sendText({ toPhone: address, body });
    return;
  }

  // Email: SMTP optional in V1. When unconfigured we log and succeed so
  // the end-to-end flow is exercisable without live creds. When SMTP is
  // wired, replace this branch with the real send.
  if (!process.env.SMTP_HOST) {
    log.info(
      { notificationId: n.id, to: address, body: body.slice(0, 200) },
      "email notification (SMTP not configured; logging only)",
    );
    return;
  }
  // Real SMTP send would go here; throwing for now so the failure path
  // is honest once SMTP_HOST is set but the send fails.
  throw new Error("SMTP delivery not implemented");
}

async function resolveRecipient(n: Notification): Promise<string | null> {
  // Coach-addressed: use the coach's notificationAddress (email or E.164
  // depending on the coach's configured channel).
  if (n.coachId) {
    const coach = await prisma.coach.findUnique({ where: { id: n.coachId } });
    return coach?.notificationAddress ?? null;
  }
  // Super admin or other payload-addressed: read from payload.recipient.
  const payload = n.payload as { recipient?: { email?: string; phone?: string } } | null;
  const r = payload?.recipient;
  if (!r) return null;
  return r.email ?? r.phone ?? null;
}

function renderBody(n: Notification, enriched: EnrichedPayload | null): string {
  if (n.type === "escalation") {
    const payload = n.payload as { matchedPhrase?: string; rawInputSnippet?: string } | null;
    const who = enriched?.userName ? `${enriched.userName}${enriched.organisation ? ` (${enriched.organisation})` : ""}` : "a user";
    return [
      `Safety escalation — ${who}`,
      payload?.matchedPhrase ? `Matched phrase: "${payload.matchedPhrase}"` : null,
      payload?.rawInputSnippet ? `Message: "${payload.rawInputSnippet}"` : null,
      `Session: ${n.sessionId ?? "(none)"}`,
      "Please review and reach out per the safe-handoff protocol.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  // coaching_interest (and fallback for digest): include scores if available.
  const who = enriched?.userName ? `${enriched.userName}${enriched.organisation ? ` (${enriched.organisation})` : ""}` : "A leader";
  const scoreLine = enriched?.overall
    ? `Overall: ${enriched.overall.score} · ${enriched.overall.band}`
    : null;
  const dimLine = enriched?.cognitive && enriched.relational && enriched.inner
    ? `CC ${enriched.cognitive.score}·${enriched.cognitive.band} / RI ${enriched.relational.score}·${enriched.relational.band} / IM ${enriched.inner.score}·${enriched.inner.band}`
    : null;
  return [
    `${who} has requested a coaching conversation.`,
    scoreLine,
    dimLine,
    "The booking link has been sent to them; you'll see them on the calendar or hear from them directly.",
  ]
    .filter(Boolean)
    .join("\n");
}

// Exports for tests — not called by the worker loop itself.
export const __internal = { tick, enrich, deliver, resolveRecipient, renderBody };

async function main() {
  log.info("notifications worker started");
  while (true) {
    try {
      await tick();
    } catch (err) {
      log.error({ err }, "notifications tick failed");
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

// Only run the loop when invoked directly via `tsx src/workers/notifications.ts`.
// Keeps the module importable from tests without starting the loop.
const isEntry = Boolean(
  process.argv[1] && /notifications\.ts$/.test(process.argv[1]),
);
if (isEntry) {
  main().catch((err) => {
    log.error({ err }, "notifications worker crashed");
    process.exit(1);
  });
}

