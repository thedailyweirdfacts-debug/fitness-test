import { MEAL_JSON_SCHEMA } from "../json-schema.js";
import { extractJson } from "../json.js";
import { ProviderError } from "../errors.js";
import { SYSTEM_PROMPT, USER_PROMPT } from "../prompt.js";
import { providerMessage } from "./openai.js";
import type { FetchLike, VisionProvider } from "./types.js";

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export function createGeminiProvider(options: {
  apiKey: string;
  model: string;
  fetchImpl?: FetchLike;
}): VisionProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id: "gemini",
    model: options.model,
    async analyze(image) {
      let response: Response;
      try {
        response = await fetchImpl(`${GEMINI_URL}/${encodeURIComponent(options.model)}:generateContent`, {
          method: "POST",
          headers: {
            "x-goog-api-key": options.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [
              {
                role: "user",
                parts: [
                  { text: USER_PROMPT },
                  { inlineData: { mimeType: image.mimeType, data: image.imageBase64 } },
                ],
              },
            ],
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
        throw new ProviderError(await providerMessage(response, options.apiKey));
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
    },
  };
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
