// The web result card renders its chart from whatever the `overall_result`
// template produced. A parser miss is silent — you just lose the chart — so
// both shipped templates are pinned here.

import { describe, expect, it } from "vitest";
import { parseOverallResult, parseDimensionResult } from "./result-parse";

const INDIVIDUAL_OVERALL = [
  "*OVERALL: AI-Ready*",
  "",
  "Section 1: 27 / 38",
  "Section 2: 45 / 45",
  "Section 3: 40 / 40",
  "",
  "Total: 112 / 123",
  "",
  "Your leadership has the foundation to thrive in the AI age.",
].join("\n");

const TEAM_OVERALL = [
  "*HOW AI-READY IS YOUR LEADERSHIP TEAM: AI-Ready*",
  "",
  "Cognitive Clarity: 20 / 25",
  "Relational Influence: 24 / 30",
  "Inner Mastery: 16 / 20",
  "",
  "Total: 60 / 75",
  "",
  "Optimize & Extend. Your leadership team has the foundation to thrive.",
].join("\n");

describe("parseOverallResult", () => {
  it("parses the individual template's three sections and total", () => {
    const r = parseOverallResult(INDIVIDUAL_OVERALL);
    expect(r).not.toBeNull();
    expect(r!.sections).toStrictEqual([
      { label: "Section 1", score: "27", max: "38" },
      { label: "Section 2", score: "45", max: "45" },
      { label: "Section 3", score: "40", max: "40" },
    ]);
    expect(r!.overallScore).toBe("112");
    expect(r!.overallMax).toBe("123");
  });

  it("parses the team template, whose rows use real dimension names", () => {
    const r = parseOverallResult(TEAM_OVERALL);
    expect(r).not.toBeNull();
    expect(r!.sections).toStrictEqual([
      { label: "Cognitive Clarity", score: "20", max: "25" },
      { label: "Relational Influence", score: "24", max: "30" },
      { label: "Inner Mastery", score: "16", max: "20" },
    ]);
    expect(r!.overallScore).toBe("60");
    expect(r!.overallMax).toBe("75");
  });

  it("feeds the chart for BOTH templates — the regression that lost it", () => {
    for (const text of [INDIVIDUAL_OVERALL, TEAM_OVERALL]) {
      const r = parseOverallResult(text)!;
      expect(r.dimensions).toHaveLength(3);
      for (const d of r.dimensions!) {
        expect(Number.isFinite(d.score)).toBe(true);
        expect(d.maxScore).toBeGreaterThan(0);
      }
    }
  });

  it("does not treat the Total line as a dimension row", () => {
    for (const text of [INDIVIDUAL_OVERALL, TEAM_OVERALL]) {
      const labels = parseOverallResult(text)!.sections.map((s) => s.label.toLowerCase());
      expect(labels).not.toContain("total");
    }
  });

  it("keeps the interpretation prose out of the section rows", () => {
    const r = parseOverallResult(TEAM_OVERALL)!;
    expect(r.sections).toHaveLength(3);
    expect(r.body).toContain("Optimize & Extend");
  });

  it("ignores a score-like fragment inside prose after the total", () => {
    const withProse = [
      "*OVERALL: Partially Ready*",
      "Section 1: 10 / 20",
      "Total: 30 / 60",
      "Teams that score 23 / 25 here still break under pressure.",
    ].join("\n");
    const r = parseOverallResult(withProse)!;
    expect(r.sections).toStrictEqual([{ label: "Section 1", score: "10", max: "20" }]);
  });

  it("returns null for a message that is not an overall result", () => {
    expect(parseOverallResult("Great. What's your first name?")).toBeNull();
  });
});

describe("parseDimensionResult", () => {
  it("parses the shared dimension_result shape used by both assessments", () => {
    const r = parseDimensionResult("*Cognitive Clarity* — 20 / 25 · Strong\n\nThe foundation is there.");
    expect(r).toStrictEqual({
      title: "Cognitive Clarity",
      score: "20",
      max: "25",
      band: "Strong",
      body: "The foundation is there.",
    });
  });
});
