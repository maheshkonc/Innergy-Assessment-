// Reference fixture for the TEAM diagnostic — the equivalent of
// tests/scoring.spec.ts (PRD §11 acceptance #3) for the 15-statement,
// 1–5 Likert instrument.
//
// The band boundary tests are the important ones: the source document's
// section bands only fit a /25 section, so the fixture rescales them per
// section. These assertions pin that every attainable score lands in exactly
// one band — the bug the rescale exists to fix.

import { describe, expect, it } from "vitest";
import { scoreInstrument } from "../src/core/scoring/engine.js";
import {
  buildTeamV1Spec,
  TEAM_QUESTION_COUNT,
} from "../src/db/seed/fixtures/innergy_team_v1.js";
import type { AnswerInput, OptionLabel } from "../src/core/scoring/types.js";

const SPEC = buildTeamV1Spec();
const QUESTIONS = SPEC.sections.flatMap((s) => s.questions);

/** Every question answered with the same Likert label. */
function uniformAnswers(label: OptionLabel): AnswerInput[] {
  return QUESTIONS.map((q) => ({ questionId: q.id, optionLabel: label }));
}

describe("scoreInstrument — Innergy FLS Team v1", () => {
  it("has 15 questions split 5 / 6 / 4 across the three sections", () => {
    expect(QUESTIONS).toHaveLength(15);
    expect(TEAM_QUESTION_COUNT).toBe(15);
    expect(SPEC.sections.map((s) => s.questions.length)).toStrictEqual([5, 6, 4]);
  });

  it("all-5s gives the document's maxima: 25 / 30 / 20, overall 75", () => {
    const result = scoreInstrument(SPEC, uniformAnswers("E"));
    const [cog, rel, inner] = result.dimensions;
    expect(cog!.score).toBe(25);
    expect(rel!.score).toBe(30);
    expect(inner!.score).toBe(20);
    expect(result.overallScore).toBe(75);
    expect(result.overallMaxScore).toBe(75);
    expect(result.overallBand).toBe("AI-Ready");
  });

  it("all-1s gives the minimum 5 / 6 / 4, overall 15, High Risk", () => {
    const result = scoreInstrument(SPEC, uniformAnswers("A"));
    const [cog, rel, inner] = result.dimensions;
    expect(cog!.score).toBe(5);
    expect(rel!.score).toBe(6);
    expect(inner!.score).toBe(4);
    expect(result.overallScore).toBe(15);
    expect(result.overallBand).toBe("High Risk");
  });

  it("each uniform Likert score lands in exactly one band per section", () => {
    // The doc's un-rescaled bands would leave Section B's 26–30 uncovered and
    // put Section C's minimum of 4 below its lowest band. Scoring throws when
    // no band covers a score, so reaching an answer at all proves coverage.
    // Uniform totals per section (A/B/C = 5/6/4 questions):
    //   1s → 5, 6, 4     2s → 10, 12, 8    3s → 15, 18, 12
    //   4s → 20, 24, 16  5s → 25, 30, 20
    const expected: Record<OptionLabel, string[]> = {
      A: ["Critical Gap", "Critical Gap", "Critical Gap"],
      B: ["At Risk", "At Risk", "At Risk"],
      C: ["Developing", "Developing", "Developing"],
      D: ["Strong", "Strong", "Strong"],
      E: ["Strong", "Strong", "Strong"],
    };
    for (const label of ["A", "B", "C", "D", "E"] as OptionLabel[]) {
      const result = scoreInstrument(SPEC, uniformAnswers(label));
      expect(result.dimensions.map((d) => d.band)).toStrictEqual(expected[label]);
    }
  });

  it("every attainable section total is covered by a band", () => {
    // Exhaustive: walk each section's full range and assert a band matches.
    for (const section of SPEC.sections) {
      const min = section.questions.length * 1;
      const max = section.questions.length * 5;
      for (let score = min; score <= max; score++) {
        const covering = SPEC.dimensionBands.filter(
          (b) =>
            b.dimensionId === section.dimensionId &&
            score >= b.minScore &&
            score <= b.maxScore,
        );
        expect(covering, `section ${section.id} score ${score}`).toHaveLength(1);
      }
    }
  });

  it("every attainable overall total is covered by exactly one band", () => {
    for (let score = 15; score <= 75; score++) {
      const covering = SPEC.overallBands.filter(
        (b) => score >= b.minScore && score <= b.maxScore,
      );
      expect(covering, `overall score ${score}`).toHaveLength(1);
    }
  });

  it("picks the lowest dimension by percentage of max", () => {
    // Top marks everywhere except Inner Mastery.
    const answers = QUESTIONS.map((q) => {
      const section = SPEC.sections.find((s) =>
        s.questions.some((qq) => qq.id === q.id),
      )!;
      return {
        questionId: q.id,
        optionLabel: (section.dimensionId === "dim_inner_mastery"
          ? "A"
          : "E") as OptionLabel,
      };
    });
    expect(scoreInstrument(SPEC, answers).lowestDimensionId).toBe("dim_inner_mastery");
  });

  it("is pure — repeated calls with same input return identical output", () => {
    const answers = uniformAnswers("C");
    expect(scoreInstrument(SPEC, answers)).toStrictEqual(
      scoreInstrument(SPEC, answers),
    );
  });

  it("throws on missing answers", () => {
    const incomplete = uniformAnswers("C").slice(0, 14);
    expect(() => scoreInstrument(SPEC, incomplete)).toThrow(/Missing answer/);
  });
});
