// GET /api/admin/sessions/export?ids=a,b,c&instrument=<instrumentId>
// Returns CSV of session results. Omit both params to export every session.

import { prisma } from "@/db/client";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminCookie } from "@/core/auth/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = [
  "SessionId",
  "Tenant",
  "Assessment",
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
  const instrumentId = req.nextUrl.searchParams.get("instrument");

  const where: Record<string, unknown> = {};
  if (ids && ids.length > 0) where.id = { in: ids };
  if (instrumentId) where.instrumentVersion = { instrumentId };

  const sessions = await prisma.session.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { lastMessageAt: "desc" },
    include: {
      user: true,
      tenant: true,
      result: true,
      instrumentVersion: { include: { instrument: { select: { name: true } } } },
      _count: { select: { answers: true } },
    },
  });

  // Per-instrument question totals, so the Answers column reads "12/15" on a
  // team session rather than the individual instrument's 25.
  const totals = new Map<string, number>();
  for (const versionId of new Set(sessions.map((s) => s.instrumentVersionId))) {
    totals.set(
      versionId,
      await prisma.question.count({ where: { section: { instrumentVersionId: versionId } } }),
    );
  }

  const rows = sessions.map((s) => [
    s.id,
    s.tenant.name,
    s.instrumentVersion.instrument.name,
    s.user.firstName ?? "",
    s.user.email ?? "",
    s.user.organisation ?? "",
    s.status,
    `${s._count.answers}/${totals.get(s.instrumentVersionId) ?? "?"}`,
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
