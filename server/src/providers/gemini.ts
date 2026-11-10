import { MEAL_JSON_SCHEMA } from "../json-schema.js";
import { extractJson } from "../json.js";
import { ProviderError } from "../errors.js";
import { RECIPE_SYSTEM_PROMPT, recipeUserPrompt, SYSTEM_PROMPT, TEXT_SYSTEM_PROMPT, textUserPrompt, USER_PROMPT } from "../prompt.js";
import { providerMessage } from "./openai.js";
import type { FetchLike, RecipeVisionRequest, VisionImage, VisionProvider } from "./types.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Image-capable models from the Gemini API model list (checked November 2026):
 * https://ai.google.dev/gemini-api/docs/models
 * 3.6 Flash is the previous stable multimodal Flash. 3.5 Flash-Lite is the
 * high-throughput model with the larger free daily quota.
 */
export const DEFAULT_GEMINI_FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"] as const;

/** One short wait before the second try of the primary model. */
export const GEMINI_RETRY_DELAY_MS = 750;

/** Leave headroom under the 60s Vercel maxDuration for /api/analyze. */
const ESTIMATE_BUDGET_MS = 45_000;

export const SCANNER_BUSY_MESSAGE = "The food scanner is busy right now. Try again in a minute.";

export function isGeminiBusy(status: number, detail: string): boolean {
  if (status === 503 || status === 429) return true;
  const text = detail.toLowerCase();
  return (
    text.includes("unavailable") ||
    text.includes("resource_exhausted") ||
    text.includes("high demand") ||
    text.includes("overloaded")
  );
}

/** `configured` undefined uses the defaults. An empty string disables fallbacks. */
export function geminiFallbackModels(primary: string, configured?: string | null): string[] {
  const source = configured == null ? DEFAULT_GEMINI_FALLBACK_MODELS : configured.split(",");
  const seen = new Set<string>();
  const models: string[] = [];
  for (const part of source) {
    const model = part.trim();
    if (!model || model === primary || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }
  return models;
}

class BusyModelError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "BusyModelError";
  }
}

export function createGeminiProvider(options: {
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): VisionProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? delay;
  const now = options.now ?? Date.now;
  const fallbacks = (options.fallbackModels ?? geminiFallbackModels(options.model)).filter(
    (model) => model && model !== options.model,
  );

  return {
    id: "gemini",
    model: options.model,
    analyze(image) {
      return runChain((model) => requestModel(fetchImpl, options.apiKey, model, image), "vision");
    },
    analyzeText(text) {
      return runChain((model) => requestText(fetchImpl, options.apiKey, model, text), "text");
    },
    analyzeRecipe(request) {
      return runChain((model) => requestRecipe(fetchImpl, options.apiKey, model, request), "recipe");
    },
  };

  async function runChain(call: (model: string) => Promise<unknown>, kind: "vision" | "text" | "recipe"): Promise<unknown> {
    const started = now();
    const chain = [options.model, ...fallbacks];
    let sawBusy = false;

    for (let index = 0; index < chain.length; index += 1) {
      const model = chain[index] ?? options.model;
      const attempts = index === 0 ? 2 : 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (now() - started > ESTIMATE_BUDGET_MS) {
          sawBusy = true;
          break;
        }
        if (index === 0 && attempt === 1) await sleep(GEMINI_RETRY_DELAY_MS);
        try {
          const meal = await call(model);
          console.log(`Plateful ${kind} answer from ${model}`);
          return meal;
        } catch (error) {
          if (!(error instanceof BusyModelError)) throw error;
          sawBusy = true;
          console.log(`Plateful ${kind} model ${model} is busy: ${error.detail.slice(0, 180)}`);
        }
      }
    }

    if (sawBusy) {
      console.log(`Plateful ${kind}: every Gemini model was busy`);
      throw new ProviderError(SCANNER_BUSY_MESSAGE, 503);
    }
    throw new ProviderError("The vision provider could not be reached.");
  }
}

async function requestModel(fetchImpl: FetchLike, apiKey: string, model: string, image: VisionImage): Promise<unknown> {
  return requestGemini(fetchImpl, apiKey, model, SYSTEM_PROMPT, [
    { text: USER_PROMPT },
    { inlineData: { mimeType: image.mimeType, data: image.imageBase64 } },
  ]);
}

async function requestText(fetchImpl: FetchLike, apiKey: string, model: string, description: string): Promise<unknown> {
  return requestGemini(fetchImpl, apiKey, model, TEXT_SYSTEM_PROMPT, [{ text: textUserPrompt(description) }]);
}

async function requestRecipe(fetchImpl: FetchLike, apiKey: string, model: string, request: RecipeVisionRequest): Promise<unknown> {
  const ingredientPhotos = request.images.filter((image) => image.role === "ingredient").length;
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      text: recipeUserPrompt({
        lines: request.lines,
        ingredientPhotos,
        dishPhoto: request.images.some((image) => image.role === "dish"),
      }),
    },
  ];
  for (const image of request.images) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.imageBase64 } });
  }
  return requestGemini(fetchImpl, apiKey, model, RECIPE_SYSTEM_PROMPT, parts);
}

async function requestGemini(
  fetchImpl: FetchLike,
  apiKey: string,
  model: string,
  systemPrompt: string,
  parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: schemaForGemini(MEAL_JSON_SCHEMA),
        },
      }),
    });
  } catch {
    throw new ProviderError("The vision provider could not be reached.");
  }

  if (!response.ok) {
    const message = await providerMessage(response, apiKey);
    if (isGeminiBusy(response.status, message)) throw new BusyModelError(message);
    throw new ProviderError(message);
  }

  let payload: GeminiResponse;
  try {
    payload = (await response.json()) as GeminiResponse;
  } catch {
    throw new ProviderError("The vision provider returned an unreadable response.");
  }

  if (payload.promptFeedback?.blockReason) {
    throw new ProviderError("The vision provider refused that photo.");
  }

  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new ProviderError("The model did not return a meal estimate.");
  }
  try {
    return extractJson(text);
  } catch {
    throw new ProviderError("The model did not return a meal estimate.");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

/** Gemini's structured-output schema is a subset of JSON Schema. */
export function schemaForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map((item) => schemaForGemini(item));
  if (!schema || typeof schema !== "object") return schema;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === "additionalProperties") continue;
    next[key] = schemaForGemini(value);
  }
  return next;
}
