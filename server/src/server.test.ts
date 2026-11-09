import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createRateLimiter } from "./rate-limit";
import { createServer } from "./server";
import type { VisionProvider } from "./providers/types";

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
    extra?: { bodyLimit?: number; appSecret?: string | null; perMinute?: number },
  ) {
    const server = createServer({
      provider,
      providerId: "gemini",
      model: "gemini-3.8-flash",
      appSecret: extra && "appSecret" in extra ? extra.appSecret : SECRET,
      bodyLimit: extra?.bodyLimit,
      rateLimiter: createRateLimiter({ perMinute: extra?.perMinute ?? 5, perDay: 20 }),
    });
    servers.push(server);
    const port = await listen(server);
    return `http://127.0.0.1:${port}`;
  }

  function post(base: string, body: string, secret: string | null = SECRET) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (secret) headers["x-plateful-secret"] = secret;
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
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-|api[_-]?key|test-secret/i);

    const missing = await post(base, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ error: "not_configured" });
  });

  it("refuses an estimate when the secret is missing or wrong, and does not call the model", async () => {
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
    const closed = await post(open, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }), null);
    expect(closed.status).toBe(503);
    expect(await closed.json()).toMatchObject({ error: "secret_not_configured" });

    const locked = await start(provider);
    const wrong = await post(locked, JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }), "nope");
    expect(wrong.status).toBe(401);
    expect(calls).toBe(0);
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
});
