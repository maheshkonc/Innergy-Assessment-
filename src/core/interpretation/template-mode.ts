// Template-mode interpretation (PRD §5.5). Looks up the dimension_band and
// overall_band rows for the result and renders their interpretation_template
// strings against the user context.

import type { PrismaClient, Tenant, User } from "@prisma/client";
import type { ScoreResult } from "../scoring/types";
import { renderTemplate } from "../templates/render";

export interface InterpretationOutput {
  perDimension: Array<{ dimensionId: string; dimensionName: string; narrative: string }>;
  overallNarrative: string;
  lowestDimensionId: string;
  lowestDimensionName: string;
}

export async function interpretTemplate(
  prisma: PrismaClient,
  args: { tenant: Tenant; user: User; score: ScoreResult },
): Promise<InterpretationOutput> {
  const { tenant, user, score } = args;

  const dimensionRows = await prisma.dimension.findMany({
    where: { id: { in: score.dimensions.map((d) => d.dimensionId) } },
  });
  const nameById = new Map(dimensionRows.map((d) => [d.id, d.name]));

  const commonVars: Record<string, string | number> = {
    name: user.firstName ?? "",
    organisation: user.organisation ?? "",
    tenant_name: tenant.name,
  };

  const perDimension: InterpretationOutput["perDimension"] = [];
  for (const d of score.dimensions) {
    const band = await prisma.dimensionBand.findFirst({
      where: {
        instrumentVersionId: score.instrumentVersionId,
        dimensionId: d.dimensionId,
        minScore: { lte: d.score },
        maxScore: { gte: d.score },
      },
    });
    if (!band) throw new Error(`No band for ${d.dimensionId} @ ${d.score}`);
    const name = nameById.get(d.dimensionId) ?? d.dimensionId;
    const narrative = renderTemplate(
      band.interpretationTemplate,
      {
        ...commonVars,
        score: d.score,
        max_score: d.maxScore,
        band_label: d.band,
        dimension_name: name,
      },
      { allowMissing: true },
    );
    perDimension.push({ dimensionId: d.dimensionId, dimensionName: name, narrative });
  }

  const overallRow = await prisma.overallBand.findFirst({
    where: {
      instrumentVersionId: score.instrumentVersionId,
      minScore: { lte: score.overallScore },
      maxScore: { gte: score.overallScore },
    },
  });
  if (!overallRow) throw new Error(`No overall band for score=${score.overallScore}`);

  const lowestName = nameById.get(score.lowestDimensionId) ?? score.lowestDimensionId;
  const overallNarrative = renderTemplate(
    overallRow.interpretationTemplate,
    {
      ...commonVars,
      overall_score: score.overallScore,
      overall_max_score: score.overallMaxScore,
      overall_band_label: score.overallBand,
      lowest_dimension_name: lowestName,
    },
    { allowMissing: true },
  );

  return {
    perDimension,
    overallNarrative,
    lowestDimensionId: score.lowestDimensionId,
    lowestDimensionName: lowestName,
  };
}
