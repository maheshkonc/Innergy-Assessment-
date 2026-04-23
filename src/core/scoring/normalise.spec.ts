import { describe, expect, it } from "vitest";
import { normaliseOptionReply } from "./normalise";

describe("normaliseOptionReply", () => {
  it.each([
    ["A", "A"],
    ["a", "A"],
    ["A.", "A"],
    ["a)", "A"],
    [" B ", "B"],
    ["Option C", "C"],
    ["option d", "D"],
    ["I'd say B", "B"],
    ["bee", "B"],
    ["see", "C"],
    ["Dee", "D"],
    ["choice A", "A"],
  ])("%s → %s", (input, expected) => {
    expect(normaliseOptionReply(input)).toBe(expected);
  });

  it.each(["", "maybe", "I don't know", "yes", "42", "🤷"])(
    "returns null for ambiguous/unrecognised input: %s",
    (input) => {
      expect(normaliseOptionReply(input)).toBeNull();
    },
  );
});
