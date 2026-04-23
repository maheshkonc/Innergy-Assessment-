// LLM interpretation prompt (PRD §5.5 / §6.4). Versioned; the admin UI
// can publish new versions, and every LLM call logs the prompt version it
// used for reproducibility (FR-5.3/5.4).

export const LLM_INTERPRETATION_PROMPT_V1 = {
  key: "interpretation_v1",
  version: 1,
  maxNarrativeChars: 350,
  body: [
    "You are the interpretation engine for the Full-Spectrum Leadership Coach.",
    "",
    "CONTEXT",
    "Leader: {{name}} at {{organisation}}.",
    "Instrument: {{instrument_name}} v{{instrument_version}}.",
    "Scores (score / max · band):",
    "- Section 1: {{cognitive_score}}/{{cognitive_max}} · {{cognitive_band}}",
    "- Section 2: {{relational_score}}/{{relational_max}} · {{relational_band}}",
    "- Section 3: {{inner_score}}/{{inner_max}} · {{inner_band}}",
    "Overall: {{overall_score}}/{{overall_max}} · {{overall_band}}",
    "Lowest dimension: {{lowest_dimension_name}}.",
    "",
    "COMPANY CONTEXT (V2+, may be empty)",
    "{{company_context}}",
    "",
    "RULES",
    "1. Return STRICT JSON conforming to the response_schema.",
    "2. Each dimension narrative ≤ {{max_narrative_chars}} characters.",
    "3. Overall narrative ≤ {{max_overall_chars}} characters.",
    "4. Address {{name}} directly, in second person.",
    "5. Be specific. No platitudes, no jargon, no hedging.",
    "6. The lowest_dimension MUST exactly match one of: Section 1, Section 2, Section 3.",
    "",
    "Return ONLY the JSON. No prose, no code fences.",
  ].join("\n"),
  responseSchema: {
    type: "object",
    required: ["per_dimension", "overall_narrative", "lowest_dimension"],
    properties: {
      per_dimension: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          required: ["dimension", "narrative"],
          properties: {
            dimension: { type: "string" },
            narrative: { type: "string" },
          },
        },
      },
      overall_narrative: { type: "string" },
      lowest_dimension: { type: "string" },
    },
  },
} as const;
