// Audit-log writer (PRD §11.12). Every content/config edit MUST call this
// with a before/after diff so the admin audit page shows a full history.

import type { AuditAction, PrismaClient } from "@prisma/client";

export interface WriteAuditArgs {
  actorUserId: string;
  entity: string;          // e.g. "message_template"
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(
  prisma: PrismaClient,
  args: WriteAuditArgs,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: args.actorUserId,
      entity: args.entity,
      entityId: args.entityId,
      action: args.action,
      before: (args.before ?? null) as never,
      after: (args.after ?? null) as never,
    },
  });
}
