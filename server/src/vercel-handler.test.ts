import { describe, expect, it } from "vitest";
import handler, { parseIncomingBody, requestUrl } from "../../api/analyze.js";
import { analyzeRequest, PHOTO_TOO_LARGE_MESSAGE } from "./analyze.js";
import type { VisionProvider } from "./providers/types.js";

describe("Vercel handler request shape", () => {
  it("accepts a path-only Node request URL and writes the health response", async () => {
    let status = 0;
    let raw = "";
    const headers: Record<string, string> = {};
    const result = await handler(
      { url: "/api/health", method: "GET", headers: { host: "fitness-test.vercel.app" } },
      {
        setHeader(name, value) {
          headers[name] = value;
        },
        writeHead(code, extra) {
          status = code;
          Object.assign(headers, extra ?? {});
        },
        end(body) {
          raw = body ?? "";
        },
      },
    );

    expect(result).toBeUndefined();
    expect(status).toBe(200);
    const body = JSON.parse(raw) as { ok?: boolean; provider?: string; model?: string };
    expect(body).toMatchObject({ ok: true, provider: "gemini", model: "gemini-3.5-flash-lite" });
    expect(raw).not.toMatch(/api[_-]?key|service_role/i);
    expect(headers["Content-Type"]).toContain("application/json");
  });

  it("builds a URL from a path or an absolute Web request", () => {
    expect(requestUrl({ url: "/api/quota", headers: { host: "preview.vercel.app" } }).pathname).toBe("/api/quota");
    expect(requestUrl(new Request("https://example.com/api/health")).pathname).toBe("/api/health");
  });
});

const meal = { imageBase64: "a".repeat(40), mimeType: "image/jpeg" };

describe("Vercel pre-parsed req.body", () => {
  it("parses an object, a JSON string, and a Buffer without reading the stream", async () => {
    const cases = [meal, JSON.stringify(meal), Buffer.from(JSON.stringify(meal))] as const;
    for (const body of cases) {
      const parsed = await parseIncomingBody(
        {
          body,
          async *[Symbol.asyncIterator]() {
            throw new Error("stream should not be read when req.body is set");
          },
        },
        4_000_000,
      );
      expect(parsed).toEqual(meal);

      let status = 0;
      let raw = "";
      await handler(
        {
          url: "/api/analyze",
          method: "POST",
          headers: { host: "preview.vercel.app", "content-type": "application/json" },
          body,
          async *[Symbol.asyncIterator]() {
            yield "{";
          },
        },
        {
          writeHead(code) {
            status = code;
          },
          end(payload) {
            raw = payload ?? "";
          },
        },
      );
      const response = JSON.parse(raw) as { error?: string; message?: string };
      expect(response.error).not.toBe("invalid_request");
      expect(response.message).not.toBe("Send a JSON body with imageBase64 and mimeType.");
      expect([401, 503]).toContain(status);
    }
  });

  it("reads the raw stream only when req.body is undefined", async () => {
    const parsed = await parseIncomingBody(
      {
        async *[Symbol.asyncIterator]() {
          yield JSON.stringify(meal);
        },
      },
      4_000_000,
    );
    expect(parsed).toEqual(meal);
  });

  it("returns a clear 413 when a Buffer or object body is over the limit", async () => {
    await expect(parseIncomingBody({ body: Buffer.from("x".repeat(32)) }, 8)).rejects.toMatchObject({
      status: 413,
      message: PHOTO_TOO_LARGE_MESSAGE,
    });
    await expect(
      parseIncomingBody({ body: { imageBase64: "a".repeat(80), mimeType: "image/jpeg" } }, 40),
    ).rejects.toMatchObject({
      status: 413,
      message: PHOTO_TOO_LARGE_MESSAGE,
    });
  });

  it("returns 413 when imageBase64 is longer than the upload allows", async () => {
    const provider: VisionProvider = {
      id: "gemini",
      model: "gemini-3.8-flash",
      analyze: async () => {
        throw new Error("the model should not run for an oversized photo");
      },
    };
    await expect(
      analyzeRequest({ imageBase64: "a".repeat(3_500_001), mimeType: "image/jpeg" }, provider),
    ).rejects.toMatchObject({ status: 413, code: "payload_too_large", message: PHOTO_TOO_LARGE_MESSAGE });
  });
});
