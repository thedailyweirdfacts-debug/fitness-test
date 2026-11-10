import { describe, expect, it } from "vitest";
import { DEFAULT_SCAN_CAP, migrationPlan, parseAuthCallback, quotaDayKey } from "./account.js";

describe("account sync", () => {
  it("allows 30 scans per person per Pacific day", () => {
    expect(DEFAULT_SCAN_CAP).toBe(30);
  });

  it("uses the Pacific day, matching the Gemini free-tier reset", () => {
    expect(quotaDayKey(new Date("2026-11-10T07:30:00Z"))).toBe("2026-11-09");
    expect(quotaDayKey(new Date("2026-11-10T08:30:00Z"))).toBe("2026-11-10");
  });

  it("copies local meals into an empty account and finishes a partial copy", () => {
    expect(migrationPlan(["a", "b"], [], false)).toEqual(["a", "b"]);
    expect(migrationPlan(["a", "b"], ["a"], false)).toEqual(["b"]);
    expect(migrationPlan(["a"], ["cloud-only"], false)).toEqual([]);
    expect(migrationPlan(["a", "b"], [], true)).toEqual([]);
  });

  it("reads a password-reset link", () => {
    expect(parseAuthCallback("plateful://reset-password#access_token=aaa&refresh_token=bbb&type=recovery")).toEqual({
      kind: "session",
      accessToken: "aaa",
      refreshToken: "bbb",
      type: "recovery",
    });
    expect(parseAuthCallback("plateful://reset-password?code=xyz")).toEqual({ kind: "code", code: "xyz" });
    expect(parseAuthCallback("plateful://")).toBeNull();
  });
});
