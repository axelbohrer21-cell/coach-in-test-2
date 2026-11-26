import { wrapLanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import type { LanguageModelV4, LanguageModelV4Middleware } from "@ai-sdk/provider";

const MAX_OUTPUT_TOKENS = 1024;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const PROVIDER_FAILURE_COOLDOWN_MS = 20_000;
const unavailableUntil = new Map<string, number>();

function providerKey(model: LanguageModelV4): string {
  return `${model.provider}/${model.modelId}`;
}

function isTemporaryProviderFailure(error: unknown): boolean {
  const value = error as {
    status?: number | string;
    statusCode?: number | string;
    response?: { status?: number };
    message?: string;
  };
  const status = Number(value?.statusCode ?? value?.status ?? value?.response?.status);
  if (status === 408 || status === 429 || status >= 500) return true;

  const message = String(value?.message ?? error ?? "").toLowerCase();
  return /rate.?limit|too many requests|quota|resource exhausted|temporarily unavailable|overloaded|capacity|tokens per minute|tpm/.test(message);
}

function cooldownFor(error: unknown): number {
  const value = error as { status?: number | string; statusCode?: number | string; response?: { status?: number } };
  const status = Number(value?.statusCode ?? value?.status ?? value?.response?.status);
  return status === 429 ? RATE_LIMIT_COOLDOWN_MS : PROVIDER_FAILURE_COOLDOWN_MS;
}

function configuredModels(): LanguageModelV4[] {
  const models: LanguageModelV4[] = [groq("openai/gpt-oss-20b")];

  // Optional free-tier providers. Missing keys simply remove that provider
  // from the rotation; they never prevent the Manager from starting.
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    models.push(google("gemini-3.8-flash"));
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

async function runWithFallback<T>(
  operation: (model: LanguageModelV4, isPrimary: boolean) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  let attempted = 0;

  for (const model of providerModels) {
    const key = providerKey(model);
    if ((unavailableUntil.get(key) ?? 0) > Date.now()) continue;
    attempted += 1;

    try {
      const result = await operation(model, model === providerModels[0]);
      unavailableUntil.delete(key);
      return result;
    } catch (error) {
      lastError = error;
      if (!isTemporaryProviderFailure(error)) throw error;

      unavailableUntil.set(key, Date.now() + cooldownFor(error));
      console.warn(
        `[Coach In AI] ${key} temporarily unavailable; switching to the next configured free provider.`,
      );
    }
  }

  if (attempted === 0) {
    throw new Error("Tous les fournisseurs IA configurés sont temporairement en pause après des erreurs de quota ou de disponibilité. La mission peut être relancée automatiquement.");
  }
  throw lastError;
}

const quotaProtection: LanguageModelV4Middleware = {
  specificationVersion: "v4",
  transformParams: async ({ params }) => ({
    ...params,
    maxOutputTokens: Math.min(params.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
  }),
  wrapGenerate: async ({ doGenerate, params }) =>
    runWithFallback((model, isPrimary) =>
      isPrimary ? doGenerate() : model.doGenerate(params),
    ),
  // Provider errors raised before the stream opens can be failed over safely.
  // Errors after the stream starts are not replayed to avoid duplicate output/actions.
  wrapStream: async ({ doStream, params }) =>
    runWithFallback((model, isPrimary) =>
      isPrimary ? doStream() : model.doStream(params),
    ),
};

export function createResilientModel(): LanguageModelV4 {
  return wrapLanguageModel({
    model: providerModels[0],
    middleware: quotaProtection,
  });
}
