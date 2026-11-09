import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAIProvider } from "./providers/openai";
import { DEFAULT_MODELS, type FetchLike, type ProviderId, type VisionProvider } from "./providers/types";

export type VisionConfig = {
  providerId: ProviderId;
  apiKey: string | null;
  model: string;
};

export function resolveVisionConfig(env: NodeJS.ProcessEnv): VisionConfig {
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(env.OPENAI_API_KEY);
  const requested = env.VISION_PROVIDER?.trim().toLowerCase();
  let providerId: ProviderId;
  if (requested === "anthropic" || requested === "openai") {
    providerId = requested;
  } else if (hasAnthropic && !hasOpenAI) {
    providerId = "anthropic";
  } else {
    providerId = "openai";
  }

  const specificKey = providerId === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const apiKey = (env.VISION_API_KEY || specificKey || "").trim() || null;
  const model = env.VISION_MODEL?.trim() || DEFAULT_MODELS[providerId];
  return { providerId, apiKey, model };
}

export function createProvider(config: VisionConfig, fetchImpl?: FetchLike): VisionProvider | null {
  if (!config.apiKey) return null;
  if (config.providerId === "anthropic") {
    return createAnthropicProvider({ apiKey: config.apiKey, model: config.model, fetchImpl });
  }
  return createOpenAIProvider({ apiKey: config.apiKey, model: config.model, fetchImpl });
}
