import { wrapLanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { LanguageModelV4, LanguageModelV4Middleware } from "@ai-sdk/provider";

const MAX_OUTPUT_TOKENS = 1024;

function isTemporaryProviderFailure(error: unknown): boolean {
  const value = error as {
    status?: number | string;
    statusCode?: number | string;
    response?: { status?: number };
    message?: string;
    cause?: unknown;
  };
  const status = Number(value?.statusCode ?? value?.status ?? value?.response?.status);
  if (status === 408 || status === 429 || status >= 500) return true;

  const message = String(value?.message ?? error ?? "").toLowerCase();
  return /rate.?limit|too many requests|quota|resource exhausted|temporarily unavailable|overloaded|capacity|tokens per minute|tpm/.test(message);
}

function configuredModels(): LanguageModelV4[] {
  const models: LanguageModelV4[] = [
    groq("openai/gpt-oss-20b"),
  ];

  // Optional free-tier providers. Missing keys simply remove that provider
  // from the rotation; they never prevent the Manager from starting.
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    models.push(google("gemini-2.5-flash"));
  }

  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    models.push(openrouter.chatModel("openrouter/free"));
  }

  return models;
}

const providerModels = configuredModels();

const quotaProtection: LanguageModelV4Middleware = {
  specificationVersion: "v4",
  transformParams: async ({ params }) => ({
    ...params,
    maxOutputTokens: Math.min(params.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
  }),
  wrapGenerate: async ({ doGenerate, params }) => {
    let lastError: unknown;
    for (let index = 0; index < providerModels.length; index += 1) {
      try {
        return index === 0
          ? await doGenerate()
          : await providerModels[index].doGenerate(params);
      } catch (error) {
        lastError = error;
        if (!isTemporaryProviderFailure(error) || index === providerModels.length - 1) {
          throw error;
        }
        console.warn(
          `[Coach In AI] Provider ${index + 1}/${providerModels.length} unavailable; switching to the next configured free provider.`,
        );
      }
    }
    throw lastError;
  },
  wrapStream: async ({ doStream, params }) => {
    let lastError: unknown;
    for (let index = 0; index < providerModels.length; index += 1) {
      try {
        return index === 0
          ? await doStream()
          : await providerModels[index].doStream(params);
      } catch (error) {
        lastError = error;
        if (!isTemporaryProviderFailure(error) || index === providerModels.length - 1) {
          throw error;
        }
        console.warn(
          `[Coach In AI] Streaming provider ${index + 1}/${providerModels.length} unavailable before stream start; switching to the next configured free provider.`,
        );
      }
    }
    throw lastError;
  },
};

export function createResilientModel(): LanguageModelV4 {
  return wrapLanguageModel({
    model: providerModels[0],
    middleware: quotaProtection,
  });
}
