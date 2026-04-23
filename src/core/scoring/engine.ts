// Pure scoring engine (PRD §5.4, FR-4.4: deterministic & reproducible).
// Given the instrument + answers, outputs a ScoreResult. No DB, no side effects.

import type {
  AnswerInput,
  DimensionBandSpec,
  DimensionResult,
  InstrumentSpec,
  OverallBandSpec,
  ScoreResult,
  SectionSpec,
} from "./types";

export class ScoringError extends Error {}

export function scoreInstrument(
  instrument: InstrumentSpec,
  answers: ReadonlyArray<AnswerInput>,
): ScoreResult {
  const answerByQuestion = new Map<string, AnswerInput>();
  for (const a of answers) {
    if (answerByQuestion.has(a.questionId)) {
      throw new ScoringError(`Duplicate answer for question ${a.questionId}`);
    }
    answerByQuestion.set(a.questionId, a);
  }

  const allQuestions = instrument.sections.flatMap((s) => s.questions);
  for (const q of allQuestions) {
    if (!answerByQuestion.has(q.id)) {
      throw new ScoringError(`Missing answer for question ${q.id}`);
    }
  }

  const dimensionResults: DimensionResult[] = [];
  for (const section of instrument.sections) {
    const { score, maxScore } = sumSection(section, answerByQuestion);
    const band = lookupDimensionBand(instrument.dimensionBands, section.dimensionId, score);
    dimensionResults.push({
      dimensionId: section.dimensionId,
      score,
      maxScore,
      band,
    });
  }

  const overallScore = dimensionResults.reduce((acc, d) => acc + d.score, 0);
  const overallMaxScore = dimensionResults.reduce((acc, d) => acc + d.maxScore, 0);
  const overallBand = lookupOverallBand(instrument.overallBands, overallScore);

  const lowest = [...dimensionResults].sort((a, b) => {
    const pctA = a.score / a.maxScore;
    const pctB = b.score / b.maxScore;
    return pctA - pctB;
  })[0];
  if (!lowest) throw new ScoringError("No dimensions in instrument");

  return {
    instrumentVersionId: instrument.instrumentVersionId,
    dimensions: dimensionResults,
    overallScore,
    overallMaxScore,
    overallBand,
    lowestDimensionId: lowest.dimensionId,
  };
}

function sumSection(
  section: SectionSpec,
  answerByQuestion: Map<string, AnswerInput>,
): { score: number; maxScore: number } {
  let score = 0;
  let maxScore = 0;
  for (const q of section.questions) {
    const ans = answerByQuestion.get(q.id);
    if (!ans) throw new ScoringError(`Missing answer for ${q.id}`);
    const opt = q.options.find((o) => o.label === ans.optionLabel);
    if (!opt) {
      throw new ScoringError(
        `Option ${ans.optionLabel} not found on question ${q.id}`,
      );
    }
    score += opt.score;
    const maxOpt = q.options.reduce((m, o) => (o.score > m ? o.score : m), 0);
    maxScore += maxOpt;
  }
  return { score, maxScore };
}

function lookupDimensionBand(
  bands: ReadonlyArray<DimensionBandSpec>,
  dimensionId: string,
  score: number,
): string {
  const band = bands.find(
    (b) =>
      b.dimensionId === dimensionId && score >= b.minScore && score <= b.maxScore,
  );
  if (!band) {
    throw new ScoringError(
      `No band covers dimension=${dimensionId} score=${score}`,
    );
  }
  return band.bandLabel;
}

function lookupOverallBand(
  bands: ReadonlyArray<OverallBandSpec>,
  score: number,
): string {
  const band = bands.find((b) => score >= b.minScore && score <= b.maxScore);
  if (!band) throw new ScoringError(`No overall band covers score=${score}`);
  return band.bandLabel;
}
