// GET /api/admin/sessions/export?ids=a,b,c
// Returns CSV of session results. Omit `ids` to export every session.

import { prisma } from "@/db/client";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminCookie } from "@/core/auth/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = [
  "SessionId",
  "Tenant",
  "Participant",
  "Email",
  "Organisation",
  "Status",
  "AnswersAnswered",
  "StartedAt",
  "LastMessageAt",
  "OverallScore",
  "OverallBand",
  "CognitiveScore",
  "CognitiveBand",
  "RelationalScore",
  "RelationalBand",
  "InnerScore",
  "InnerBand",
] as const;

export async function GET(req: NextRequest) {
  const sessionCookie = (await cookies()).get("innergy_admin")?.value;
  if (!sessionCookie || !verifyAdminCookie(sessionCookie)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam
    ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const sessions = await prisma.session.findMany({
    where: ids && ids.length > 0 ? { id: { in: ids } } : undefined,
    orderBy: { lastMessageAt: "desc" },
    include: {
      user: true,
      tenant: true,
      result: true,
      _count: { select: { answers: true } },
    },
  });

  const rows = sessions.map((s) => [
    s.id,
    s.tenant.name,
    s.user.firstName ?? "",
    s.user.email ?? "",
    s.user.organisation ?? "",
    s.status,
    `${s._count.answers}/25`,
    s.startedAt.toISOString(),
    s.lastMessageAt.toISOString(),
    s.result?.overallScore ?? "",
    s.result?.overallBand ?? "",
    s.result?.cognitiveScore ?? "",
    s.result?.cognitiveBand ?? "",
    s.result?.relationalScore ?? "",
    s.result?.relationalBand ?? "",
    s.result?.innerScore ?? "",
    s.result?.innerBand ?? "",
  ]);

  const csv = [COLUMNS, ...rows].map(toCsvRow).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  const scope = ids && ids.length > 0 ? `selected-${ids.length}` : "all";
  const filename = `innergy-results-${scope}-${stamp}.csv`;

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
