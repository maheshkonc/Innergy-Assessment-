// The three dimensions are stored in the DB as "Section 1/2/3" — those strings
// double as internal lookup keys across scoring (results.ts, llm-mode.ts, etc.),
// so they must stay. This maps them to the real, user-facing names for any copy
// shown to the leader (per-dimension readouts, lowest-dimension references).
const DISPLAY_NAMES: Record<string, string> = {
  "Section 1": "Cognitive Clarity",
  "Section 2": "Relational Influence",
  "Section 3": "Inner Mastery",
};

export function dimensionDisplayName(name: string): string {
  return DISPLAY_NAMES[name] ?? name;
}
