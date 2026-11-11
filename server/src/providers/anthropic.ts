import { MEAL_JSON_SCHEMA } from "../json-schema.js";
import { extractJson } from "../json.js";
import { ProviderError } from "../errors.js";
import { photoSystemPrompt, USER_PROMPT } from "../prompt.js";
import { defaultDishScale, type DishScale } from "../scale.js";
import { providerMessage } from "./openai.js";
import type { FetchLike, VisionProvider } from "./types.js";

export function createAnthropicProvider(options: {
  apiKey: string;
  model: string;
  scale?: DishScale;
  fetchImpl?: FetchLike;
}): VisionProvider {
  const scale = options.scale ?? defaultDishScale();
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id: "anthropic",
    model: options.model,
    async analyze(image) {
      let response: Response;
      try {
        response = await fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": options.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            max_tokens: 4000,
            system: photoSystemPrompt(image.scale ?? scale),
            tools: [
              {
                name: "report_meal",
                description: "Report the structured estimate for the main plate.",
                input_schema: MEAL_JSON_SCHEMA,
              },
            ],
            tool_choice: { type: "tool", name: "report_meal" },
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: image.mimeType,
                      data: image.imageBase64,
                    },
                  },
                  { type: "text", text: USER_PROMPT },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(45_000),
        });
      } catch {
        throw new ProviderError("The vision provider could not be reached.");
      }

      if (!response.ok) {
        throw new ProviderError(await providerMessage(response, options.apiKey));
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; name?: string; input?: unknown; text?: string }>;
      };
      const tool = data.content?.find((block) => block.type === "tool_use" && block.input);
      if (tool?.input) return tool.input;
      const text = data.content?.find((block) => block.type === "text" && block.text)?.text;
      if (text) {
        try {
          return extractJson(text);
        } catch {
          throw new ProviderError("The model did not return a meal estimate.");
        }
      }
      throw new ProviderError("The model did not return a meal estimate.");
    },
  };
}
