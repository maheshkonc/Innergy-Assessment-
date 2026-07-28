// Innergy Full Spectrum Leadership Diagnostic — TEAM edition, v1.
//
// Source: "Full Spectrum Leadership Diagnostic For TEAM (1).docx" (repo root).
// The respondent is a CEO/CHRO scoring their top 10–20 leaders AS A GROUP on a
// 1–5 Likert scale, not an individual self-assessment. 15 questions, max 75.
//
//   Section A — Cognitive Clarity     Q1–Q5    max 25
//   Section B — Relational Influence  Q6–Q11   max 30
//   Section C — Inner Mastery         Q12–Q15  max 20
//
// Deviations from the source document, and why:
//
//   1. BAND CALIBRATION. The doc lists one set of section bands
//      (20-25 Strong / 14-19 Developing / 8-13 At Risk / 5-7 Critical Gap)
//      that only fits a section scored out of 25. Applied literally, Section B
//      scores of 26–30 fall into no band at all and Section C can never reach
//      "Strong", while its 5–7 "Critical Gap" floor sits below the section's
//      actual minimum of 4. The cutoffs are therefore scaled proportionally to
//      each section's own maximum (see SECTION_*_BANDS below). Raw totals are
//      still displayed as /25, /30 and /20 exactly as the doc prints them.
//      → Confirm the scaled cutoffs with Rashmi before production use.
//
//   2. DIMENSION NAME. The doc calls the third dimension "Inner Resilience" in
//      its narrative and "Inner Mastery" in the Section C heading. This fixture
//      reuses the existing Inner Mastery dimension row shared with the
//      individual instrument. → Confirm which name is canonical.
//
// The 1–5 scale is stored as options A–E with scores 1–5, so the shared
// scoring engine needs no special case.

import type { InstrumentSpec, OptionLabel } from "../../../core/scoring/types";
import { DIM_COGNITIVE, DIM_RELATIONAL, DIM_INNER } from "./innergy_fls_v1";

export const TEAM_INSTRUMENT_ID = "inst_innergy_team";
export const TEAM_INSTRUMENT_VERSION_ID = "instv_innergy_team_v1";

/** Prefix for this instrument's MessageTemplate keys (see core/templates/variant). */
export const TEAM_TEMPLATE_VARIANT = "team";

const SECTION_A = "sec_team_cognitive";
const SECTION_B = "sec_team_relational";
const SECTION_C = "sec_team_inner";

// -------------------------------------------------------------------------
// The 1–5 scale (doc: "HOW TO FILL THIS IN")
// -------------------------------------------------------------------------

const LIKERT: ReadonlyArray<{ label: OptionLabel; text: string; score: number }> = [
  { label: "A", text: "This is rarely true of our leaders", score: 1 },
  { label: "B", text: "This is true of some but not most", score: 2 },
  { label: "C", text: "This is hit or miss — depends on the person or the day", score: 3 },
  { label: "D", text: "This is mostly true", score: 4 },
  { label: "E", text: "This is consistently true across the group", score: 5 },
];

interface SeedQuestion {
  id: string;
  sectionId: string;
  stem: string;
  displayOrder: number;
  internalTag?: string;
  options: ReadonlyArray<{
    label: OptionLabel;
    text: string;
    score: number;
    displayOrder: number;
  }>;
}

function likertOptions() {
  return LIKERT.map((o, i) => ({ ...o, displayOrder: i + 1 }));
}

function q(
  id: string,
  sectionId: string,
  displayOrder: number,
  stem: string,
  internalTag?: string,
): SeedQuestion {
  return { id, sectionId, displayOrder, stem, internalTag, options: likertOptions() };
}

// -------------------------------------------------------------------------
// Section A — Cognitive Clarity (Q1–Q5, max 25)
// -------------------------------------------------------------------------

const A_QUESTIONS: SeedQuestion[] = [
  q("q_t_a1", SECTION_A, 1,
    "When there is no clear answer and time is short, my leaders make a call and move rather than waiting, escalating, or going in circles.",
    "Decisiveness under ambiguity"),
  q("q_t_a2", SECTION_A, 2,
    "My leaders know the difference between what matters and what is just urgent. They focus the team on the right things, even under pressure.",
    "Prioritisation"),
  q("q_t_a3", SECTION_A, 3,
    "When a plan stops working, my leaders adapt quickly, rather than defending what they decided earlier or waiting for someone above them to course-correct.",
    "Adaptive course-correction"),
  q("q_t_a4", SECTION_A, 4,
    "My leaders can simplify complexity. They can take a messy situation and give the team clear direction, even when they don't have all the answers.",
    "Simplifying complexity"),
  q("q_t_a5", SECTION_A, 5,
    "When dealing with something genuinely new — a market shift, an AI disruption, an unexpected crisis — my leaders figure it out rather than freezing or falling back on legacy ways of dealing with it.",
    "Novel-situation response"),
];

