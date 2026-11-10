import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { quotaDayKey } from "../../shared/src/account.js";
import { createMemoryQuota } from "./accounts.js";
import { createRateLimiter } from "./rate-limit.js";
import { RECIPE_INVALID_MESSAGE } from "./recipe.js";
import { createGeminiProvider, SCANNER_BUSY_MESSAGE } from "./providers/gemini.js";
import { createServer } from "./server.js";

const SECRET = "test-secret";
const DAY = quotaDayKey(new Date());

const chicken = {
  items: [{ name: "Chicken breast", grams: 454, portionLabel: "1 lb", calories: 748, protein: 140, carbs: 0, fat: 16 }],
  confidence: "high",
  notes: "Published raw chicken for 1 lb.",
  excluded: [],
  barcode: "",
};

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
  notes: "Open Food Facts for the whole package (250 ml).",
  excluded: [] as string[],
};

function recipeBody() {
  return {
    ingredients: [
      { barcode: "9002490100070" },
      { text: "1 lb chicken breast" },
      { imageBase64: "a".repeat(40), mimeType: "image/jpeg" },
      { imageBase64: "b".repeat(40), mimeType: "image/jpeg" },
    ],
    dishImageBase64: "c".repeat(40),
    dishMimeType: "image/jpeg",
  };
}

describe("POST /api/analyze-recipe", () => {
  const servers: Server[] = [];

  afterEach(() => {
    for (const server of servers) server.close();
    servers.length = 0;
  });

  async function start(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>, dailyCap = 2) {
    const quota = createMemoryQuota();
    const server = createServer({
      provider: createGeminiProvider({
        apiKey: "AIza-test",
        model: "gemini-3.8-flash",
        fallbackModels: ["gemini-3.6-flash"],
        sleep: async () => undefined,
        fetchImpl,
      }),
      providerId: "gemini",
      model: "gemini-3.8-flash",
      appSecret: SECRET,
      dailyCap,
      rateLimiter: createRateLimiter({ perMinute: 5, perDay: 60 }),
      verifyUser: async (token) => (token === "user-a" ? { userId: token } : null),
      quota,
      lookupProduct: async (barcode) => {
        expect(barcode).toBe("9002490100070");
        return { status: "found", analysis: canned };
      },
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing port");
    return { base: `http://127.0.0.1:${address.port}`, quota };
  }

  function post(base: string, body: unknown, token: string | null = "user-a") {
    const headers: Record<string, string> = { "Content-Type": "application/json", "x-plateful-secret": SECRET };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}/api/analyze-recipe`, { method: "POST", headers, body: JSON.stringify(body) });
  }

  it("estimates the batch once, keeps packaged values, and uses a single scan", async () => {
    const urls: string[] = [];
    const { base, quota } = await start(async (url, init) => {
      urls.push(url);
      const sent = JSON.parse(String(init?.body)) as {
        contents?: Array<{ parts?: Array<{ text?: string; inlineData?: { data?: string } }> }>;
      };
      const parts = sent.contents?.[0]?.parts ?? [];
      expect(parts[0]?.text).toContain("1 lb chicken breast");
      expect(parts[0]?.text).not.toContain("9002490100070");
      expect(parts.filter((part) => part.inlineData).map((part) => part.inlineData?.data?.[0])).toEqual(["a", "b", "c"]);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(chicken) }] } }] }), {
        status: 200,
      });
    });

    const response = await post(base, recipeBody());
    expect(response.status).toBe(200);
    const json = (await response.json()) as { totals: unknown; notes: string; items: Array<{ name: string }> };
    expect(json.totals).toEqual({ calories: 858, protein: 140, carbs: 27, fat: 16 });
    expect(json.notes).toMatch(/whole batch/);
    expect(json.items.map((item) => item.name)).toEqual(["Red Bull Energy Drink", "Chicken breast"]);
    expect(urls).toHaveLength(1);
    expect(response.headers.get("x-scans-remaining")).toBe("1");
    expect(await quota.status("user-a", DAY, 2)).toEqual({ used: 1, remaining: 1, limit: 2 });
  });

  it("does not spend a scan when every ingredient is a known barcode", async () => {
    let calls = 0;
    const { base, quota } = await start(async () => {
      calls += 1;
      return new Response("no", { status: 500 });
    }, 1);
    const response = await post(base, { ingredients: [{ barcode: "9002 4901 0007 0" }] });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { totals: { calories: number } }).totals.calories).toBe(110);
    expect(calls).toBe(0);
    expect(await quota.status("user-a", DAY, 1)).toEqual({ used: 0, remaining: 1, limit: 1 });
  });

  it("refunds the scan when every model is busy, and rejects a bad or unsigned request", async () => {
    const { base, quota } = await start(async () => {
      return new Response(JSON.stringify({ error: { message: "overloaded", status: "UNAVAILABLE" } }), { status: 503 });
    }, 1);
    const busy = await post(base, { ingredients: [{ text: "2 cups rice" }] });
    expect(busy.status).toBe(503);
    expect(await busy.json()).toMatchObject({ message: SCANNER_BUSY_MESSAGE });
    expect(await quota.status("user-a", DAY, 1)).toEqual({ used: 0, remaining: 1, limit: 1 });

    const invalid = await post(base, { ingredients: [] });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ message: RECIPE_INVALID_MESSAGE });

    const anonymous = await post(base, recipeBody(), null);
    expect(anonymous.status).toBe(401);
  });
});
