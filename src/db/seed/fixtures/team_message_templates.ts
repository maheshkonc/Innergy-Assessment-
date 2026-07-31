// Team-edition copy overrides.
//
// Keys are the shared FSM keys prefixed with "team_" — see
// core/templates/variant.ts. Anything NOT listed here (later_ack,
// voice_confirm_name, safe_handoff, …) falls back to the global default, so
// only genuinely different wording lives in this file.
//
// Source: "Full Spectrum Leadership Diagnostic For TEAM (1).docx".
// Voice: the respondent is a CEO/CHRO rating their top 10–20 leaders as a
// group, so copy says "your leaders" / "the group", never "you".

import type { TemplateSeed } from "./message_templates";

export const TEAM_MESSAGE_TEMPLATES: TemplateSeed[] = [
  // --- Welcome sequence ---
  {
    key: "team_welcome_1",
    body:
      "Hi {{name_or_there}} — welcome to the Full Spectrum Leadership Diagnostic for teams, from {{tenant_name}}.",
  },
  {
    key: "team_welcome_2",
    body:
      "3 dimensions | {{question_count}} questions | {{duration_estimate}}. You'll get your readout at the end and in your email.\n\n" +
      "Consider a team which is reporting to you or a team you are a part of, and answer the following questions with respect to the behaviors you have observed. There are no right answers — only the ones that reflect accurately.\n\n" +
      "1 rarely true · 2 true of some · 3 hit or miss · 4 mostly true · 5 consistently true",
  },
  {
    key: "team_welcome_3",
    body: "Ready to begin? Reply YES to start, or LATER if you'd like a reminder.",
  },

  // --- Section intros ---
  // No longer emitted — see the note in message_templates.ts. The 1–5 scale
  // legend that used to live in the Cognitive intro now sits in team_welcome_2.
  {
    key: "team_section_intro_cognitive",
    body:
      "Section 1 of 3 — Cognitive Clarity. The thinking dimension: judgment, not knowledge. Your leaders may have all the right frameworks and still hesitate when it counts, get lost in complexity, or default to what worked before.\n\n" +
      "Score each statement 1–5 for your leadership team as a group:\n" +
      "1 rarely true · 2 true of some · 3 hit or miss · 4 mostly true · 5 consistently true",
  },
  {
    key: "team_section_intro_relational",
    body:
      "Cognitive Clarity complete. ✓\n\n" +
      "Section 2 of 3 — Relational Influence. The people dimension: trust and movement, not personality. Your leaders may be well-liked and still unable to shift a resistant team or create genuine followership rather than compliance.",
  },
  {
    key: "team_section_intro_inner",
    body:
      "Relational Influence complete. ✓\n\n" +
      "Section 3 of 3 — Inner Mastery. The foundation dimension. Under pressure the most capable leader can become unpredictable, short-tempered, avoidant or rigid. Their inner state under stress directly determines the quality of their decisions and the experience of their teams.",
  },

  // --- Question delivery (5-point scale) ---
  {
    key: "team_question_body",
    body:
      "Q{{question_number}} of {{question_count}} — {{section_name}}\n\n" +
      "{{stem}}\n\n" +
      "1) {{option_a}}\n2) {{option_b}}\n3) {{option_c}}\n4) {{option_d}}\n5) {{option_e}}",
  },
  {
    key: "team_invalid_answer",
    body: "Sorry, I didn't catch that. Please reply with a number from 1 to 5.",
  },

  // --- Contact capture ---
  {
    key: "team_ask_name",
    body: "Great. What's your first name?",
  },
  {
    key: "team_ask_organisation",
    body: "Thanks, {{name}}. And which organisation are these leaders in?",
  },

  // --- Results ---
  {
    key: "team_calculating",
    body: "That's all {{question_count}} statements. Reading your team's spectrum…",
  },
  {
    key: "team_dimension_result",
    body:
      "*{{dimension_name}}* — {{score}} / {{max_score}} · {{band_label}}\n\n{{interpretation}}",
  },
  {
    key: "team_overall_result",
    body:
      "*HOW AI-READY IS YOUR LEADERSHIP TEAM: {{overall_band_label}}*\n\n" +
      "Cognitive Clarity: {{cognitive_score}} / {{cognitive_max}}\n" +
      "Relational Influence: {{relational_score}} / {{relational_max}}\n" +
      "Inner Mastery: {{inner_score}} / {{inner_max}}\n\n" +
      "Total: {{overall_score}} / {{overall_max_score}}\n\n{{overall_interpretation}}",
  },

  // --- Debrief CTA (doc: "NEXT STEP") ---
  {
    key: "team_debrief_cta_1",
    body:
      "Your lowest section score tells you the most important thing: where to start. For your team that's *{{lowest_dimension_name}}*.\n\n" +
      "{{balance_analysis}}",
  },

  // The two shapes {{balance_analysis}} can take. Which one renders is decided
  // in results.ts from the real spread between the strongest and weakest
  // dimension — see renderBalanceAnalysis. Dimension names arrive as variables
  // because they are editable content, so neither body may name one directly.
  {
    key: "team_debrief_balance_uneven",
    body:
      "Full Spectrum Leadership only works when all three dimensions are present. Your leaders are strongest on {{highest_dimension_name}} ({{highest_score}} / {{highest_max}}) and weakest on {{lowest_dimension_name}} ({{lowest_score}} / {{lowest_max}}) — a gap of {{gap_points}} points once each section is read against its own scale.\n\n" +
      "That gap is the risk. A team strong in two dimensions and weak in the third is not a high-performing team — it is a high-performing team waiting to break under pressure.",
  },
  // Names no "highest": when all three sections tie, the strongest dimension
  // and the weakest are the same one, and naming it would contradict the line
  // above. The uneven variant is safe to name both — a gap that wide cannot
  // put the same dimension at either end.
  {
    key: "team_debrief_balance_even",
    body:
      "Full Spectrum Leadership only works when all three dimensions are present. Your leaders read evenly across the three — only {{gap_points}} points separate the strongest section from the weakest once each is read against its own scale.\n\n" +
      "No single dimension is dragging the others down, which is worth having. What sets the ceiling is the level itself — and {{lowest_dimension_name}} is where the next gain comes cheapest, at {{lowest_score}} / {{lowest_max}}.",
  },
  {
    key: "team_debrief_cta_2",
    body:
      "{{coach_name}} offers a limited number of 20-minute thinking conversations each month with senior HR leaders across APAC. Not a sales conversation — a thinking one, about what your results are showing and what other organisations in your context are doing.\n\n" +
      "Would you like to book one? Reply YES or NO.",
  },
  {
    key: "team_coaching_yes",
    body:
      "Great. You can book your conversation here: {{coach_booking_url}}\n\nI'll let {{coach_name}} know to expect you.",
  },
  {
    key: "team_coaching_no",
    body:
      "Understood. If you change your mind, the link is here: {{coach_booking_url}}",
  },
  {
    key: "team_closing",
    body:
      "Thanks, {{name}}. Your team readout is saved — revisit it anytime by typing RESULTS.\n\n" +
      "Connect with {{coach_name}} on LinkedIn: {{coach_linkedin_url}}",
  },
];
