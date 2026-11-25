import { wrapLanguageModel } from "ai";
import type { LanguageModelV3Middleware } from "@ai-sdk/provider";
import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

const primaryModel = groq("openai/gpt-oss-20b");
const fallbackModel = groq("qwen/qwen3.8-27b");

function isRateLimitError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { status?: unknown; statusCode?: unknown; message?: unknown; cause?: unknown };
    if (value.status === 429 || value.statusCode === 429) return true;
    if (typeof value.message === "string" && /\b429\b|rate.?limit|too many requests/i.test(value.message)) return true;
    current = value.cause;
  }
  return false;
}

const freeQuotaProtection: LanguageModelV3Middleware = {
  specificationVersion: "v3",
  // Bound every completion and let Eve compact older conversation turns.
  transformParams: async ({ params }) => ({
    ...params,
    maxOutputTokens: Math.min(params.maxOutputTokens ?? 2048, 2048),
  }),
  // Both models are available on Groq's Free tier with separate model limits.
  // Fail over only on 429; authentication/configuration errors remain visible.
  wrapGenerate: async ({ doGenerate, params }) => {
    try {
      return await doGenerate();
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
      return fallbackModel.doGenerate(params);
    }
  },
  wrapStream: async ({ doStream, params }) => {
    try {
      return await doStream();
    } catch (error) {
      if (!isRateLimitError(error)) throw error;
      return fallbackModel.doStream(params);
    }
  },
};

const model = wrapLanguageModel({ model: primaryModel, middleware: freeQuotaProtection });

export default defineAgent({
  model,
  modelContextWindowTokens: 131072,
  // Compact at 5% of context to keep typical prompts under the free TPM ceiling.
  compaction: { threshold: 0.05, model, modelContextWindowTokens: 131072 },
  defaultTools: false,
});
