import { MEAL_JSON_SCHEMA } from "../json-schema";
import { extractJson } from "../json";
import { ProviderError } from "../errors";
import { SYSTEM_PROMPT, USER_PROMPT } from "../prompt";
import type { FetchLike, VisionProvider } from "./types";

export function createOpenAIProvider(options: {
  apiKey: string;
  model: string;
  fetchImpl?: FetchLike;
}): VisionProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    id: "openai",
    model: options.model,
    async analyze(image) {
      let response: Response;
      try {
        response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "text", text: USER_PROMPT },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${image.mimeType};base64,${image.imageBase64}`,
                      detail: "auto",
                    },
                  },
                ],
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "meal_analysis",
                strict: true,
                schema: MEAL_JSON_SCHEMA,
              },
            },
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
        choices?: Array<{ message?: { content?: string; refusal?: string } }>;
      };
      const message = data.choices?.[0]?.message;
      if (message?.refusal) throw new ProviderError(message.refusal);
      if (typeof message?.content !== "string" || message.content.length === 0) {
        throw new ProviderError("The model did not return a meal estimate.");
      }
      try {
        return extractJson(message.content);
      } catch {
        throw new ProviderError("The model did not return a meal estimate.");
      }
    },
  };
}

export async function providerMessage(response: Response, secret: string): Promise<string> {
  const text = await response.text();
  let message = text.slice(0, 300);
  try {
    const json = JSON.parse(text) as { error?: { message?: string } };
    if (typeof json.error?.message === "string") message = json.error.message.slice(0, 300);
  } catch {
    // keep the text snippet
  }
  if (secret) message = message.split(secret).join("[redacted]");
  return message || `Provider request failed (${response.status}).`;
}
