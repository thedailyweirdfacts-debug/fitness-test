import { describe, expect, it } from "vitest";
import type { LoggedMeal } from "../../shared/src/index.js";
import { createMemoryQuota } from "./accounts.js";
import { HttpError } from "./errors.js";
import { createRateLimiter } from "./rate-limit.js";
import { createMemoryRewardStore, mealFromRewardRow } from "./rewards.js";
import { handleRequest, type ServerOptions } from "./server.js";

const meal: LoggedMeal = {
  id: "meal-1",
  loggedAt: "2026-11-10T20:00:00.000Z",
  photoUri: "photo.jpg",
  mealType: "lunch",
  items: [
    {
      id: "food-1",
      name: "Rice",
      portionLabel: "1 cup",
      baseGrams: 150,
      baseCalories: 2000,
      baseProtein: 70,
      baseCarbs: 40,
      baseFat: 10,
      scale: 1,
    },
  ],
  confidence: "high",
  notes: "",
  excluded: [],
  source: "vision",
  logKind: "photo",
};

function options(store: ReturnType<typeof createMemoryRewardStore> | undefined): ServerOptions {
  return {
    provider: null,
    providerId: "gemini",
    model: "gemini-3.5-flash-lite",
    verifyUser: async (token) => (token === "user-a" || token === "user-b" ? { userId: token } : null),
    quota: createMemoryQuota(),
    rewards: store,
  };
}

function call(
  store: ReturnType<typeof createMemoryRewardStore> | undefined,
  token: string | null,
  body: unknown,
) {
  return handleRequest(options(store), createRateLimiter(), {
    method: "POST",
    pathname: "/api/rewards",
    header: (name) => (name === "authorization" && token ? `Bearer ${token}` : undefined),
    ip: "127.0.0.1",
    query: new URLSearchParams(),
    readBody: async () => body,
  }).catch((error: unknown) => {
    if (error instanceof HttpError) return { status: error.status, body: { error: error.code, message: error.message } };
    throw error;
  });
}

describe("POST /api/rewards", () => {
  it("syncs the same XP twice, and the friend board has no meals or calories", async () => {
    const store = createMemoryRewardStore();
    store.setCode("user-a", "AB12CD", "Ada");
    store.setCode("user-b", "ZX98QW", "Bea");
    store.setHistory("user-a", {
      meals: [meal],
      recipes: [],
      targets: { calorieGoal: 2000, proteinGoal: 60, windowPercent: 10 },
    });

    const first = await call(store, "user-a", { action: "sync" });
    const second = await call(store, "user-a", { action: "sync" });
    expect(first.status).toBe(200);
    const body = first.body as { rewards: { xp: number; level: number; title: string; freezes: number }; friendCode: string; board: Array<Record<string, unknown>> };
    const again = second.body as { rewards: { xp: number } };
    expect(again.rewards.xp).toBe(body.rewards.xp);
    expect(body.rewards.xp).toBeGreaterThan(0);
    expect(body.rewards.title).toBeTruthy();
    expect(body.friendCode).toBe("AB12CD");
    expect(Object.keys(body.board[0] ?? {}).sort()).toEqual(["displayName", "level", "streak", "weeklyXp", "you"]);
    expect(JSON.stringify(body.board)).not.toMatch(/calor|meal|protein/i);

    const requested = await call(store, "user-a", { action: "request", code: "zx98qw" });
    expect(requested.status).toBe(200);
    const waiting = requested.body as { requests: Array<{ id: string; direction: string }> };
    expect(waiting.requests[0]?.direction).toBe("out");
    const accepted = await call(store, "user-b", { action: "respond", id: waiting.requests[0]?.id, accept: true });
    expect(accepted.status).toBe(200);
    const board = (accepted.body as { board: Array<{ displayName: string }> }).board.map((entry) => entry.displayName).sort();
    expect(board).toEqual(["Ada", "Bea"]);

    const stranger = await call(store, null, { action: "sync" });
    expect(stranger.status).toBe(401);
    const missing = await call(undefined, "user-a", { action: "sync" });
    expect(missing.status).toBe(503);
  });

  it("reads an older meal row when the kind column is still empty", () => {
    const parsed = mealFromRewardRow({
      id: "old",
      logged_at: "2026-11-01T20:00:00.000Z",
      meal_type: "dinner",
      photo_path: "user/old.jpg",
      items: meal.items,
      confidence: "medium",
      notes: "",
      excluded: [],
      source: "vision",
      log_kind: null,
    });
    expect(parsed?.logKind).toBeUndefined();
    expect(parsed?.photoUri).toBe("user/old.jpg");
  });
});
