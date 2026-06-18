// Admin API: reorder a section or a question by swapping displayOrder with its
// adjacent sibling.
//   POST /api/admin/questions/reorder
//   body: { kind: "section" | "question", id: string, direction: "up" | "down" }
//
// Sections are siblings within an instrumentVersion; questions are siblings
// within a section. Scoring is unaffected — Answer rows reference questions by
// id and each question keeps its section/dimension. In-progress sessions track
// the current question by displayOrder, so reordering can shift what someone
// mid-assessment sees next (the Questions page shows an in-progress warning).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/client";
import { resolveAdminActor, canEditGlobalTemplates } from "@/core/auth/admin-context";
import { writeAudit } from "@/core/audit/write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["section", "question"]),
  id: z.string().min(1),
  direction: z.enum(["up", "down"]),
});

export async function POST(req: NextRequest) {
  const admin = await resolveAdminActor(prisma, req);
  if (!admin) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!canEditGlobalTemplates(admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad request", issues: parsed.error.issues }, { status: 400 });
  }
  const { kind, id, direction } = parsed.data;

  // Load the row + its sibling set (same parent scope).
  const current =
    kind === "section"
      ? await prisma.section.findUnique({ where: { id } })
      : await prisma.question.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const siblings =
    kind === "section"
      ? await prisma.section.findMany({
          where: { instrumentVersionId: (current as { instrumentVersionId: string }).instrumentVersionId },
          orderBy: { displayOrder: "asc" },
        })
      : await prisma.question.findMany({
          where: { sectionId: (current as { sectionId: string }).sectionId },
          orderBy: { displayOrder: "asc" },
        });

  const idx = siblings.findIndex((s) => s.id === id);
  const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= siblings.length) {
    // Already at the edge — nothing to do.
    return NextResponse.json({ ok: true, noop: true });
  }
  const neighbor = siblings[neighborIdx]!;

  const a = current.displayOrder;
  const b = neighbor.displayOrder;

  // Swap via a temporary value to dodge the @@unique(parent, displayOrder)
  // constraint, all in one transaction.
  if (kind === "section") {
    await prisma.$transaction([
      prisma.section.update({ where: { id }, data: { displayOrder: -1 } }),
      prisma.section.update({ where: { id: neighbor.id }, data: { displayOrder: a } }),
      prisma.section.update({ where: { id }, data: { displayOrder: b } }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.question.update({ where: { id }, data: { displayOrder: -1 } }),
      prisma.question.update({ where: { id: neighbor.id }, data: { displayOrder: a } }),
      prisma.question.update({ where: { id }, data: { displayOrder: b } }),
    ]);
  }

  await writeAudit(prisma, {
    actorUserId: admin.id,
    entity: kind,
    entityId: id,
    action: "update",
    before: { displayOrder: a },
    after: { displayOrder: b },
  });

  return NextResponse.json({ ok: true });
}
