import { describe, expect, it } from "vitest";
import handler, { requestUrl } from "../../api/analyze.js";

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
    expect(body).toMatchObject({ ok: true, provider: "gemini", model: "gemini-3.8-flash" });
    expect(raw).not.toMatch(/api[_-]?key|service_role/i);
    expect(headers["Content-Type"]).toContain("application/json");
  });

  it("builds a URL from a path or an absolute Web request", () => {
    expect(requestUrl({ url: "/api/quota", headers: { host: "preview.vercel.app" } }).pathname).toBe("/api/quota");
    expect(requestUrl(new Request("https://example.com/api/health")).pathname).toBe("/api/health");
  });
});
