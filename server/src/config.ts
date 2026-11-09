import { createAnthropicProvider } from "./providers/anthropic";
import { createGeminiProvider } from "./providers/gemini";
import { createOpenAIProvider } from "./providers/openai";
import { DEFAULT_MODELS, type FetchLike, type ProviderId, type VisionProvider } from "./providers/types";

export type VisionConfig = {
  providerId: ProviderId;
  apiKey: string | null;
  model: string;
};

const PROVIDERS: readonly ProviderId[] = ["gemini", "openai", "anthropic"];

export function resolveVisionConfig(env: NodeJS.ProcessEnv): VisionConfig {
  const requested = env.VISION_PROVIDER?.trim().toLowerCase();
  const providerId: ProviderId = PROVIDERS.includes(requested as ProviderId) ? (requested as ProviderId) : "gemini";
  const specificKey =
    providerId === "anthropic"
      ? env.ANTHROPIC_API_KEY
      : providerId === "openai"
        ? env.OPENAI_API_KEY
        : env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  const apiKey = (env.VISION_API_KEY || specificKey || "").trim() || null;
  const model = env.VISION_MODEL?.trim() || DEFAULT_MODELS[providerId];
  return { providerId, apiKey, model };
}

export function createProvider(config: VisionConfig, fetchImpl?: FetchLike): VisionProvider | null {
  if (!config.apiKey) return null;
  if (config.providerId === "anthropic") {
    return createAnthropicProvider({ apiKey: config.apiKey, model: config.model, fetchImpl });
  }
  if (config.providerId === "openai") {
    return createOpenAIProvider({ apiKey: config.apiKey, model: config.model, fetchImpl });
  }
  return createGeminiProvider({ apiKey: config.apiKey, model: config.model, fetchImpl });
}
