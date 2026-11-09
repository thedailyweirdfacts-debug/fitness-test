import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createServer } from "./server";
import type { VisionProvider } from "./providers/types";

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

  async function start(provider: VisionProvider | null, bodyLimit?: number) {
    const server = createServer({
      provider,
      providerId: "openai",
      model: "gpt-5.4-mini",
      bodyLimit,
    });
    servers.push(server);
    const port = await listen(server);
    return `http://127.0.0.1:${port}`;
  }

  it("reports health without a key and refuses to estimate", async () => {
    const base = await start(null);
    const health = await fetch(`${base}/api/health`);
    const body = await health.json();
    expect(body).toEqual({ ok: true, provider: "openai", model: "gpt-5.4-mini", configured: false });
    expect(JSON.stringify(body)).not.toMatch(/sk-|api[_-]?key/i);

    const missing = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }),
    });
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ error: "not_configured" });
  });

  it("returns validated items with totals computed on the server", async () => {
    const base = await start(providerReturning(apple));
    const response = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: `data:image/jpeg;base64,${"a".repeat(40)}`,
        mimeType: "image/jpg",
      }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { totals: unknown; items: unknown[] };
    expect(body.totals).toEqual({ calories: 95, protein: 0.5, carbs: 25, fat: 0.3 });
    expect(body.items).toHaveLength(1);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("maps an empty plate, a bad body, a bad model payload, and an oversized photo", async () => {
    const base = await start(
      providerReturning({ items: [], confidence: "low", notes: "", excluded: [] }),
      160,
    );

    const empty = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }),
    });
    expect(empty.status).toBe(422);

    const bad = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "a".repeat(40) }),
    });
    expect(bad.status).toBe(400);

    const junk = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    expect(junk.status).toBe(400);

    const huge = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "a".repeat(200), mimeType: "image/jpeg" }),
    });
    expect(huge.status).toBe(413);

    const missing = await fetch(`${base}/nope`);
    expect(missing.status).toBe(404);
  });

  it("turns a schema miss from the model into a 502", async () => {
    const base = await start(providerReturning({ not: "a meal" }));
    const response = await fetch(`${base}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "a".repeat(40), mimeType: "image/png" }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "invalid_estimate" });
  });
});
