// Admin API: edit a Question's stem.
// PATCH /api/admin/questions/[id]  — body: { stem: string }
//
// Answer rows reference this Question by id, so stored results still point
// at the correct question after a stem edit. The scoring remains unchanged.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { resolveAdminActor, canEditGlobalTemplates } from "@/core/auth/admin-context";
import { writeAudit } from "@/core/audit/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({ stem: z.string().min(1).max(2000) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const admin = await resolveAdminActor(prisma, req.headers);
  if (!admin) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canEditGlobalTemplates(admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.question.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.question.update({
    where: { id },
    data: { stem: parsed.data.stem },
  });

  await writeAudit(prisma, {
    actorUserId: admin.id,
    entity: "question",
    entityId: id,
    action: "update",
    before: { stem: existing.stem },
    after: { stem: updated.stem },
  });

  return NextResponse.json({ ok: true, question: updated });
}
