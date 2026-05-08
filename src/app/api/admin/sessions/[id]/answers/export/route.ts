// GET /api/admin/sessions/[id]/answers/export
// Returns CSV of one session's answers (one row per question).

import { prisma } from "@/db/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminCookie } from "@/core/auth/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = [
  "QuestionNumber",
  "Dimension",
  "Question",
  "OptionLabel",
  "OptionText",
  "OptionScore",
  "RawInput",
  "RawInputType",
  "AnsweredAt",
] as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sessionCookie = (await cookies()).get("innergy_admin")?.value;
  if (!sessionCookie || !verifyAdminCookie(sessionCookie)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      user: true,
      answers: {
        orderBy: { answeredAt: "asc" },
        include: {
          option: true,
          question: { include: { section: { include: { dimension: true } } } },
        },
      },
    },
  });

  if (!session) {
    return new NextResponse("Not found", { status: 404 });
  }

  const rows = session.answers.map((a) => [
    a.question.displayOrder,
    a.question.section.dimension.name,
    a.question.stem,
    a.option.label,
    a.option.text,
    a.option.score,
    a.rawInput,
    a.rawInputType,
    a.answeredAt.toISOString(),
  ]);

  const csv = [COLUMNS, ...rows].map(toCsvRow).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (session.user.firstName ?? "session").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const filename = `innergy-answers-${slug}-${session.id}-${stamp}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function toCsvRow(values: readonly (string | number)[]): string {
  return values.map(escapeCell).join(",");
}

function escapeCell(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
