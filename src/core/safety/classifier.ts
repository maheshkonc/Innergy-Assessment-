// Safety classifier (PRD §5.12). Hybrid:
//   1. Keyword pass — fast, deterministic, zero network cost. Covers the
//      PRD §12.7 trigger phrase list (placeholder until Rashmi signs off).
//   2. Optional LLM pass — catches paraphrases the keyword list misses
//      (e.g. "I don't see the point of this anymore"). Fails-safe: if the
//      LLM times out, errors, or returns off-schema, we treat the input as
//      NOT triggering — the keyword pass remains the hard floor.

import type { LLMProvider } from "../../providers/llm/types";

const TRIGGER_PHRASES_V1 = [
  "kill myself",
  "end it all",
  "suicidal",
  "self-harm",
  "self harm",
  "hurt myself",
  "can't go on",
  "want to die",
  "hopeless",
  "harassment",
  "harassed",
  "discriminated",
  "bullied at work",
];

export interface SafetyResult {
  triggered: boolean;
  matched?: string;
  source: "keyword" | "llm" | "none";
}

export function classifyInput(text: string): SafetyResult {
  const lower = text.toLowerCase();
  for (const phrase of TRIGGER_PHRASES_V1) {
    if (lower.includes(phrase)) return { triggered: true, matched: phrase, source: "keyword" };
  }
  return { triggered: false, source: "none" };
}

/**
 * Two-pass classification. Keyword first (cheap); only calls the LLM if
 * keyword misses. The LLM is asked to respond with strict JSON — anything
 * off-schema is treated as not-triggered to avoid false positives from
 * parse errors.
 */
export async function classifyInputHybrid(
  text: string,
  llm: LLMProvider | null,
  opts: { timeoutMs?: number } = {},
): Promise<SafetyResult> {
  const keyword = classifyInput(text);
  if (keyword.triggered) return keyword;
  if (!llm) return keyword;
  if (text.trim().length < 8) return keyword; // skip single-word replies

  try {
    const resp = await llm.complete({
      prompt: buildSafetyPrompt(text),
      timeoutMs: opts.timeoutMs ?? 1500,
      jsonMode: true,
      maxOutputTokens: 80,
    });
    const parsed = tryParseSafetyJson(resp.rawText);
    if (parsed?.triggered) {
      return { triggered: true, matched: parsed.reason ?? "llm-detected", source: "llm" };
    }
    return { triggered: false, source: "none" };
  } catch {
    return { triggered: false, source: "none" };
  }
}

function buildSafetyPrompt(text: string): string {
  return [
    "You are a safety classifier for a leadership assessment chat.",
    "Decide whether the user's reply contains any of:",
    "  - suicidal ideation, self-harm, or a desire to die",
    "  - a disclosure of being harassed, discriminated against, or bullied",
    "  - an urgent mental-health crisis",
    "Respond with STRICT JSON: {\"triggered\": boolean, \"reason\": string|null}.",
    "No markdown, no prose. If unsure, respond {\"triggered\": false, \"reason\": null}.",
    "",
    `USER REPLY: ${JSON.stringify(text)}`,
  ].join("\n");
}

function tryParseSafetyJson(
  raw: string,
): { triggered: boolean; reason: string | null } | null {
  try {
    // Trim code-fence wrapping if the model added it despite instructions.
    const cleaned = raw.replace(/^```(?:json)?\s*|```\s*$/g, "").trim();
    const obj = JSON.parse(cleaned);
    if (typeof obj?.triggered !== "boolean") return null;
    return {
      triggered: obj.triggered,
      reason: typeof obj.reason === "string" ? obj.reason : null,
    };
  } catch {
    return null;
  }
}
