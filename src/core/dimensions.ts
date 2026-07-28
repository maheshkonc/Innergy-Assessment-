// Dimension identity.
//
// `Dimension.name` is editable content (it is shown to users and to admins), so
// nothing may key off it. The stable identifier is `Dimension.internalTag`.
// Both instruments share the same three dimension rows.
//
// This module exists because the display names were originally "Section 1/2/3"
// and a dozen call sites matched on those literals — renaming them to
// "Cognitive Clarity" etc. would have silently broken scoring, results,
// re-sends, the results image and the report email.

import type { PrismaClient } from "@prisma/client";

export const DIMENSION_TAGS = ["cognitive", "relational", "inner"] as const;
export type DimensionTag = (typeof DIMENSION_TAGS)[number];

/**
 * Display names used before the rename. Results generated then still carry
 * these strings inside `interpretationJson.perDimension[].dimensionName`, so
 * anything reading a stored result must accept them.
 */
export const LEGACY_DIMENSION_NAMES: Record<DimensionTag, string> = {
  cognitive: "Section 1",
  relational: "Section 2",
  inner: "Section 3",
};

export interface DimensionRef {
  id: string;
  name: string;
  tag: DimensionTag;
}

export type DimensionsByTag = Record<DimensionTag, DimensionRef | undefined>;

/** Loads the three dimension rows keyed by their stable internalTag. */
export async function loadDimensionsByTag(
  prisma: PrismaClient,
): Promise<DimensionsByTag> {
  const rows = await prisma.dimension.findMany({
    where: { internalTag: { in: [...DIMENSION_TAGS] } },
  });
  const out = {} as DimensionsByTag;
  for (const tag of DIMENSION_TAGS) {
    const row = rows.find((r) => r.internalTag === tag);
    out[tag] = row ? { id: row.id, name: row.name, tag } : undefined;
  }
  return out;
}

/**
 * True when a name stored on an old result refers to this tag — matching the
 * current display name or the pre-rename one.
 */
export function nameMatchesTag(
  storedName: string,
  tag: DimensionTag,
  currentName: string | undefined,
): boolean {
  const n = storedName.trim().toLowerCase();
  return (
    n === (currentName ?? "").trim().toLowerCase() ||
    n === LEGACY_DIMENSION_NAMES[tag].toLowerCase()
  );
}

/** Resolves a stored dimension name back to its tag, tolerating legacy names. */
export function tagForStoredName(
  storedName: string,
  dims: DimensionsByTag,
): DimensionTag | null {
  for (const tag of DIMENSION_TAGS) {
    if (nameMatchesTag(storedName, tag, dims[tag]?.name)) return tag;
  }
  return null;
}
