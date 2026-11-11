import { describe, expect, it } from "vitest";
import { createProvider, resolveVisionConfig } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { extractJson } from "./json.js";
import { createGeminiProvider, GEMINI_RETRY_DELAY_MS, SCANNER_BUSY_MESSAGE } from "./providers/gemini.js";

const apple = {
  items: [
    { name: "Apple", grams: 180, portionLabel: "1 apple", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  ],
  confidence: "high",
  notes: "A whole apple next to a fork.",
  excluded: [],
};

describe("vision config", () => {
  it("picks a provider and never requires the key to live in the app", () => {
    expect(resolveVisionConfig({})).toMatchObject({ providerId: "gemini", apiKey: null, model: "gemini-3.5-flash-lite" });
    expect(resolveVisionConfig({ GEMINI_API_KEY: "AIza-free" })).toMatchObject({
      providerId: "gemini",
      apiKey: "AIza-free",
      model: "gemini-3.5-flash-lite",
    });
    expect(resolveVisionConfig({ GOOGLE_API_KEY: "google-key" }).apiKey).toBe("google-key");
    expect(resolveVisionConfig({ VISION_PROVIDER: "anthropic", VISION_API_KEY: "sk-ant" })).toMatchObject({
      providerId: "anthropic",
      apiKey: "sk-ant",
      model: "claude-haiku-5-5",
    });
    expect(resolveVisionConfig({ OPENAI_API_KEY: "sk-live", GEMINI_API_KEY: "AIza" }).providerId).toBe("gemini");
    expect(resolveVisionConfig({ VISION_PROVIDER: "openai", VISION_MODEL: "gpt-5.4", OPENAI_API_KEY: "sk" })).toMatchObject({
      providerId: "openai",
      model: "gpt-5.4",
      apiKey: "sk",
    });
    expect(
      resolveVisionConfig({ VISION_PROVIDER: "gemini", VISION_MODEL: "gemini-3.5-flash-lite", GEMINI_API_KEY: "g" }).model,
    ).toBe("gemini-3.5-flash-lite");
    expect(resolveVisionConfig({}).fallbackModels).toEqual(["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.6-flash"]);
    expect(resolveVisionConfig({ VISION_MODEL: "gemini-3.8-flash" }).fallbackModels).toEqual([
      "gemini-3.1-flash-lite",
      "gemini-3.6-flash",
    ]);
    expect(
      resolveVisionConfig({
        VISION_MODEL: "gemini-3.8-flash",
        VISION_FALLBACK_MODELS: "gemini-3.1-flash-lite, gemini-3.5-flash-lite",
      }).fallbackModels,
    ).toEqual(["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
    expect(resolveVisionConfig({ VISION_FALLBACK_MODELS: "" }).fallbackModels).toEqual([]);
    expect(resolveVisionConfig({ VISION_PROVIDER: "openai", OPENAI_API_KEY: "sk" }).fallbackModels).toEqual([]);
    expect(createProvider(resolveVisionConfig({}))).toBeNull();
  });
});

describe("openai provider", () => {
  it("asks for structured json and keeps the key out of the body", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = createProvider(
      { providerId: "openai", apiKey: "sk-test-secret", model: "gpt-5.4-mini" },
      async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(apple) } }] }), {
          status: 200,
        });
      },
    );

    const raw = await provider?.analyze({ imageBase64: "aaaa", mimeType: "image/jpeg" });
    expect(raw).toEqual(apple);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test-secret");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.messages[0].content).toContain("other people's plates");
    expect(body.messages[0].content).toContain("9.5 inches (24.13 cm)");
    expect(body.messages[0].content).toContain("7.5 inches (19.05 cm)");
    expect(body.messages[1].content[1].image_url.url).toBe("data:image/jpeg;base64,aaaa");
    expect(JSON.stringify(body)).not.toContain("sk-test-secret");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("scraps");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("fork");
  });

  it("redacts the key from an upstream error", async () => {
    const provider = createProvider(
      { providerId: "openai", apiKey: "sk-test-secret", model: "gpt-5.4-mini" },
      async () => new Response(JSON.stringify({ error: { message: "bad key sk-test-secret" } }), { status: 401 }),
    );
    await expect(provider?.analyze({ imageBase64: "aaaa", mimeType: "image/jpeg" })).rejects.toThrow("[redacted]");
  });
});

describe("anthropic provider", () => {
  it("reads the tool payload", async () => {
    const provider = createProvider(
      { providerId: "anthropic", apiKey: "ant-secret", model: "claude-haiku-5-5" },
      async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.tool_choice).toEqual({ type: "tool", name: "report_meal" });
        expect(body.messages[0].content[0].source.data).toBe("bbbb");
        expect(JSON.stringify(body)).not.toContain("ant-secret");
        return new Response(
          JSON.stringify({ content: [{ type: "tool_use", name: "report_meal", input: apple }] }),
          { status: 200 },
        );
      },
    );
    await expect(provider?.analyze({ imageBase64: "bbbb", mimeType: "image/png" })).resolves.toEqual(apple);
  });
});

