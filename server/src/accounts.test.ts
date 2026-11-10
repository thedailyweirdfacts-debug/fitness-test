import { describe, expect, it } from "vitest";
import { createMemoryQuota, createSupabaseQuota, verifySupabaseUser } from "./accounts.js";

describe("supabase accounts", () => {
  it("accepts the auth user id and rejects anything else", async () => {
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      if (headers.Authorization === "Bearer good" && headers.apikey === "anon") {
        return Response.json({ id: "user-1" });
      }
      return new Response("no", { status: 401 });
    }) as typeof fetch;

    await expect(verifySupabaseUser("good", { url: "https://example.supabase.co/", anonKey: "anon" }, fetchImpl)).resolves.toEqual({
      userId: "user-1",
    });
    await expect(verifySupabaseUser("bad", { url: "https://example.supabase.co", anonKey: "anon" }, fetchImpl)).resolves.toBeNull();
  });

  it("asks the database to consume and refund a scan", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/consume_scan")) return Response.json(9);
      if (url.endsWith("/release_scan")) return new Response(null, { status: 204 });
      if (url.includes("/scan_usage")) return Response.json([{ count: 1 }]);
      return new Response("missing", { status: 404 });
    }) as typeof fetch;

    const quota = createSupabaseQuota({ url: "https://example.supabase.co", serviceKey: "service" }, fetchImpl);
    await expect(quota.consume("user-1", "2026-11-10", 10)).resolves.toBe(9);
    await quota.release("user-1", "2026-11-10");
    await expect(quota.status("user-1", "2026-11-10", 10)).resolves.toEqual({ used: 1, remaining: 9, limit: 10 });
    expect(calls[0]).toContain("/rest/v1/rpc/consume_scan");

    const memory = createMemoryQuota();
    await expect(memory.consume("user-1", "2026-11-10", 1)).resolves.toBe(0);
    await expect(memory.consume("user-1", "2026-11-10", 1)).resolves.toBe(-1);
  });
});