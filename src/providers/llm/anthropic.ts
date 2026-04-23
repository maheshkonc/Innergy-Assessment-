// Anthropic Claude provider — used for interpretation in LLM mode (§5.5).

import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LlmRequest, LlmResponse } from "./types";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    apiKey = process.env.ANTHROPIC_API_KEY,
    model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
  ) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);

    try {
      const resp = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: req.maxOutputTokens ?? 1024,
          messages: [{ role: "user", content: req.prompt }],
        },
        { signal: controller.signal },
      );
      const text = resp.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
      return {
        rawText: text,
        inputTokens: resp.usage.input_tokens,
        outputTokens: resp.usage.output_tokens,
        latencyMs: Date.now() - start,
        model: this.model,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
