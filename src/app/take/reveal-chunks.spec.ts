import { describe, expect, it } from "vitest";
import { chunkResultReveal } from "./reveal-chunks";

// Stand-ins for bubbles: "R" is a result card, anything else is not.
const isResult = (s: string) => s.startsWith("R");

describe("chunkResultReveal", () => {
  it("leaves a turn with no result cards as a single group", () => {
    // Every question turn takes this path — gating one would strand the
    // question widget behind a button the user has no reason to press.
    expect(chunkResultReveal(["intro", "question"], isResult)).toEqual([
      ["intro", "question"],
    ]);
  });

  it("returns nothing for an empty turn", () => {
    expect(chunkResultReveal([], isResult)).toEqual([]);
  });

  it("splits the real results turn into one group per card", () => {
    // The shape the server actually sends: calculating, 3 dimension cards,
    // the overall card, the circle image, then the two CTA messages.
    const turn = [
      "calculating",
      "R:cognitive",
      "R:relational",
      "R:inner",
      "R:overall",
      "image",
      "cta1",
      "cta2",
    ];
    expect(chunkResultReveal(turn, isResult)).toEqual([
      ["calculating", "R:cognitive"],
      ["R:relational"],
      ["R:inner"],
      ["R:overall"],
      ["image", "cta1", "cta2"],
    ]);
  });

  it("keeps the preamble with the first card rather than gating it alone", () => {
    expect(chunkResultReveal(["calculating", "R:only"], isResult)).toEqual([
      ["calculating", "R:only"],
    ]);
  });

  it("breaks after the last card even when nothing follows it", () => {
    expect(chunkResultReveal(["R:a", "R:b"], isResult)).toEqual([["R:a"], ["R:b"]]);
  });

  it("preserves every item exactly once", () => {
    const turn = ["a", "R:1", "b", "R:2", "c", "R:3", "d"];
    expect(chunkResultReveal(turn, isResult).flat()).toEqual(turn);
  });
});
