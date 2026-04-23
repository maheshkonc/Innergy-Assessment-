// Admin API: publish an instrument version (set Instrument.currentVersionId).
// POST /api/admin/instruments/[id]/publish  — body: { versionId }
//
// In-flight sessions keep their pinned instrumentVersionId (§11.7); only new
// sessions pick up the published version.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { resolveAdminActor } from "@/core/auth/admin-context";
import { writeAudit } from "@/core/audit/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ versionId: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const admin = await resolveAdminActor(prisma, req);
  if (!admin) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (admin.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }

  const instrument = await prisma.instrument.findUnique({ where: { id } });
  if (!instrument) return NextResponse.json({ error: "not found" }, { status: 404 });

  const version = await prisma.instrumentVersion.findFirst({
    where: { id: parsed.data.versionId, instrumentId: id },
  });
  if (!version) {
    return NextResponse.json({ error: "version does not belong to instrument" }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.instrument.update({
      where: { id },
      data: { currentVersionId: version.id },
    });
    await tx.instrumentVersion.update({
      where: { id: version.id },
      data: { publishedAt: version.publishedAt ?? new Date(), publishedBy: admin.id },
    });
    return u;
  });

  await writeAudit(prisma, {
    actorUserId: admin.id,
    entity: "instrument",
    entityId: id,
    action: "publish",
    before: { currentVersionId: instrument.currentVersionId },
    after: { currentVersionId: updated.currentVersionId },
  });

  return NextResponse.json({ ok: true, instrument: updated });
}
