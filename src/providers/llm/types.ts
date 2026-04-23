// LLMProvider — used for interpretation (V1) and real-time coaching (V2).

export interface LlmRequest {
  // Pre-rendered prompt (variables already substituted).
  prompt: string;
  // Hard ceiling — cancel & fallback if the call exceeds this.
  timeoutMs: number;
  // Response must parse as JSON conforming to this schema (server-side validated).
  jsonMode: boolean;
  maxOutputTokens?: number;
}

export interface LlmResponse {
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  model: string;
}

export interface LLMProvider {
  name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}