describe("gemini provider", () => {
  it("asks Flash for structured json and keeps the key out of the body and url", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = createProvider(
      { providerId: "gemini", apiKey: "AIza-test-secret", model: "gemini-3.8-flash" },
      async (url, init) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(apple) }] } }] }),
          { status: 200 },
        );
      },
    );

    await expect(provider?.analyze({ imageBase64: "cccc", mimeType: "image/jpeg" })).resolves.toEqual(apple);
    expect(calls[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    );
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("AIza-test-secret");
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.properties.items).toBeTruthy();
    expect(JSON.stringify(body.generationConfig.responseJsonSchema)).not.toContain("additionalProperties");
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "cccc" });
    expect(body.systemInstruction.parts[0].text).toContain("other people's plates");
    expect(body.systemInstruction.parts[0].text).toContain("9.5 inches (24.13 cm)");
    expect(body.systemInstruction.parts[0].text).toContain("paper plate");
    expect(calls[0]?.url).not.toContain("AIza-test-secret");
    expect(JSON.stringify(body)).not.toContain("AIza-test-secret");
  });

  it("redacts the key from an upstream error", async () => {
    const provider = createProvider(
      { providerId: "gemini", apiKey: "AIza-test-secret", model: "gemini-3.8-flash" },
      async () => new Response(JSON.stringify({ error: { message: "bad key AIza-test-secret" } }), { status: 400 }),
    );
    await expect(provider?.analyze({ imageBase64: "cccc", mimeType: "image/jpeg" })).rejects.toThrow("[redacted]");
  });

  it("retries a busy primary once, then uses the backup that answers", async () => {
    const urls: string[] = [];
    const sleeps: number[] = [];
    const logs: string[] = [];
    const provider = createGeminiProvider({
      apiKey: "AIza-test-secret",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchImpl: async (url) => {
        urls.push(url);
        if (urls.length < 3) {
          return new Response(
            JSON.stringify({
              error: {
                message: "This model is currently experiencing high demand. Please try again later.",
                status: "UNAVAILABLE",
              },
            }),
            { status: 503 },
          );
        }
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(apple) }] } }] }),
          { status: 200 },
        );
      },
    });
    const spy = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      await expect(provider.analyze({ imageBase64: "cccc", mimeType: "image/jpeg" })).resolves.toEqual(apple);
    } finally {
      console.log = spy;
    }
    expect(urls.map((url) => url.split("/models/")[1]?.split(":")[0])).toEqual([
      "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.6-flash",
    ]);
    expect(sleeps).toEqual([GEMINI_RETRY_DELAY_MS]);
    expect(GEMINI_RETRY_DELAY_MS).toBeGreaterThanOrEqual(500);
    expect(GEMINI_RETRY_DELAY_MS).toBeLessThanOrEqual(1000);
    expect(logs.some((line) => line.includes("Plateful vision answer from gemini-3.6-flash"))).toBe(true);
  });

  it("returns a friendly 503 when every model is busy", async () => {
    const urls: string[] = [];
    const provider = createGeminiProvider({
      apiKey: "AIza-test-secret",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
      sleep: async () => undefined,
      fetchImpl: async (url) => {
        urls.push(url);
        const status = urls.length % 2 === 0 ? 429 : 503;
        return new Response(
          JSON.stringify({ error: { message: "Resource exhausted", status: "RESOURCE_EXHAUSTED" } }),
          { status },
        );
      },
    });
    await expect(provider.analyze({ imageBase64: "cccc", mimeType: "image/jpeg" })).rejects.toMatchObject({
      status: 503,
      message: SCANNER_BUSY_MESSAGE,
    });
    expect(urls).toHaveLength(4);
  });

  it("does not fall back on a non-busy error", async () => {
    let calls = 0;
    const provider = createGeminiProvider({
      apiKey: "AIza-test-secret",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.6-flash"],
      sleep: async () => {
        throw new Error("should not wait");
      },
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ error: { message: "Request payload is invalid" } }), { status: 400 });
      },
    });
    await expect(provider.analyze({ imageBase64: "cccc", mimeType: "image/jpeg" })).rejects.toThrow(
      "Request payload is invalid",
    );
    expect(calls).toBe(1);
  });

  it("sends every recipe photo in one request and falls back when the primary is busy", async () => {
    const urls: string[] = [];
    const provider = createGeminiProvider({
      apiKey: "AIza-test-secret",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.6-flash"],
      sleep: async () => undefined,
      fetchImpl: async (url, init) => {
        urls.push(url);
        const body = JSON.parse(String(init?.body)) as {
          systemInstruction?: { parts?: Array<{ text?: string }> };
          contents?: Array<{ parts?: Array<{ text?: string; inlineData?: { data?: string } }> }>;
        };
        const parts = body.contents?.[0]?.parts ?? [];
        expect(parts.filter((part) => part.inlineData).map((part) => part.inlineData?.data)).toEqual(["rice", "chicken", "dish"]);
        expect(body.systemInstruction?.parts?.[0]?.text).toContain("whole batch");
        expect(body.systemInstruction?.parts?.[0]?.text).toContain("9.5 inches (24.13 cm)");
        expect(body.systemInstruction?.parts?.[0]?.text).toContain("sanity check");
        expect(parts[0]?.text).toContain("9.5 inches (24.13 cm)");
        expect(parts[0]?.text).toContain("2 cups rice");
        if (urls.length < 3) {
          return new Response(JSON.stringify({ error: { message: "high demand", status: "UNAVAILABLE" } }), { status: 503 });
        }
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(apple) }] } }] }), {
          status: 200,
        });
      },
    });
    await expect(
      provider.analyzeRecipe?.({
        lines: ["2 cups rice"],
        images: [
          { imageBase64: "rice", mimeType: "image/jpeg", role: "ingredient" },
          { imageBase64: "chicken", mimeType: "image/jpeg", role: "ingredient" },
          { imageBase64: "dish", mimeType: "image/jpeg", role: "dish" },
        ],
      }),
    ).resolves.toEqual(apple);
    expect(urls.map((url) => url.split("/models/")[1]?.split(":")[0])).toEqual([
      "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.6-flash",
    ]);
  });
});

describe("extractJson", () => {
  it("parses fenced json", () => {
    expect(extractJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });
});
