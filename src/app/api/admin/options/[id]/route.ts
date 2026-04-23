// Admin API: edit an Option's score and/or text.
// PATCH /api/admin/options/[id]  — body: { score?: number; text?: string }
//
// Changes apply to future sessions and to any in-flight session's final
// compute. Past Result rows are immutable (scores stored at finalise time).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { resolveAdminActor, canEditGlobalTemplates } from "@/core/auth/admin-context";
import { writeAudit } from "@/core/audit/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z
  .object({
    score: z.number().int().min(0).max(100).optional(),
    text: z.string().min(1).max(500).optional(),
  })
  .refine((v) => v.score !== undefined || v.text !== undefined, {
    message: "provide at least one of score or text",
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const admin = await resolveAdminActor(prisma, req);
  if (!admin) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canEditGlobalTemplates(admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = PatchBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.option.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: { score?: number; text?: string } = {};
  if (parsed.data.score !== undefined) data.score = parsed.data.score;
  if (parsed.data.text !== undefined) data.text = parsed.data.text;

  const updated = await prisma.option.update({ where: { id }, data });

  await writeAudit(prisma, {
    actorUserId: admin.id,
    entity: "option",
    entityId: id,
    action: "update",
    before: { score: existing.score, text: existing.text },
    after: { score: updated.score, text: updated.text },
  });

  return NextResponse.json({ ok: true, option: updated });
}
