import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createMemoryQuota, type QuotaStore } from "./accounts.js";
import { ProviderError } from "./errors.js";
import { createRateLimiter } from "./rate-limit.js";
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
    });
    servers.push(server);
    const port = await listen(server);
    return `http://127.0.0.1:${port}`;
  }

  function post(base: string, body: string, secret: string | null = SECRET, token: string | null = "user-a") {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["x-plateful-secret"] = secret;
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${base}/api/analyze`, { method: "POST", headers, body });
  }

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
});
