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

// Palette-aligned fallback colour ramp for band labels. Used when a
// DimensionBand row has no `bandColorHex` (the V1 Innergy seed leaves them
// null so we don't hardcode chart colours inside migrations).
const BAND_COLORS: Record<string, string> = {
  "critical gap": "#C84A4A",
  "at risk": "#EA5E5E",
  developing: "#E5B04A",
  strong: "#4A7D5C",
  "ai-ready": "#4A7D5C",
  "partially ready": "#E5B04A",
  "developing readiness": "#EA8A4E",
  "high risk": "#C84A4A",
};
const DEFAULT_COLOR = "#8A7868";

function fallbackColor(bandLabel: string): string {
  return BAND_COLORS[bandLabel.trim().toLowerCase()] ?? DEFAULT_COLOR;
}

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

  // Build color-by-dimension-and-band lookup. Falls back to the palette ramp
  // keyed on the band label when the DB row has no explicit colour.
  const colorFor = (dimensionName: string, bandLabel: string): string => {
    const match = dimensionBands.find(
      (b) => b.dimension.name === dimensionName && b.bandLabel === bandLabel,
    );
    return match?.bandColorHex ?? fallbackColor(bandLabel);
  };

  const maxFor = (dimensionName: string): number => {
    const rows = dimensionBands.filter((b) => b.dimension.name === dimensionName);
    return rows.reduce((m, r) => Math.max(m, r.maxScore), 0);
  };

  const segments: CircleSegment[] = [
    {
      label: "Section 1",
      shortLabel: "CC",
      score: result.cognitiveScore,
      maxScore: maxFor("Section 1"),
      bandLabel: result.cognitiveBand,
      colorHex: "#36211B", // Brand Dark Brown
    },
    {
      label: "Section 2",
      shortLabel: "RI",
      score: result.relationalScore,
      maxScore: maxFor("Section 2"),
      bandLabel: result.relationalBand,
      colorHex: "#FF3F64", // Brand Pink
    },
    {
      label: "Section 3",
      shortLabel: "IM",
      score: result.innerScore,
      maxScore: maxFor("Section 3"),
      bandLabel: result.innerBand,
      colorHex: "#FFDE59", // Brand Yellow
    },
  ];

  const png = await renderResultsCircle(segments, { title: result.tenant.name });
  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
