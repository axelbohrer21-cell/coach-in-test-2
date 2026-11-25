import { wrapLanguageModel } from "ai";
import type { LanguageModelV3Middleware } from "@ai-sdk/provider";
import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

const primaryModel = groq("openai/gpt-oss-20b");

// Keep the request within a conservative output budget.
// Qwen fallback is intentionally disabled: its organization-wide OTPM quota
// can be exceeded by several parallel specialist calls even when each call
// has an individual maxOutputTokens limit.
const quotaProtection: LanguageModelV3Middleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => ({
    ...params,
    maxOutputTokens: Math.min(params.maxOutputTokens ?? 1024, 1024),
  }),
};

const model = wrapLanguageModel({ model: primaryModel, middleware: quotaProtection });

export default defineAgent({
  model,
  modelContextWindowTokens: 131072,
  compaction: { threshold: 0.05, model, modelContextWindowTokens: 131072 },
  defaultTools: false,
});
