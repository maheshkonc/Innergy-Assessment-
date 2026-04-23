// Pure types for the scoring engine. No framework, no I/O.
// Consumed by src/core/scoring/engine.ts and the seed fixtures.

export type OptionLabel = "A" | "B" | "C" | "D";

export interface OptionSpec {
  label: OptionLabel;
  score: number;
}

export interface QuestionSpec {
  id: string;
  sectionId: string;
  options: ReadonlyArray<OptionSpec>;
}

export interface DimensionBandSpec {
  dimensionId: string;
  minScore: number;
  maxScore: number;
  bandLabel: string;
}

export interface OverallBandSpec {
  minScore: number;
  maxScore: number;
  bandLabel: string;
}

export interface SectionSpec {
  id: string;
  dimensionId: string;
  displayOrder: number;
  questions: ReadonlyArray<QuestionSpec>;
}

export interface InstrumentSpec {
  instrumentVersionId: string;
  sections: ReadonlyArray<SectionSpec>;
  dimensionBands: ReadonlyArray<DimensionBandSpec>;
  overallBands: ReadonlyArray<OverallBandSpec>;
}

export interface AnswerInput {
  questionId: string;
  optionLabel: OptionLabel;
}

export interface DimensionResult {
  dimensionId: string;
  score: number;
  maxScore: number;
  band: string;
}

export interface ScoreResult {
  instrumentVersionId: string;
  dimensions: ReadonlyArray<DimensionResult>;
  overallScore: number;
  overallMaxScore: number;
  overallBand: string;
  lowestDimensionId: string;
}
