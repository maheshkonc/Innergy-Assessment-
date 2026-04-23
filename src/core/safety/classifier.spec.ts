import { describe, expect, it } from "vitest";
import { classifyInput, classifyInputHybrid } from "./classifier";
import type { LLMProvider } from "../../providers/llm/types";

const fakeLlm = (response: string): LLMProvider => ({
  name: "fake",
  async complete() {
    return {
      rawText: response,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      model: "fake",
    };
  },
});

describe("safety classifier", () => {
  it("keyword: triggers on trigger phrases", () => {
    expect(classifyInput("i feel hopeless").triggered).toBe(true);
    expect(classifyInput("I want to die").triggered).toBe(true);
    expect(classifyInput("I was harassed by my boss").triggered).toBe(true);
  });

  it("keyword: does not trigger on benign text", () => {
    expect(classifyInput("option B").triggered).toBe(false);
    expect(classifyInput("I'd say 4 out of 5").triggered).toBe(false);
  });

  it("hybrid: keyword still wins without LLM", async () => {
    const r = await classifyInputHybrid("hopeless", null);
    expect(r.triggered).toBe(true);
    expect(r.source).toBe("keyword");
  });

  it("hybrid: skips LLM for very short benign text", async () => {
    const r = await classifyInputHybrid("B", fakeLlm('{"triggered":true,"reason":"x"}'));
    expect(r.triggered).toBe(false);
  });

  it("hybrid: LLM triggers on paraphrase the keyword list misses", async () => {
    const r = await classifyInputHybrid(
      "I don't see the point of going on anymore",
      fakeLlm('{"triggered":true,"reason":"ideation"}'),
    );
    expect(r.triggered).toBe(true);
    expect(r.source).toBe("llm");
  });

  it("hybrid: off-schema LLM response is fail-safe (not triggered)", async () => {
    const r = await classifyInputHybrid(
      "I am doing fine thanks for asking",
      fakeLlm("I think probably yes"),
    );
    expect(r.triggered).toBe(false);
  });

  it("hybrid: LLM error is fail-safe (not triggered)", async () => {
    const llm: LLMProvider = {
      name: "fake",
      async complete() {
        throw new Error("network");
      },
    };
    const r = await classifyInputHybrid("I am just tired of this", llm);
    expect(r.triggered).toBe(false);
  });

  it("hybrid: strips code-fence wrapping from LLM output", async () => {
    const r = await classifyInputHybrid(
      "I want to end it all honestly",
      fakeLlm('```json\n{"triggered": true, "reason": "ideation"}\n```'),
    );
    expect(r.triggered).toBe(true);
  });
});
