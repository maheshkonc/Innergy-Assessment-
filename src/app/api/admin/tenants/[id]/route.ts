// Admin API: edit tenant basics. PATCH /api/admin/tenants/[id]
// Writes an audit_log row with before/after diff.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { resolveAdminActor, canEditTenantTemplates } from "@/core/auth/admin-context";
import { writeAudit } from "@/core/audit/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(120).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  linkedinUrl: z.string().url().nullable().optional(),
  closingMessage: z.string().max(2000).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const admin = await resolveAdminActor(prisma, req);
  if (!admin) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canEditTenantTemplates(admin, id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.tenant.update({ where: { id }, data: parsed.data });

  await writeAudit(prisma, {
    actorUserId: admin.id,
    entity: "tenant",
    entityId: id,
    action: "update",
    before: pickDiffFields(existing),
    after: pickDiffFields(updated),
  });

  return NextResponse.json({ ok: true, tenant: updated });
}

function pickDiffFields(t: { name: string; primaryColor: string | null; secondaryColor: string | null; linkedinUrl: string | null; closingMessage: string | null }) {
  return {
    name: t.name,
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    linkedinUrl: t.linkedinUrl,
    closingMessage: t.closingMessage,
  };
}
