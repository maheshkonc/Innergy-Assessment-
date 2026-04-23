// Admin API: upsert a feature flag for a tenant.
// PUT /api/admin/feature-flags  — body: { tenantId, key, value }

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { resolveAdminActor, canEditTenantTemplates } from "@/core/auth/admin-context";
import { writeAudit } from "@/core/audit/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutBody = z.object({
  tenantId: z.string().min(1),
  key: z.string().min(1).max(80),
  value: z.string().max(200),
});

export async function PUT(req: NextRequest) {
  const admin = await resolveAdminActor(prisma, req.headers);
  if (!admin) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = PutBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }
  const { tenantId, key, value } = parsed.data;

  if (!canEditTenantTemplates(admin, tenantId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const before = await prisma.featureFlag.findUnique({
    where: { tenantId_key: { tenantId, key } },
  });
  const after = await prisma.featureFlag.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, value },
    update: { value },
  });

  await writeAudit(prisma, {
    actorUserId: admin.id,
    entity: "feature_flag",
    entityId: after.id,
    action: before ? "update" : "create",
    before: before ? { value: before.value } : null,
    after: { value: after.value },
  });

  return NextResponse.json({ ok: true, flag: after });
}
