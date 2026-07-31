// Section band cutoffs, derived from percentages rather than written out per
// instrument.
//
// The four tiers are defined by share of the section's OWN maximum:
//
//   Strong        above 75%
//   Developing    50% up to and including 75%
//   At Risk       25% up to but not including 50%
//   Critical Gap  below 25%
//
// Sections run to different maxima — 25 / 30 / 20 on the team diagnostic,
// 38 / 45 / 40 on the individual one — so fixed raw cutoffs made the same
// label mean different things depending on which section you were reading.
// Deriving them from one rule keeps "Developing" comparable everywhere.
//
// Ranges are contiguous by construction: each band's ceiling is the next
// band's floor minus one, so no score can fall between two bands.

export interface SectionBandCopy {
  strong: string;
  developing: string;
  atRisk: string;
  critical: string;
}

export interface SectionBand {
  minScore: number;
  maxScore: number;
  bandLabel: string;
  colorHex: string;
  interpretationTemplate: string;
}

export function percentageSectionBands(
  maxScore: number,
  copy: SectionBandCopy,
): SectionBand[] {
  // ceil on the inclusive floors and floor+1 on the exclusive one, so a score
  // landing exactly on 75% reads Developing and exactly on 50% or 25% reads
  // the higher of the two bands that meet there.
  const atRiskFloor = Math.ceil(maxScore * 0.25);
  const developingFloor = Math.ceil(maxScore * 0.5);
  const strongFloor = Math.floor(maxScore * 0.75) + 1;

  return [
    {
      minScore: strongFloor,
      maxScore,
      bandLabel: "Strong",
      colorHex: "#16a34a",
      interpretationTemplate: copy.strong,
    },
    {
      minScore: developingFloor,
      maxScore: strongFloor - 1,
      bandLabel: "Developing",
      colorHex: "#eab308",
      interpretationTemplate: copy.developing,
    },
    {
      minScore: atRiskFloor,
      maxScore: developingFloor - 1,
      bandLabel: "At Risk",
      colorHex: "#f97316",
      interpretationTemplate: copy.atRisk,
    },
    {
      // Floored at 0 rather than the section's real minimum. A band lookup
      // that matches no row throws, and the old fixtures floored Critical Gap
      // at 5 on a section whose true minimum was 4.
      minScore: 0,
      maxScore: atRiskFloor - 1,
      bandLabel: "Critical Gap",
      colorHex: "#dc2626",
      interpretationTemplate: copy.critical,
    },
  ];
}
