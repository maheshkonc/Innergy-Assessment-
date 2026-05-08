// GET /api/admin/analytics?userIds=a,b,c
// Returns aggregated analytics for the supplied users (or all when omitted).

import { prisma } from "@/db/client";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { verifyAdminCookie } from "@/core/auth/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionCookie = (await cookies()).get("innergy_admin")?.value;
  if (!sessionCookie || !verifyAdminCookie(sessionCookie)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const idsParam = req.nextUrl.searchParams.get("userIds");
  const userIds = idsParam
    ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const sessionWhere = userIds && userIds.length > 0 ? { userId: { in: userIds } } : {};
  const resultWhere = userIds && userIds.length > 0 ? { userId: { in: userIds } } : {};

  const [sessions, results, coachingInterestCount] = await Promise.all([
    prisma.session.findMany({
      where: sessionWhere,
      select: {
        id: true,
        userId: true,
        status: true,
        startedAt: true,
        completedAt: true,
        _count: { select: { answers: true } },
      },
    }),
    prisma.result.findMany({
      where: resultWhere,
      select: {
        overallScore: true,
        overallBand: true,
        cognitiveScore: true,
        cognitiveBand: true,
        relationalScore: true,
        relationalBand: true,
        innerScore: true,
        innerBand: true,
        generatedAt: true,
      },
    }),
    prisma.notification.count({
      where: {
        type: "coaching_interest",
        ...(userIds && userIds.length > 0
          ? { session: { userId: { in: userIds } } }
          : {}),
      },
    }),
  ]);

  const overall = results.map((r) => r.overallScore).sort((a, b) => a - b);
  const cognitive = results.map((r) => r.cognitiveScore);
  const relational = results.map((r) => r.relationalScore);
  const inner = results.map((r) => r.innerScore);

  const completed = sessions.filter((s) => s.status === "completed").length;
  const inProgress = sessions.filter((s) => s.status === "in_progress").length;
  const abandoned = sessions.filter((s) => s.status === "abandoned").length;
  const reachedMidway = sessions.filter((s) => s._count.answers >= 13).length;

  const kpis = {
    totalCandidates: new Set(sessions.map((s) => s.userId)).size,
    totalSessions: sessions.length,
    completed,
    completionRate: sessions.length > 0 ? completed / sessions.length : 0,
    avgOverall: avg(overall),
    medianOverall: percentile(overall, 0.5),
    p25Overall: percentile(overall, 0.25),
    p75Overall: percentile(overall, 0.75),
  };

  const histogramOverall = histogram(overall, 0, 130, 10);

  const bands = {
    overall: tally(results.map((r) => r.overallBand)),
    cognitive: tally(results.map((r) => r.cognitiveBand)),
    relational: tally(results.map((r) => r.relationalBand)),
    inner: tally(results.map((r) => r.innerBand)),
  };

  const funnel = [
    { stage: "Started", count: sessions.length },
    { stage: "Reached midway (≥13 answers)", count: reachedMidway },
    { stage: "Completed", count: completed },
    { stage: "Coaching interest", count: coachingInterestCount },
  ];

  const completionsOverTime = bucketByDay(
    results.map((r) => r.generatedAt),
    30,
  );

  const radar = [
    { dimension: "Cognitive", avg: avg(cognitive) ?? 0 },
    { dimension: "Relational", avg: avg(relational) ?? 0 },
    { dimension: "Inner", avg: avg(inner) ?? 0 },
  ];

  return NextResponse.json({
    scope: {
      filtered: !!userIds,
      userIdsCount: userIds?.length ?? null,
      totals: { sessions: sessions.length, results: results.length, abandoned, inProgress },
    },
    kpis,
    histogramOverall,
    bands,
    funnel,
    completionsOverTime,
    radar,
  });
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loV = sortedAsc[lo]!;
  const hiV = sortedAsc[hi]!;
  if (lo === hi) return loV;
  return loV + (hiV - loV) * (idx - lo);
}

function histogram(values: number[], min: number, max: number, binSize: number) {
  const bins: { bin: string; count: number }[] = [];
  for (let lo = min; lo < max; lo += binSize) {
    const hi = lo + binSize - 1;
    bins.push({ bin: `${lo}–${hi}`, count: 0 });
  }
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / binSize), bins.length - 1);
    const bin = bins[idx];
    if (bin) bin.count += 1;
  }
  return bins;
}

function tally(values: string[]): { band: string; count: number }[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return Array.from(m.entries()).map(([band, count]) => ({ band, count }));
}

function bucketByDay(dates: Date[], days: number): { date: string; count: number }[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets: { date: string; count: number }[] = [];
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    buckets.push({ date: dayKey(d), count: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.date, i]));
  for (const dt of dates) {
    const k = dayKey(new Date(dt));
    const i = idx.get(k);
    if (i !== undefined) {
      const b = buckets[i];
      if (b) b.count += 1;
    }
  }
  return buckets;
}
