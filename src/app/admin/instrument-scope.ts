// Shared "which assessment am I looking at?" resolution for admin pages.
//
// The tenant now offers two diagnostics (individual + team), so pages that used
// to call `instrument.findFirst()` would silently show whichever came back
// first. Every such page instead reads `?instrument=<instrumentId>` and falls
// back to the first instrument when the param is absent or unknown.

import { prisma } from "@/db/client";

export interface InstrumentOption {
  id: string;
  name: string;
  audience: string;
  currentVersionId: string | null;
  questionCount: number;
}

export interface InstrumentScope {
  options: InstrumentOption[];
  selected: InstrumentOption | null;
}

function audienceOf(metadata: unknown): string {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  return typeof meta.audience === "string" ? meta.audience : "individual";
}

/** Lists every instrument and resolves the one the page should render. */
export async function resolveInstrumentScope(
  requestedId?: string,
): Promise<InstrumentScope> {
  const instruments = await prisma.instrument.findMany({
    orderBy: { name: "asc" },
    include: {
      currentVersion: {
        select: {
          id: true,
          metadata: true,
          _count: { select: { sections: true } },
        },
      },
    },
  });

  const options: InstrumentOption[] = await Promise.all(
    instruments.map(async (inst) => {
      const questionCount = inst.currentVersion
        ? await prisma.question.count({
          where: { section: { instrumentVersionId: inst.currentVersion.id } },
        })
        : 0;
      return {
        id: inst.id,
        name: inst.name,
        audience: audienceOf(inst.currentVersion?.metadata),
        currentVersionId: inst.currentVersion?.id ?? null,
        questionCount,
      };
    }),
  );

  const selected =
    options.find((o) => o.id === requestedId) ?? options[0] ?? null;

  return { options, selected };
}

/**
 * Maps every instrument *version* to its parent instrument, for pages that
 * start from a Session or Result (which pin a version, not an instrument).
 */
export async function versionToInstrumentName(): Promise<
  Map<string, { instrumentId: string; name: string; audience: string }>
> {
  const versions = await prisma.instrumentVersion.findMany({
    select: {
      id: true,
      metadata: true,
      instrument: { select: { id: true, name: true } },
    },
  });
  return new Map(
    versions.map((v) => [
      v.id,
      {
        instrumentId: v.instrument.id,
        name: v.instrument.name,
        audience: audienceOf(v.metadata),
      },
    ]),
  );
}