// -------------------------------------------------------------------------
// Section B — Relational Influence (Q6–Q11, max 30)
// -------------------------------------------------------------------------

const B_QUESTIONS: SeedQuestion[] = [
  q("q_t_b1", SECTION_B, 1,
    "When my leaders need to drive change, they are able to align their teams quickly to genuinely commit to it, not just with force or because they are being 'told to do' so.",
    "Change alignment"),
  q("q_t_b2", SECTION_B, 2,
    "My leadership team is adept at giving and receiving feedback from their immediate teams and does that regularly.",
    "Feedback"),
  q("q_t_b3", SECTION_B, 3,
    "The people under my leaders feel safe enough to raise problems early — before they escalate. Bad news travels up quickly, not slowly.",
    "Psychological safety"),
  q("q_t_b4", SECTION_B, 4,
    "When there is conflict between senior stakeholders, my leaders can hold both sides and move toward resolution, without letting relationships break down.",
    "Conflict resolution"),
  q("q_t_b5", SECTION_B, 5,
    "My leaders build credibility across different generations, functions, and cultures, not just with people who are similar to them.",
    "Cross-boundary credibility"),
  q("q_t_b6", SECTION_B, 6,
    "When my team is facing a complex situation, they are able to work within themselves, find a way to simplify and solve the issue, even without my (or their leaders') inputs.",
    "Autonomous problem-solving"),
];

// -------------------------------------------------------------------------
// Section C — Inner Mastery (Q12–Q15, max 20)
// -------------------------------------------------------------------------

const C_QUESTIONS: SeedQuestion[] = [
  q("q_t_c1", SECTION_C, 1,
    "Under pressure, a major crisis or a team in chaos, my leaders make the right judgement calls, even if it is hard. For e.g. shutting down projects if it is not working / re-allocation of teams etc.",
    "Judgement under pressure"),
  q("q_t_c2", SECTION_C, 2,
    "My leaders have a good balance of energy allocation between short term goals as well as understanding long term shifts in our industry and our future capability planning for winning.",
    "Horizon balance"),
  q("q_t_c3", SECTION_C, 3,
    "My leaders are personally agile; they are quickly able to adapt to changing priorities.",
    "Personal agility"),
  q("q_t_c4", SECTION_C, 4,
    "When the organization is going through uncertainty or rapid change, my leaders create stability for their teams — rather than passing their own stress downward.",
    "Stability under uncertainty"),
];

// -------------------------------------------------------------------------
// Bands — doc "YOUR RESULTS", cutoffs scaled per section (see note 1 above)
// -------------------------------------------------------------------------

const STRONG =
  "This dimension is a genuine asset in your leadership team. The foundation is there. The work now is to extend it, protect it under pressure, and make sure it scales as the organisation grows.";
const DEVELOPING =
  "There is capability here but it is inconsistent. Some leaders show it, others don't. Some situations bring it out, others expose the gap. Targeted investment in this dimension will create disproportionate return — you are not starting from scratch, you are closing the last mile.";
const AT_RISK =
  "This dimension is a quiet liability. It may not be visible in stable conditions — but under pressure, in fast-moving situations, or during periods of significant change, it will show up as a constraint on performance. This is where your leadership investment is most urgently needed.";
const CRITICAL =
  "This is not a development priority — it is a business risk. Leaders operating with a critical gap in this dimension are actively limiting the performance of the people around them and the organisation's ability to execute at pace.";

// Section A — max 25. Doc's cutoffs apply directly.
export const TEAM_SECTION_A_BANDS = [
  { minScore: 20, maxScore: 25, bandLabel: "Strong", colorHex: "#16a34a", interpretationTemplate: STRONG },
  { minScore: 14, maxScore: 19, bandLabel: "Developing", colorHex: "#eab308", interpretationTemplate: DEVELOPING },
  { minScore: 8, maxScore: 13, bandLabel: "At Risk", colorHex: "#f97316", interpretationTemplate: AT_RISK },
  { minScore: 5, maxScore: 7, bandLabel: "Critical Gap", colorHex: "#dc2626", interpretationTemplate: CRITICAL },
];

