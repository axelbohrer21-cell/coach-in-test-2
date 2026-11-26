import { wrapLanguageModel } from "ai";
import type { LanguageModelV3Middleware } from "@ai-sdk/provider";
import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

const primaryModel = groq("openai/gpt-oss-20b");

// Keep a bounded response size while leaving enough room for compaction summaries.
// Qwen fallback remains disabled because its organization-wide OTPM quota was exceeded.
const quotaProtection: LanguageModelV3Middleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => ({
    ...params,
    maxOutputTokens: Math.min(params.maxOutputTokens ?? 2048, 2048),
  }),
};

const model = wrapLanguageModel({ model: primaryModel, middleware: quotaProtection });

export default defineAgent({
  description: "Coordinate the full Coach In product and engineering team, route work to specialists, inspect evidence, and prepare changes for human approval.",
  model,
  modelContextWindowTokens: 131072,
  // Compact at 75% of context rather than 5%, which caused premature summaries.
  compaction: { threshold: 0.75, model, modelContextWindowTokens: 131072 },
  defaultTools: false,
});
