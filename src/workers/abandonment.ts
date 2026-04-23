// Abandonment worker (FR-3.7 / PRD §11.9). Runs as a separate process.
// Every minute it looks at in-flight sessions and:
//   - at idle >= 24h (no prior reminder), renders the `abandonment_reminder`
//     template and sends it via the MessagingProvider.
//   - at idle >= 72h (reminder + 48h of further silence), closes the session
//     and sends the `session_closed` template.
//
// Kept intentionally simple — a cron-ish loop, not a heavyweight queue.

import type { Session, Tenant, User } from "@prisma/client";
import { prisma } from "../db/client";
import { log } from "../core/logger";
import { resolveMessageTemplate } from "../core/templates/resolve";
import { renderTemplate } from "../core/templates/render";
import { WhatsAppCloudProvider } from "../providers/messaging/whatsapp";
import type { FsmContext } from "../core/state-machine/types";

const HOURS = 60 * 60 * 1000;
const REMINDER_AT = 24 * HOURS;
const CLOSE_AT = 72 * HOURS;

async function tick() {
  const now = Date.now();
  const sessions = await prisma.session.findMany({
    where: { status: "in_progress" },
    include: { tenant: true, user: true },
  });

  const provider = new WhatsAppCloudProvider();

  for (const s of sessions) {
    const idle = now - s.lastMessageAt.getTime();
    try {
      if (idle >= CLOSE_AT) {
        await closeSession(provider, s);
      } else if (idle >= REMINDER_AT) {
        await maybeSendReminder(provider, s, idle);
      }
    } catch (err) {
      log.error({ err, sessionId: s.id }, "abandonment session handling failed");
    }
  }
}

async function maybeSendReminder(
  provider: WhatsAppCloudProvider,
  session: Session & { tenant: Tenant; user: User },
  idleMs: number,
) {
  const already = await prisma.event.findFirst({
    where: { sessionId: session.id, eventType: "abandonment_reminder_sent" },
  });
  if (already) return;

  if (!session.whatsappPhone) {
    log.warn({ sessionId: session.id }, "cannot send reminder: no stored phone");
    return;
  }

  const tpl = await resolveMessageTemplate(prisma, {
    key: "abandonment_reminder",
    tenantId: session.tenantId,
  });
  if (!tpl) {
    log.warn({ sessionId: session.id }, "abandonment_reminder template missing");
    return;
  }

  const ctx = (session.fsmState as unknown as FsmContext) ?? { state: "welcome" };
  const body = renderTemplate(
    tpl.body,
    {
      name: session.user.firstName ?? "there",
      question_number: ctx.currentQuestionIndex ?? 1,
      question_count: 25,
    },
    { templateKey: "abandonment_reminder", allowMissing: true },
  );

  await provider.sendText({ toPhone: session.whatsappPhone, body });
  await prisma.event.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      sessionId: session.id,
      eventType: "abandonment_reminder_sent",
      properties: { idleMs },
    },
  });
  log.info({ sessionId: session.id }, "abandonment reminder sent");
}

async function closeSession(
  provider: WhatsAppCloudProvider,
  session: Session & { tenant: Tenant; user: User },
) {
  if (session.whatsappPhone) {
    const tpl = await resolveMessageTemplate(prisma, {
      key: "session_closed",
      tenantId: session.tenantId,
    });
    if (tpl) {
      const body = renderTemplate(
        tpl.body,
        { name: session.user.firstName ?? "there" },
        { templateKey: "session_closed", allowMissing: true },
      );
      try {
        await provider.sendText({ toPhone: session.whatsappPhone, body });
      } catch (err) {
        log.warn({ err, sessionId: session.id }, "session_closed send failed; closing session anyway");
      }
    }
  }
  await prisma.session.update({
    where: { id: session.id },
    data: { status: "abandoned", abandonedAt: new Date(), whatsappPhone: null },
  });
  log.info({ sessionId: session.id }, "session closed — abandoned");
}

// Exports for tests.
export const __internal = { tick, maybeSendReminder, closeSession };

async function main() {
  log.info("abandonment worker started");
  while (true) {
    try {
      await tick();
    } catch (err) {
      log.error({ err }, "abandonment tick failed");
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

const isEntry = Boolean(
  process.argv[1] && /abandonment\.ts$/.test(process.argv[1]),
);
if (isEntry) {
  main().catch((err) => {
    log.error({ err }, "abandonment worker crashed");
    process.exit(1);
  });
}