// Section B — max 30 (6 questions). Cutoffs × 1.2, rounded to leave no gaps.
export const TEAM_SECTION_B_BANDS = [
  { minScore: 24, maxScore: 30, bandLabel: "Strong", colorHex: "#16a34a", interpretationTemplate: STRONG },
  { minScore: 17, maxScore: 23, bandLabel: "Developing", colorHex: "#eab308", interpretationTemplate: DEVELOPING },
  { minScore: 10, maxScore: 16, bandLabel: "At Risk", colorHex: "#f97316", interpretationTemplate: AT_RISK },
  { minScore: 6, maxScore: 9, bandLabel: "Critical Gap", colorHex: "#dc2626", interpretationTemplate: CRITICAL },
];

// Section C — max 20 (4 questions). Cutoffs × 0.8; floor is 4, not 5.
export const TEAM_SECTION_C_BANDS = [
  { minScore: 16, maxScore: 20, bandLabel: "Strong", colorHex: "#16a34a", interpretationTemplate: STRONG },
  { minScore: 11, maxScore: 15, bandLabel: "Developing", colorHex: "#eab308", interpretationTemplate: DEVELOPING },
  { minScore: 7, maxScore: 10, bandLabel: "At Risk", colorHex: "#f97316", interpretationTemplate: AT_RISK },
  { minScore: 4, maxScore: 6, bandLabel: "Critical Gap", colorHex: "#dc2626", interpretationTemplate: CRITICAL },
];

// Overall — max 75. Doc's ranges verbatim ("Below 25" floored at the real
// minimum of 15, i.e. all fifteen questions answered 1).
export const TEAM_OVERALL_BANDS = [
  { minScore: 60, maxScore: 75, bandLabel: "AI-Ready",
    interpretationTemplate:
      "Optimize & Extend. Your leadership team has the foundation to thrive in the AI age. The priority now is staying ahead — building the practices and tools that will keep this edge as the pace of change accelerates." },
  { minScore: 42, maxScore: 59, bandLabel: "Partially Ready",
    interpretationTemplate:
      "Your team has real strengths but meaningful gaps. In stable conditions, this works. As AI continues to raise the bar on speed, judgment, and adaptability, these gaps will become more visible and more costly. Now is the time to address them — before the pressure exposes them." },
  { minScore: 25, maxScore: 41, bandLabel: "Developing Readiness",
    interpretationTemplate:
      "Your leadership team is operating on a model that was built for a slower, more predictable world. The gaps across one or more dimensions are significant enough that they are likely already affecting execution, culture, and your ability to attract and retain the right people. Targeted investment will accelerate significantly." },
  { minScore: 15, maxScore: 24, bandLabel: "High Risk",
    interpretationTemplate:
      "The leadership infrastructure your organization has today is not fit for what is coming. This is not a criticism of your leaders as individuals — it is a structural gap that has built up over time and needs a fundamental, high-touch reset." },
];

// -------------------------------------------------------------------------
// Exported fixture + pure-spec builder for the scoring engine
// -------------------------------------------------------------------------

export const TEAM_V1_SECTIONS = [
  {
    id: SECTION_A,
    dimensionId: DIM_COGNITIVE,
    displayOrder: 1,
    introTemplateKey: "section_intro_cognitive",
    questions: A_QUESTIONS,
  },
  {
    id: SECTION_B,
    dimensionId: DIM_RELATIONAL,
    displayOrder: 2,
    introTemplateKey: "section_intro_relational",
    questions: B_QUESTIONS,
  },
  {
    id: SECTION_C,
    dimensionId: DIM_INNER,
    displayOrder: 3,
    introTemplateKey: "section_intro_inner",
    questions: C_QUESTIONS,
  },
] as const;

export const TEAM_QUESTION_COUNT =
  A_QUESTIONS.length + B_QUESTIONS.length + C_QUESTIONS.length;

export function buildTeamV1Spec(): InstrumentSpec {
  const dimensionBands = [
    ...TEAM_SECTION_A_BANDS.map((b) => ({ ...b, dimensionId: DIM_COGNITIVE })),
    ...TEAM_SECTION_B_BANDS.map((b) => ({ ...b, dimensionId: DIM_RELATIONAL })),
    ...TEAM_SECTION_C_BANDS.map((b) => ({ ...b, dimensionId: DIM_INNER })),
  ];

  return {
    instrumentVersionId: TEAM_INSTRUMENT_VERSION_ID,
    sections: TEAM_V1_SECTIONS.map((s) => ({
      id: s.id,
      dimensionId: s.dimensionId,
      displayOrder: s.displayOrder,
      questions: s.questions.map((question) => ({
        id: question.id,
        sectionId: question.sectionId,
        options: question.options.map((o) => ({ label: o.label, score: o.score })),
      })),
    })),
    dimensionBands,
    overallBands: TEAM_OVERALL_BANDS,
  };
}
