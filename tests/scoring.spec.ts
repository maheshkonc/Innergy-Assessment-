// Acceptance #3 (PRD §11): given a fixed set of answers, calculated scores,
// bands, overall score, and overall band exactly match the reference fixture.

import { describe, expect, it } from "vitest";
import { scoreInstrument } from "../src/core/scoring/engine.js";
import { buildInnergyV1Spec } from "../src/db/seed/fixtures/innergy_fls_v1.js";
import type { AnswerInput, OptionLabel } from "../src/core/scoring/types.js";

const SPEC = buildInnergyV1Spec();
const QUESTIONS = SPEC.sections.flatMap((s) => s.questions);

function answersFromPattern(pattern: string): AnswerInput[] {
  if (pattern.length !== QUESTIONS.length) {
    throw new Error(`pattern length ${pattern.length} != ${QUESTIONS.length}`);
  }
  return QUESTIONS.map((q, i) => ({
    questionId: q.id,
    optionLabel: pattern[i] as OptionLabel,
  }));
}

function pickMaxAnswers(): AnswerInput[] {
  // For each question, pick the label with the highest score. D is NOT always
  // the max in this instrument — e.g. A3 max is A (4), A4 max is B (5).
  return QUESTIONS.map((q) => {
    const best = [...q.options].sort((a, b) => b.score - a.score)[0]!;
    return { questionId: q.id, optionLabel: best.label };
  });
}

function pickMinAnswers(): AnswerInput[] {
  return QUESTIONS.map((q) => {
    const worst = [...q.options].sort((a, b) => a.score - b.score)[0]!;
    return { questionId: q.id, optionLabel: worst.label };
  });
}

describe("scoreInstrument — Innergy FLS v1", () => {
  it("max-pick pattern hits the max score for each section", () => {
    const result = scoreInstrument(SPEC, pickMaxAnswers());

    const [cog, rel, inner] = result.dimensions;
    expect(cog!.score).toBe(cog!.maxScore);
    expect(rel!.score).toBe(rel!.maxScore);
    expect(inner!.score).toBe(inner!.maxScore);
    expect(result.overallScore).toBe(result.overallMaxScore);
  });

  it("expected maxes match PRD §7: Cognitive 38, Relational 45, Inner 40, overall 123", () => {
    const result = scoreInstrument(SPEC, pickMaxAnswers());
    const [cog, rel, inner] = result.dimensions;
    expect(cog!.maxScore).toBe(38);
    expect(rel!.maxScore).toBe(45);
    expect(inner!.maxScore).toBe(40);
    expect(result.overallMaxScore).toBe(123);
  });

  it("min-pick pattern sits well below max and lands in Critical band", () => {
    const result = scoreInstrument(SPEC, pickMinAnswers());
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThan(result.overallMaxScore);
    expect(result.overallBand).toBe("Critical (High Risk)");
  });

  it("picks lowest dimension by percentage of max", () => {
    // Max in Cognitive + Relational, min in Inner.
    const answers = QUESTIONS.map((q, i) => {
      const section = SPEC.sections.find((s) =>
        s.questions.some((qq) => qq.id === q.id),
      )!;
      const pick =
        section.dimensionId === "dim_inner_mastery"
          ? [...q.options].sort((a, b) => a.score - b.score)[0]!
          : [...q.options].sort((a, b) => b.score - a.score)[0]!;
      void i;
      return { questionId: q.id, optionLabel: pick.label };
    });
    const result = scoreInstrument(SPEC, answers);
    expect(result.lowestDimensionId).toBe("dim_inner_mastery");
  });

  it("is pure — repeated calls with same input return identical output", () => {
    const answers = answersFromPattern("A".repeat(25));
    const r1 = scoreInstrument(SPEC, answers);
    const r2 = scoreInstrument(SPEC, answers);
    expect(r1).toStrictEqual(r2);
  });

  it("throws on missing answers", () => {
    const incomplete: AnswerInput[] = QUESTIONS.slice(0, 24).map((q) => ({
      questionId: q.id,
      optionLabel: "A",
    }));
    expect(() => scoreInstrument(SPEC, incomplete)).toThrow(/Missing answer/);
  });
});
