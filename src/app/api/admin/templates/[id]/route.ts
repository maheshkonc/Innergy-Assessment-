// Admin API: edit a single MessageTemplate row.
// PATCH /api/admin/templates/[id]  — body: { body: string }
//
// Writes an audit_log row with before/after diff (PRD §11.12).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import {
  canEditGlobalTemplates,
  canEditTenantTemplates,
  resolveAdminActor,
} from "@/core/auth/admin-context";
import { writeAudit } from "@/core/audit/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({ body: z.string().min(1).max(8000) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const admin = await resolveAdminActor(prisma, req.headers);
  if (!admin) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const authorised = existing.tenantId === null
    ? canEditGlobalTemplates(admin)
    : canEditTenantTemplates(admin, existing.tenantId);
  if (!authorised) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const updated = await prisma.messageTemplate.update({
    where: { id },
    data: { body: parsed.data.body, updatedBy: admin.id },
  });

  await writeAudit(prisma, {
    actorUserId: admin.id,
    entity: "message_template",
    entityId: id,
    action: "update",
    before: { body: existing.body },
    after: { body: updated.body },
  });

  return NextResponse.json({ ok: true, template: updated });
}
