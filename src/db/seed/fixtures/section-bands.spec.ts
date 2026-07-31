import { describe, expect, it } from "vitest";
import { percentageSectionBands } from "./section-bands";

const COPY = { strong: "s", developing: "d", atRisk: "a", critical: "c" };

/** The band a raw score falls into, via the same lookup the scoring engine uses. */
function bandFor(maxScore: number, score: number): string | undefined {
  return percentageSectionBands(maxScore, COPY).find(
    (b) => score >= b.minScore && score <= b.maxScore,
  )?.bandLabel;
}

// Every section maximum in the two live instruments.
const MAXIMA = [25, 30, 20, 38, 45, 40];

describe("percentageSectionBands", () => {
  it("covers every reachable score with exactly one band", () => {
    for (const max of MAXIMA) {
      const bands = percentageSectionBands(max, COPY);
      for (let score = 0; score <= max; score++) {
        const hits = bands.filter((b) => score >= b.minScore && score <= b.maxScore);
        expect(hits, `max=${max} score=${score}`).toHaveLength(1);
      }
    }
  });

  it("puts the boundaries where the percentages say", () => {
    for (const max of MAXIMA) {
      // Just above 75% is Strong; exactly 75% is not.
      expect(bandFor(max, Math.floor(max * 0.75) + 1)).toBe("Strong");
      // 50% and 75% both read Developing.
      expect(bandFor(max, Math.ceil(max * 0.5))).toBe("Developing");
      expect(bandFor(max, Math.floor(max * 0.75))).toBe("Developing");
      // 25% reads At Risk, just below it is a Critical Gap.
      expect(bandFor(max, Math.ceil(max * 0.25))).toBe("At Risk");
      expect(bandFor(max, Math.ceil(max * 0.25) - 1)).toBe("Critical Gap");
      // The extremes.
      expect(bandFor(max, max)).toBe("Strong");
      expect(bandFor(max, 0)).toBe("Critical Gap");
    }
  });

  it("bands a section on its own scale, not on raw score", () => {
    // 60% is Developing whether the section runs to 20 or to 45 — the defect
    // the old per-instrument raw cutoffs produced.
    expect(bandFor(20, 12)).toBe("Developing");
    expect(bandFor(45, 27)).toBe("Developing");
    expect(bandFor(38, 23)).toBe("Developing");
  });

  it("matches the cutoffs agreed for the team instrument", () => {
    expect(percentageSectionBands(25, COPY).map((b) => [b.minScore, b.maxScore])).toEqual([
      [19, 25], [13, 18], [7, 12], [0, 6],
    ]);
    expect(percentageSectionBands(30, COPY).map((b) => [b.minScore, b.maxScore])).toEqual([
      [23, 30], [15, 22], [8, 14], [0, 7],
    ]);
    expect(percentageSectionBands(20, COPY).map((b) => [b.minScore, b.maxScore])).toEqual([
      [16, 20], [10, 15], [5, 9], [0, 4],
    ]);
  });

  it("matches the cutoffs agreed for the individual instrument", () => {
    expect(percentageSectionBands(38, COPY).map((b) => [b.minScore, b.maxScore])).toEqual([
      [29, 38], [19, 28], [10, 18], [0, 9],
    ]);
    expect(percentageSectionBands(45, COPY).map((b) => [b.minScore, b.maxScore])).toEqual([
      [34, 45], [23, 33], [12, 22], [0, 11],
    ]);
    expect(percentageSectionBands(40, COPY).map((b) => [b.minScore, b.maxScore])).toEqual([
      [31, 40], [20, 30], [10, 19], [0, 9],
    ]);
  });
});
