// Results-circle image endpoint. Given a result id, renders the three-segment
// circle PNG (PRD §5.7) and streams it back. The WhatsApp webhook references
// this URL via APP_BASE_URL so Meta can fetch the image when we send it.
//
// Tenant isolation: the result row's tenantId must match the tenant the
// requester is allowed to see. For the in-app call from the webhook there is
// no session — we treat the resultId as a capability (it's a random cuid,
// unguessable). Admin UI access will layer auth on top.

import { NextResponse } from "next/server";
import { prisma } from "@/db/client";
import { renderResultsCircle, type CircleSegment } from "@/providers/image/results-circle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_COLOR = "#6366f1";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ resultId: string }> },
) {
  const { resultId } = await params;
  const result = await prisma.result.findUnique({
    where: { id: resultId },
    include: { tenant: true, instrumentVersion: true },
  });
  if (!result) return new NextResponse("not found", { status: 404 });

  const dimensionBands = await prisma.dimensionBand.findMany({
    where: { instrumentVersionId: result.instrumentVersionId },
    include: { dimension: true },
  });

  // Build color-by-dimension-and-band lookup.
  const colorFor = (dimensionName: string, bandLabel: string): string => {
    const match = dimensionBands.find(
      (b) => b.dimension.name === dimensionName && b.bandLabel === bandLabel,
    );
    return match?.bandColorHex ?? DEFAULT_COLOR;
  };

  const maxFor = (dimensionName: string): number => {
    const rows = dimensionBands.filter((b) => b.dimension.name === dimensionName);
    return rows.reduce((m, r) => Math.max(m, r.maxScore), 0);
  };

  const segments: CircleSegment[] = [
    {
      label: "Cognitive Clarity",
      shortLabel: "CC",
      score: result.cognitiveScore,
      maxScore: maxFor("Cognitive Clarity"),
      bandLabel: result.cognitiveBand,
      colorHex: colorFor("Cognitive Clarity", result.cognitiveBand),
    },
    {
      label: "Relational Influence",
      shortLabel: "RI",
      score: result.relationalScore,
      maxScore: maxFor("Relational Influence"),
      bandLabel: result.relationalBand,
      colorHex: colorFor("Relational Influence", result.relationalBand),
    },
    {
      label: "Inner Mastery",
      shortLabel: "IM",
      score: result.innerScore,
      maxScore: maxFor("Inner Mastery"),
      bandLabel: result.innerBand,
      colorHex: colorFor("Inner Mastery", result.innerBand),
    },
  ];

  const png = await renderResultsCircle(segments, { title: result.tenant.name });
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
