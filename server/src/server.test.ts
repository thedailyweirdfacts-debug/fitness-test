import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { quotaDayKey } from "../../shared/src/account.js";
import { createMemoryQuota, type QuotaStore } from "./accounts.js";
import { ProviderError } from "./errors.js";
import { createRateLimiter } from "./rate-limit.js";
import { TEXT_NO_FOOD_MESSAGE } from "./analyze.js";
import { PRODUCT_INVALID_MESSAGE, PRODUCT_MISSING_MESSAGE, type OffLookup } from "./open-food-facts.js";
import { createGeminiProvider, SCANNER_BUSY_MESSAGE } from "./providers/gemini.js";
import { createServer } from "./server.js";
import type { VisionProvider } from "./providers/types.js";

const SECRET = "test-secret";

const apple = {
  items: [
    { name: "Apple", grams: 180, portionLabel: "1 apple", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
  ],
  confidence: "high",
  notes: "A whole apple.",
  excluded: [] as string[],
};

function providerReturning(raw: unknown): VisionProvider {
  return {
    id: "openai",
    model: "test-model",
    async analyze() {
      return raw;
    },
  };
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  return address.port;
}

describe("POST /api/analyze", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  });

  async function start(
    provider: VisionProvider | null,
    extra?: {
      bodyLimit?: number;
      appSecret?: string | null;
      perMinute?: number;
      dailyCap?: number;
      accounts?: boolean;
      quota?: QuotaStore;
      lookupProduct?: (barcode: string) => Promise<OffLookup>;
    },
  ) {
    const accounts = extra?.accounts !== false;
    const server = createServer({
      provider,
      providerId: "gemini",
      model: "gemini-3.8-flash",
      appSecret: extra && "appSecret" in extra ? extra.appSecret : SECRET,
      bodyLimit: extra?.bodyLimit,
      dailyCap: extra?.dailyCap ?? 10,
      rateLimiter: createRateLimiter({ perMinute: extra?.perMinute ?? 5, perDay: 60 }),
      verifyUser: accounts
        ? async (token) => (token === "user-a" || token === "user-b" ? { userId: token } : null)
        : undefined,
      quota: accounts ? (extra?.quota ?? createMemoryQuota()) : undefined,
      lookupProduct: extra?.lookupProduct,
    });
    servers.push(server);
    const port = await listen(server);
    return `http://127.0.0.1:${port}`;
  }

  function post(
    base: string,
    body: string,
    secret: string | null = SECRET,
    token: string | null = "user-a",
    path = "/api/analyze",
  ) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["x-plateful-secret"] = secret;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}${path}`, { method: "POST", headers, body });
  }

  function get(base: string, path: string, token: string | null = "user-a", secret: string | null = SECRET) {
    const headers: Record<string, string> = {};
    if (secret) headers["x-plateful-secret"] = secret;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}${path}`, { headers });
  }

  const canned = {
    items: [
      {
        name: "Red Bull Energy Drink",
        grams: 250,
        portionLabel: "1 package (250 ml)",
        calories: 110,
        protein: 0,
        carbs: 27,
        fat: 0,
      },
    ],
    totals: { calories: 110, protein: 0, carbs: 27, fat: 0 },
    confidence: "high" as const,
    notes: "Open Food Facts for the whole package (250 ml). 27 g sugar.",
    excluded: [] as string[],
  };

  it("reports health without a key and refuses to estimate", async () => {
    const base = await start(null);
    const health = await fetch(`${base}/api/health`);
    const body = await health.json();
    expect(body).toEqual({
      ok: true,
      provider: "gemini",
      model: "gemini-3.8-flash",
      configured: false,
      protected: true,
      accounts: true,
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-|api[_-]?key|test-secret/i);

    const missing = await post(base, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ error: "not_configured" });
  });

  it("accepts a signed-in person, and refuses a bad secret, a missing token, or a server with no accounts", async () => {
    let calls = 0;
    const provider: VisionProvider = {
      id: "gemini",
      model: "gemini-3.8-flash",
      async analyze() {
        calls += 1;
        return apple;
      },
    };
    const open = await start(provider, { appSecret: null });
    const signedIn = await post(open, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }), null);
    expect(signedIn.status).toBe(200);

    const locked = await start(provider);
    const wrong = await post(locked, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }), "nope");
    expect(wrong.status).toBe(401);
    const stranger = await post(locked, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }), SECRET, null);
    expect(stranger.status).toBe(401);
    const unsigned = await start(provider, { accounts: false });
    const refused = await post(unsigned, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }));
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ error: "accounts_not_configured" });
    expect(calls).toBe(1);
  });

  it("stops a burst of scans", async () => {
    const base = await start(providerReturning(apple), { perMinute: 2 });
    const body = JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" });
    expect((await post(base, body)).status).toBe(200);
    expect((await post(base, body)).status).toBe(200);
    const blocked = await post(base, body);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });

  it("accepts a photo body that also includes a uri", async () => {
    let seen: { imageBase64: string; mimeType: string } | null = null;
    const provider: VisionProvider = {
      id: "gemini",
      model: "gemini-3.8-flash",
      async analyze(image) {
        seen = image;
        return apple;
      },
    };
    const base = await start(provider);
    const response = await post(
      base,
      JSON.stringify({
        uri: "file:///data/user/0/com.plateful.app/cache/plate.jpg",
        imageBase64: "a".repeat(40),
        mimeType: "image/jpeg",
      }),
    );
    expect(response.status).toBe(200);
    expect(seen).toEqual({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" });
  });

  it("returns validated items with totals computed on the server", async () => {
    const base = await start(providerReturning(apple));
    const response = await post(
      base,
      JSON.stringify({
        imageBase64: `data:image/jpeg;base64,${"a".repeat(40)}`,
        mimeType: "image/jpg",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { totals: unknown; items: unknown[] };
    expect(body.totals).toEqual({ calories: 95, protein: 0.5, carbs: 25, fat: 0.3 });
    expect(body.items).toHaveLength(1);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("maps an empty plate, a bad body, a bad model payload, and an oversized photo", async () => {
    const base = await start(providerReturning({ items: [], confidence: "low", notes: "", excluded: [] }), {
      bodyLimit: 160,
    });

    const empty = await post(base, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }));
    expect(empty.status).toBe(422);

    const bad = await post(base, JSON.stringify({ imageBase64: "a".repeat(40) }));
    expect(bad.status).toBe(400);

    const junk = await post(base, "{");
    expect(junk.status).toBe(400);

    const huge = await post(base, JSON.stringify({ imageBase64: "a".repeat(200), mimeType: "image/jpeg" }));
    expect(huge.status).toBe(413);

    const missing = await fetch(`${base}/nope`);
    expect(missing.status).toBe(404);
  });

  it("turns a schema miss from the model into a 502", async () => {
    const base = await start(providerReturning({ not: "a meal" }));
    const response = await post(base, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/png" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "invalid_estimate" });
  });

  it("gives each person their own daily scans and refunds a failed estimate", async () => {
    let calls = 0;
    const provider: VisionProvider = {
      id: "gemini",
      model: "gemini-3.8-flash",
      async analyze() {
        calls += 1;
        if (calls === 1) throw new ProviderError("model down");
        return apple;
      },
    };
    const base = await start(provider, { dailyCap: 1 });
    const body = JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" });
    expect((await post(base, body)).status).toBe(502);
    const retry = await post(base, body);
    expect(retry.status).toBe(200);
    expect(retry.headers.get("x-scans-remaining")).toBe("0");
    expect((await post(base, body)).status).toBe(429);
    expect((await post(base, body, SECRET, "user-b")).status).toBe(200);

    const quota = await fetch(`${base}/api/quota`, { headers: { Authorization: "Bearer user-a", "x-plateful-secret": SECRET } });
    expect(await quota.json()).toEqual({ used: 1, remaining: 0, limit: 1 });
  });

  it("keeps the scan when a backup model answers and refunds it when every model is busy", async () => {
    const body = JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" });
    const meal = JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(apple) }] } }] });
    let calls = 0;
    const backup = createGeminiProvider({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.6-flash"],
      sleep: async () => undefined,
      fetchImpl: async () => {
        calls += 1;
        if (calls < 3) {
          return new Response(JSON.stringify({ error: { message: "high demand", status: "UNAVAILABLE" } }), { status: 503 });
        }
        return new Response(meal, { status: 200 });
      },
    });
    const saved = await start(backup, { dailyCap: 1 });
    const ok = await post(saved, body);
    expect(ok.status).toBe(200);
    const kept = await fetch(`${saved}/api/quota`, {
      headers: { Authorization: "Bearer user-a", "x-plateful-secret": SECRET },
    });
    expect(await kept.json()).toEqual({ used: 1, remaining: 0, limit: 1 });

    const busy = createGeminiProvider({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.6-flash"],
      sleep: async () => undefined,
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "overloaded", status: "UNAVAILABLE" } }), { status: 503 }),
    });
    const base = await start(busy, { dailyCap: 1 });
    const failed = await post(base, body);
    expect(failed.status).toBe(503);
    expect(await failed.json()).toMatchObject({ error: "provider_busy", message: SCANNER_BUSY_MESSAGE });
    const refunded = await fetch(`${base}/api/quota`, {
      headers: { Authorization: "Bearer user-a", "x-plateful-secret": SECRET },
    });
    expect(await refunded.json()).toEqual({ used: 0, remaining: 1, limit: 1 });
  });

  it("requires a signed-in person for a typed meal", async () => {
    const provider: VisionProvider = {
      id: "gemini",
      model: "gemini-3.8-flash",
      async analyze() {
        return apple;
      },
      async analyzeText() {
        return apple;
      },
    };
    const body = JSON.stringify({ text: "Chick-fil-A grilled chicken sandwich with a medium fry" });
    const locked = await start(provider);
    expect((await post(locked, body, "nope", "user-a", "/api/analyze-text")).status).toBe(401);
    expect((await post(locked, body, SECRET, null, "/api/analyze-text")).status).toBe(401);
    const unsigned = await start(provider, { accounts: false });
    const refused = await post(unsigned, body, SECRET, "user-a", "/api/analyze-text");
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ error: "accounts_not_configured" });
    expect((await fetch(`${locked}/api/analyze-text`)).status).toBe(405);
  });

  it("validates a typed meal, strips unknown keys, and refunds a rejected description", async () => {
    let seen = "";
    const provider: VisionProvider = {
      id: "gemini",
      model: "gemini-3.8-flash",
      async analyze() {
        return apple;
      },
      async analyzeText(text) {
        seen = text;
        return apple;
      },
    };
    const base = await start(provider, { dailyCap: 1 });
    const path = "/api/analyze-text";

    const missing = await post(base, JSON.stringify({ note: "no text" }), SECRET, "user-a", path);
    expect(missing.status).toBe(400);
    const blank = await post(base, JSON.stringify({ text: "   " }), SECRET, "user-a", path);
    expect(blank.status).toBe(400);
    const huge = await post(base, JSON.stringify({ text: "a".repeat(501) }), SECRET, "user-a", path);
    expect(huge.status).toBe(400);

    const accepted = await post(
      base,
      JSON.stringify({
        text: "  Chick-fil-A grilled chicken sandwich with a medium fry  ",
        uri: "file:///should-be-ignored",
      }),
      SECRET,
      "user-a",
      path,
    );
    expect(accepted.status).toBe(200);
    expect(seen).toBe("Chick-fil-A grilled chicken sandwich with a medium fry");
    const body = (await accepted.json()) as { totals: { calories: number }; items: unknown[] };
    expect(body.items).toHaveLength(1);
    expect(body.totals.calories).toBe(95);
    const kept = await fetch(`${base}/api/quota`, {
      headers: { Authorization: "Bearer user-a", "x-plateful-secret": SECRET },
    });
    expect(await kept.json()).toEqual({ used: 1, remaining: 0, limit: 1 });
  });

  it("refunds the scan when a typed meal is not food or the model fails", async () => {
    let calls = 0;
    const provider: VisionProvider = {
      id: "gemini",
      model: "gemini-3.8-flash",
      async analyze() {
        return apple;
      },
      async analyzeText() {
        calls += 1;
        if (calls === 1) return { items: [], confidence: "low", notes: "", excluded: [] };
        throw new ProviderError("model down");
      },
    };
    const base = await start(provider, { dailyCap: 1 });
    const path = "/api/analyze-text";
    const body = JSON.stringify({ text: "my car keys" });
    const empty = await post(base, body, SECRET, "user-a", path);
    expect(empty.status).toBe(422);
    expect(await empty.json()).toMatchObject({ error: "no_food", message: TEXT_NO_FOOD_MESSAGE });
    const failed = await post(base, body, SECRET, "user-a", path);
    expect(failed.status).toBe(502);
    const quota = await fetch(`${base}/api/quota`, {
      headers: { Authorization: "Bearer user-a", "x-plateful-secret": SECRET },
    });
    expect(await quota.json()).toEqual({ used: 0, remaining: 1, limit: 1 });
  });

  it("retries a busy Gemini model and then estimates the typed meal with a backup", async () => {
    const urls: string[] = [];
    const prompts: string[] = [];
    const provider = createGeminiProvider({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
      sleep: async () => undefined,
      fetchImpl: async (url, init) => {
        urls.push(url);
        const sent = JSON.parse(String(init?.body)) as {
          systemInstruction?: { parts?: Array<{ text?: string }> };
          contents?: Array<{ parts?: Array<{ text?: string; inlineData?: unknown }> }>;
        };
        prompts.push(
          `${sent.systemInstruction?.parts?.[0]?.text ?? ""}\n${sent.contents?.[0]?.parts?.[0]?.text ?? ""}`,
        );
        expect(sent.contents?.[0]?.parts?.some((part) => part.inlineData)).toBeFalsy();
        if (urls.length < 3) {
          return new Response(
            JSON.stringify({ error: { message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } }),
            { status: 503 },
          );
        }
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(apple) }] } }] }),
          { status: 200 },
        );
      },
    });
    const base = await start(provider, { dailyCap: 2 });
    const response = await post(
      base,
      JSON.stringify({ text: "Chick-fil-A grilled chicken sandwich with a medium fry" }),
      SECRET,
      "user-a",
      "/api/analyze-text",
    );
    expect(response.status).toBe(200);
    expect(urls.map((url) => url.split("/models/")[1]?.split(":")[0])).toEqual([
      "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.6-flash",
    ]);
    expect(prompts[2]).toContain("published");
    expect(prompts[2]).toContain("Chick-fil-A");
    expect(prompts[2]).toContain("medium fry");
    const quota = await fetch(`${base}/api/quota`, {
      headers: { Authorization: "Bearer user-a", "x-plateful-secret": SECRET },
    });
    expect(await quota.json()).toEqual({ used: 1, remaining: 1, limit: 2 });
  });

  it("looks up a barcode without using a Gemini scan", async () => {
    const quota = createMemoryQuota();
    const base = await start(providerReturning(apple), {
      quota,
      dailyCap: 1,
      lookupProduct: async () => ({ status: "found", analysis: canned }),
    });
    const found = await get(base, "/api/product?barcode=9002490100070");
    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({ totals: { calories: 110, carbs: 27 } });
    expect(await quota.status("user-a", quotaDayKey(new Date()), 1)).toEqual({ used: 0, remaining: 1, limit: 1 });

    const photo = await post(base, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }));
    expect(photo.status).toBe(200);
    expect(await quota.status("user-a", quotaDayKey(new Date()), 1)).toEqual({ used: 1, remaining: 0, limit: 1 });
  });

  it("refuses a barcode lookup without a sign-in, and a code that is not a barcode", async () => {
    const base = await start(providerReturning(apple), {
      lookupProduct: async () => ({ status: "found", analysis: canned }),
    });
    const anonymous = await get(base, "/api/product?barcode=9002490100070", null, null);
    expect(anonymous.status).toBe(401);

    const invalid = await get(base, "/api/product?barcode=123");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ message: PRODUCT_INVALID_MESSAGE });

    const missing = await start(providerReturning(apple), {
      lookupProduct: async () => ({ status: "missing" }),
    });
    const notFound = await get(missing, "/api/product?barcode=00000000");
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({ message: PRODUCT_MISSING_MESSAGE });
  });

  it("uses Open Food Facts when a photo includes a readable barcode", async () => {
    let lookedUp = "";
    const base = await start(
      providerReturning({ ...apple, barcode: "9002490100070", calories: 1 }),
      {
        lookupProduct: async (barcode) => {
          lookedUp = barcode;
          return { status: "found", analysis: canned };
        },
      },
    );
    const response = await post(base, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }));
    expect(response.status).toBe(200);
    expect(lookedUp).toBe("9002490100070");
    expect(await response.json()).toMatchObject({ totals: { calories: 110 } });
  });
});
