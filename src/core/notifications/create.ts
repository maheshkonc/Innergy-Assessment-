// Notification enqueue helpers. Writes rows to the `notification` table;
// the notifications worker picks them up and delivers.
//
// Two flavours the FSM needs today:
//   - coaching_interest — fired from the FSM coaching_interest branch.
//   - escalation        — fired from the safety classifier; notifies the
//     primary coach AND every super admin in parallel rows.

import type { PrismaClient } from "@prisma/client";

export interface EscalationContext {
  tenantId: string;
  userId: string;
  sessionId?: string;
  matchedPhrase?: string;
  rawInputSnippet: string;
}

/**
 * Creates notification rows for a safety escalation:
 *   - one row addressed to the tenant's primary coach (channel = coach's configured channel)
 *   - one row per super_admin (channel = email)
 *
 * Idempotent per (session, recipient): if an escalation notification for the
 * same session + coach / super admin is already pending/sent, no duplicate is
 * written. This avoids spamming if the user sends multiple triggering messages
 * in a row before the session status is updated.
 */
export async function enqueueEscalationNotifications(
  prisma: PrismaClient,
  ctx: EscalationContext,
): Promise<{ created: number }> {
  const payloadBase = {
    kind: "escalation" as const,
    matchedPhrase: ctx.matchedPhrase ?? null,
    rawInputSnippet: truncate(ctx.rawInputSnippet, 280),
  };

  let created = 0;

  // --- Primary coach ---
  const coachJoin = await prisma.tenantCoach.findFirst({
    where: { tenantId: ctx.tenantId, isPrimary: true },
    include: { coach: true },
  });
  if (coachJoin) {
    const existing = await prisma.notification.findFirst({
      where: {
        tenantId: ctx.tenantId,
        sessionId: ctx.sessionId ?? undefined,
        coachId: coachJoin.coachId,
        type: "escalation",
        status: { in: ["pending", "sent"] },
      },
    });
    if (!existing) {
      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          coachId: coachJoin.coachId,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          type: "escalation",
          channel: coachJoin.coach.notificationChannel,
          payload: {
            ...payloadBase,
            recipient: { kind: "coach", coachId: coachJoin.coachId },
          },
          status: "pending",
        },
      });
      created++;
    }
  }

  // --- Super admins ---
  const superAdmins = await prisma.adminUser.findMany({
    where: { role: "super_admin" },
  });
  for (const admin of superAdmins) {
    const existing = await prisma.notification.findFirst({
      where: {
        tenantId: ctx.tenantId,
        sessionId: ctx.sessionId ?? undefined,
        coachId: null,
        type: "escalation",
        status: { in: ["pending", "sent"] },
        payload: { path: ["recipient", "adminUserId"], equals: admin.id },
      },
    });
    if (!existing) {
      await prisma.notification.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          type: "escalation",
          channel: "email",
          payload: {
            ...payloadBase,
            recipient: { kind: "super_admin", adminUserId: admin.id, email: admin.email },
          },
          status: "pending",
        },
      });
      created++;
    }
  }

  return { created };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
