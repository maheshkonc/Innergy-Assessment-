// LLM-mode interpretation (PRD §5.5 / §6.4).
// Contract: model returns JSON matching { per_dimension[3], overall_narrative,
// lowest_dimension }. On any deviation, throw — caller falls back to Template.

import type { PrismaClient, Tenant, User } from "@prisma/client";
import { z } from "zod";
import type { ScoreResult } from "../scoring/types";
import type { LLMProvider } from "../../providers/llm/types";
import { renderTemplate } from "../templates/render";
import type { InterpretationOutput } from "./template-mode";

const ResponseSchema = z.object({
  per_dimension: z
    .array(z.object({ dimension: z.string(), narrative: z.string() }))
    .length(3),
  overall_narrative: z.string(),
  lowest_dimension: z.string(),
});

export class LlmInterpretationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 8_000;

export async function interpretWithLlm(
  prisma: PrismaClient,
  llm: LLMProvider,
  args: { tenant: Tenant; user: User; score: ScoreResult; instrumentName: string },
): Promise<InterpretationOutput> {
  const { tenant, user, score } = args;

  const activePrompt = await prisma.llmPromptTemplate.findFirst({
    where: { key: "interpretation_v1", isActive: true },
    orderBy: { version: "desc" },
  });
  if (!activePrompt) throw new LlmInterpretationError("no active LLM prompt");

  const dims = await prisma.dimension.findMany({
    where: { id: { in: score.dimensions.map((d) => d.dimensionId) } },
  });
  const nameById = new Map(dims.map((d) => [d.id, d.name]));

  const prompt = renderTemplate(
    activePrompt.body,
    {
      name: user.firstName ?? "",
      organisation: user.organisation ?? "",
      instrument_name: args.instrumentName,
      instrument_version: "1",
      cognitive_score: findDimScore(score, "Section 1", nameById),
      cognitive_max: findDimMax(score, "Section 1", nameById),
      cognitive_band: findDimBand(score, "Section 1", nameById),
      relational_score: findDimScore(score, "Section 2", nameById),
      relational_max: findDimMax(score, "Section 2", nameById),
      relational_band: findDimBand(score, "Section 2", nameById),
      inner_score: findDimScore(score, "Section 3", nameById),
      inner_max: findDimMax(score, "Section 3", nameById),
      inner_band: findDimBand(score, "Section 3", nameById),
      overall_score: score.overallScore,
      overall_max: score.overallMaxScore,
      overall_band: score.overallBand,
      lowest_dimension_name: nameById.get(score.lowestDimensionId) ?? "",
      company_context: "", // V2+ KB grounding
      max_narrative_chars: activePrompt.maxNarrativeChars,
      max_overall_chars: 500,
    },
    { templateKey: `llm:${activePrompt.key}:v${activePrompt.version}` },
  );

  const sanitised = stripPromptInjection(prompt);
  const resp = await llm.complete({
    prompt: sanitised,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    jsonMode: true,
    maxOutputTokens: 1200,
  });

  let parsed: z.infer<typeof ResponseSchema>;
  try {
    const json = JSON.parse(extractJson(resp.rawText));
    parsed = ResponseSchema.parse(json);
  } catch (err) {
    throw new LlmInterpretationError("schema_violation", err);
  }

  if (parsed.overall_narrative.length > 500) {
    throw new LlmInterpretationError("overall_too_long");
  }
  for (const p of parsed.per_dimension) {
    if (p.narrative.length > activePrompt.maxNarrativeChars + 10) {
      throw new LlmInterpretationError("dimension_too_long");
    }
  }

  // Map the LLM's per-dimension results back to our dimension IDs.
  const perDimension = score.dimensions.map((d) => {
    const name = nameById.get(d.dimensionId);
    if (!name) throw new LlmInterpretationError(`unknown dimension ${d.dimensionId}`);
    const match = parsed.per_dimension.find((p) => p.dimension === name);
    if (!match) throw new LlmInterpretationError(`missing dimension ${name}`);
    return { dimensionId: d.dimensionId, dimensionName: name, narrative: match.narrative };
  });

  // Log the call (FR-5.4).
  await prisma.event.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      eventType: "llm_interpretation_call",
      properties: {
        prompt_key: activePrompt.key,
        prompt_version: activePrompt.version,
        input_tokens: resp.inputTokens,
        output_tokens: resp.outputTokens,
        latency_ms: resp.latencyMs,
        model: resp.model,
        outcome: "success",
      },
    },
  });

  const lowestName = nameById.get(score.lowestDimensionId) ?? "";
  return {
    perDimension,
    overallNarrative: parsed.overall_narrative,
    lowestDimensionId: score.lowestDimensionId,
    lowestDimensionName: lowestName,
  };
}

// --- helpers -------------------------------------------------------------

function findDimScore(score: ScoreResult, name: string, map: Map<string, string>) {
  const d = score.dimensions.find((x) => map.get(x.dimensionId) === name);
  return d?.score ?? 0;
}
function findDimMax(score: ScoreResult, name: string, map: Map<string, string>) {
  const d = score.dimensions.find((x) => map.get(x.dimensionId) === name);
  return d?.maxScore ?? 0;
}
function findDimBand(score: ScoreResult, name: string, map: Map<string, string>) {
  const d = score.dimensions.find((x) => map.get(x.dimensionId) === name);
  return d?.band ?? "";
}

function extractJson(raw: string): string {
  // Strip common wrappers (``` fences, leading prose) if the model ignored instructions.
  const trimmed = raw.trim();
  const fenceStripped = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const firstBrace = fenceStripped.indexOf("{");
  const lastBrace = fenceStripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return fenceStripped;
  return fenceStripped.slice(firstBrace, lastBrace + 1);
}

// Prompt-injection hardening (§9.2). Strip system-role markers users might
// have smuggled into free-text fields before they reach the model.
function stripPromptInjection(prompt: string): string {
  return prompt
    .replace(/<\|im_(start|end)\|>/gi, "")
    .replace(/\\n(system|assistant|user):/gi, "\n")
    .replace(/\[INST\]|\[\/INST\]/g, "");
}
