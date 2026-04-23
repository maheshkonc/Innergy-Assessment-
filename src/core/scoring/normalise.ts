// FR-3.3: normalise user replies to an A/B/C/D option label.
// Accepted forms (configurable — moved to DB once admin UI lands):
//   "A", "a", "A.", "a)", "option a", "I'd say B", "bee", "see", "dee".

import type { OptionLabel } from "./types";

const WORD_TO_LETTER: Record<string, OptionLabel> = {
  a: "A",
  b: "B",
  c: "C",
  d: "D",
  ay: "A",
  bee: "B",
  see: "C",
  sea: "C",
  dee: "D",
};

export function normaliseOptionReply(raw: string): OptionLabel | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;

  // Fast path: single char.
  if (cleaned.length === 1) {
    const up = cleaned.toUpperCase();
    if (up === "A" || up === "B" || up === "C" || up === "D") return up;
  }

  // "A.", "a)", "(A)", "A-"
  const punctStripped = cleaned.replace(/[.):\-(\s]/g, "");
  if (/^[abcd]$/.test(punctStripped)) {
    return punctStripped.toUpperCase() as OptionLabel;
  }

  // "option a", "option b", "opt c", "choice d"
  const optMatch = cleaned.match(/\b(?:option|opt|choice|answer)\s*[:\-]?\s*([abcd])\b/);
  if (optMatch?.[1]) return optMatch[1].toUpperCase() as OptionLabel;

  // Spelled-out words anywhere in the string.
  for (const [word, letter] of Object.entries(WORD_TO_LETTER)) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(cleaned)) return letter;
  }

  // Last resort: a lone A/B/C/D anywhere in a short phrase (< 40 chars).
  if (cleaned.length < 40) {
    const lonely = cleaned.match(/\b([abcd])\b/);
    if (lonely?.[1]) return lonely[1].toUpperCase() as OptionLabel;
  }

  return null;
}
