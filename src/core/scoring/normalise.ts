// FR-3.3: normalise user replies to an A/B/C/D/E option label.
// Accepted forms (configurable — moved to DB once admin UI lands):
//   "A", "a", "A.", "a)", "option a", "I'd say B", "bee", "see", "dee".
// E and the 1–5 digit forms exist for 5-point Likert instruments (the team
// diagnostic presents its scale as 1–5). Callers reject a label the current
// question doesn't carry, so recognising them here is safe for A–D
// instruments too.

import type { OptionLabel } from "./types";

const WORD_TO_LETTER: Record<string, OptionLabel> = {
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  e: "E",
  ay: "A",
  bee: "B",
  see: "C",
  sea: "C",
  dee: "D",
  ee: "E",
};

const DIGIT_TO_LETTER: Record<string, OptionLabel> = {
  "1": "A",
  "2": "B",
  "3": "C",
  "4": "D",
  "5": "E",
};

export function normaliseOptionReply(raw: string): OptionLabel | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;

  // Fast path: single char.
  if (cleaned.length === 1) {
    const up = cleaned.toUpperCase();
    if (up === "A" || up === "B" || up === "C" || up === "D" || up === "E") return up;
    const digit = DIGIT_TO_LETTER[cleaned];
    if (digit) return digit;
  }

  // "A.", "a)", "(A)", "A-" — and the same shapes around a 1–5 digit.
  const punctStripped = cleaned.replace(/[.):\-(\s]/g, "");
  if (/^[abcde]$/.test(punctStripped)) {
    return punctStripped.toUpperCase() as OptionLabel;
  }
  if (/^[1-5]$/.test(punctStripped)) {
    return DIGIT_TO_LETTER[punctStripped]!;
  }

  // "option a", "option b", "opt c", "choice d"
  const optMatch = cleaned.match(/\b(?:option|opt|choice|answer)\s*[:\-]?\s*([abcde])\b/);
  if (optMatch?.[1]) return optMatch[1].toUpperCase() as OptionLabel;

  // "option 3", "I'd rate it 4", "score 5"
  const optDigitMatch = cleaned.match(
    /\b(?:option|opt|choice|answer|rate|rating|score)\s*(?:it\s*)?[:\-]?\s*([1-5])\b/,
  );
  if (optDigitMatch?.[1]) return DIGIT_TO_LETTER[optDigitMatch[1]]!;

  // Spelled-out words anywhere in the string.
  for (const [word, letter] of Object.entries(WORD_TO_LETTER)) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(cleaned)) return letter;
  }

  // Last resort: a lone A/B/C/D/E or 1–5 anywhere in a short phrase (< 40 chars).
  if (cleaned.length < 40) {
    const lonely = cleaned.match(/\b([abcde])\b/);
    if (lonely?.[1]) return lonely[1].toUpperCase() as OptionLabel;
    const lonelyDigit = cleaned.match(/\b([1-5])\b/);
    if (lonelyDigit?.[1]) return DIGIT_TO_LETTER[lonelyDigit[1]]!;
  }

  return null;
}
