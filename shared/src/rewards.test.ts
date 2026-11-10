import { describe, expect, it } from "vitest";
import type { FoodItem, LoggedMeal, MealType } from "./schema.js";
import {
  applyFriendRequest,
  challengesForWeek,
  CHALLENGE_XP,
  cleanDisplayName,
  evaluateRewards,
  GOAL_DAY_XP,
  inferLogKind,
  levelProgress,
  MAX_FREEZES,
  MEAL_XP,
  mondayOf,
  normalizeFriendCode,
  REWARD_BADGE_COUNT,
  respondToFriend,
  shiftDay,
  streakWithFreezes,
} from "./rewards.js";

const TARGETS = { calorieGoal: 2000, proteinGoal: 60, windowPercent: 10 };

function food(name: string, calories = 500, protein = 20): FoodItem {
  return {
    id: `food-${name}`,
    name,
    portionLabel: "1 serving",
    baseGrams: 100,
    baseCalories: calories,
    baseProtein: protein,
    baseCarbs: 20,
    baseFat: 8,
    scale: 1,
  };
}

function meal(
  day: string,
  options?: { id?: string; type?: MealType; calories?: number; protein?: number; kind?: LoggedMeal["logKind"]; name?: string; source?: LoggedMeal["source"] },
): LoggedMeal {
  return {
    id: options?.id ?? `${day}-${options?.type ?? "lunch"}-${options?.kind ?? "typed"}`,
    loggedAt: `${day}T20:00:00.000Z`,
    photoUri: options?.kind === "photo" ? "photo.jpg" : null,
    mealType: options?.type ?? "lunch",
    items: [food(options?.name ?? "Oats", options?.calories ?? 500, options?.protein ?? 20)],
    confidence: "medium",
    notes: "",
    excluded: [],
    source: options?.source ?? (options?.kind === "recipe" ? "recipe" : options?.kind === "sample" ? "sample" : "vision"),
    logKind: options?.kind,
  };
}

function weekContaining(id: string): string {
  for (let day = "2026-01-05"; day < "2027-06-01"; day = shiftDay(day, 7)) {
    if (challengesForWeek(day).some((item) => item.id === id)) return day;
  }
  throw new Error(`no week for ${id}`);
}

describe("reward calendar", () => {
  it("starts weeks on Monday and keeps friend names and codes tidy", () => {
    expect(mondayOf("2026-11-10")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(cleanDisplayName("  Sam  Cook ")).toBe("Sam Cook");
    expect(cleanDisplayName("!")).toBeNull();
    expect(normalizeFriendCode(" ab-12 ")).toBe("AB12");
    expect(REWARD_BADGE_COUNT).toBeGreaterThanOrEqual(15);
    expect(REWARD_BADGE_COUNT).toBeLessThanOrEqual(25);
    expect(challengesForWeek("2026-11-09")).toHaveLength(3);
  });
});

describe("xp and levels", () => {
  const now = new Date("2026-11-10T20:00:00.000Z");

  it("pays each meal kind once and does not pay again when the same log is evaluated twice", () => {
    const meals = [
      meal("2026-11-10", { id: "photo-1", kind: "photo", calories: 400 }),
      meal("2026-11-10", { id: "typed-1", kind: "typed", calories: 400 }),
      meal("2026-11-10", { id: "bar-1", kind: "barcode", calories: 400 }),
      meal("2026-11-10", { id: "rec-1", kind: "recipe", calories: 400 }),
      meal("2026-11-10", { id: "dup", kind: "typed", calories: 400 }),
      meal("2026-11-10", { id: "dup", kind: "typed", calories: 900 }),
    ];
    const first = evaluateRewards({ meals, targets: TARGETS, now });
    const second = evaluateRewards({ meals, targets: TARGETS, now });
    expect(first.events.filter((event) => event.kind.startsWith("meal-")).map((event) => event.xp).sort()).toEqual(
      [MEAL_XP.barcode, MEAL_XP.photo, MEAL_XP.recipe, MEAL_XP.typed, MEAL_XP.typed].sort(),
    );
    expect(first.events.filter((event) => event.key.startsWith("meal:"))).toHaveLength(5);
    expect(second.xp).toBe(first.xp);
    expect(second.events.map((event) => event.key).sort()).toEqual(first.events.map((event) => event.key).sort());
  });

  it("pays a goal day once and steps the level curve", () => {
    const snapshot = evaluateRewards({
      meals: [meal("2026-11-10", { id: "goal", kind: "typed", calories: 2000, protein: 70, type: "lunch" })],
      targets: TARGETS,
      now,
    });
    expect(snapshot.todayHit).toBe(true);
    expect(snapshot.events.filter((event) => event.key === "goal:2026-11-10")).toEqual([
      { key: "goal:2026-11-10", kind: "goal", xp: GOAL_DAY_XP, week: "2026-11-09" },
    ]);
    expect(levelProgress(0)).toMatchObject({ level: 1, title: "Kitchen Cadet", into: 0 });
    expect(levelProgress(59).level).toBe(1);
    expect(levelProgress(60)).toMatchObject({ level: 2, title: "Plate Scout", into: 0 });
    expect(snapshot.level).toBe(levelProgress(snapshot.xp).level);
    expect(snapshot.badges.find((badge) => badge.id === "first-meal")?.earned).toBe(true);
    expect(snapshot.badges.find((badge) => badge.id === "protein-day")?.earned).toBe(true);
  });

  it("infers a kind when an older meal has none stored", () => {
    expect(inferLogKind({ source: "recipe", photoUri: null })).toBe("recipe");
    expect(inferLogKind({ source: "vision", photoUri: "file.jpg" })).toBe("photo");
    expect(inferLogKind({ source: "vision", photoUri: null })).toBe("typed");
    expect(inferLogKind({ source: "sample", photoUri: "x" })).toBe("sample");
  });
});

describe("streak freezes", () => {
  const hits = new Set<string>();
  for (let day = "2026-11-03"; day <= "2026-11-09"; day = shiftDay(day, 1)) hits.add(day);

  it("earns a freeze at 7 days and leaves today unfinished", () => {
    const streak = streakWithFreezes(hits, "2026-11-10");
    expect(streak.current).toBe(7);
    expect(streak.best).toBe(7);
    expect(streak.freezes).toBe(1);
  });

  it("spends one freeze on a missed day and breaks on the next miss", () => {
    const covered = streakWithFreezes(hits, "2026-11-11");
    expect(covered.current).toBe(7);
    expect(covered.freezes).toBe(0);

    const broken = streakWithFreezes(hits, "2026-11-12");
    expect(broken.current).toBe(0);
    expect(broken.freezes).toBe(0);
    expect(broken.best).toBe(7);
  });

  it("holds at most two freezes", () => {
    const long = new Set<string>();
    for (let day = "2026-10-21"; day <= "2026-11-10"; day = shiftDay(day, 1)) long.add(day);
    const streak = streakWithFreezes(long, "2026-11-10");
    expect(streak.current).toBe(21);
    expect(streak.freezes).toBe(MAX_FREEZES);
    expect(streak.freezesEarned).toBe(3);
  });

  it("pays each streak milestone once inside the full reward", () => {
    const meals: LoggedMeal[] = [];
    for (let day = "2026-11-03"; day <= "2026-11-09"; day = shiftDay(day, 1)) {
      meals.push(meal(day, { id: day, kind: "typed", calories: 2000, type: "lunch" }));
    }
    const snapshot = evaluateRewards({ meals, targets: TARGETS, now: new Date("2026-11-10T20:00:00.000Z") });
    expect(snapshot.currentStreak).toBe(7);
    expect(snapshot.freezes).toBe(1);
    expect(snapshot.events.filter((event) => event.kind === "streak").map((event) => event.key)).toEqual(["streak:3", "streak:7"]);
    expect(snapshot.badges.find((badge) => badge.id === "freeze-earned")?.earned).toBe(true);
    expect(snapshot.badges.find((badge) => badge.id === "streak-14")?.earned).toBe(false);
  });
});

describe("weekly challenges", () => {
  it("completes breakfast, new foods, and a four-tag day once", () => {
    const breakfastWeek = weekContaining("breakfast-5");
    const meals: LoggedMeal[] = [];
    for (let offset = 0; offset < 5; offset += 1) {
      meals.push(meal(shiftDay(breakfastWeek, offset), { id: `bf-${offset}`, kind: "typed", type: "breakfast", calories: 400 }));
    }
    const finished = evaluateRewards({
      meals,
      targets: TARGETS,
      now: new Date(`${shiftDay(breakfastWeek, 4)}T20:00:00.000Z`),
    });
    const breakfast = finished.challenges.find((item) => item.id === "breakfast-5");
    expect(breakfast?.progress).toBe(5);
    expect(breakfast?.completed).toBe(true);
    expect(finished.events.filter((event) => event.key === `challenge:${breakfastWeek}:breakfast-5`)).toHaveLength(1);

    const foodWeek = weekContaining("new-foods-3");
    const prior = meal(shiftDay(foodWeek, -2), { id: "old-apple", kind: "typed", name: "Apple", calories: 90 });
    const fresh = ["Pear", "Plum", "Oat"].map((name, index) =>
      meal(shiftDay(foodWeek, index), { id: `new-${name}`, kind: "typed", name, calories: 80 }),
    );
    const foods = evaluateRewards({
      meals: [prior, ...fresh],
      targets: { calorieGoal: null, proteinGoal: null, windowPercent: 10 },
      now: new Date(`${shiftDay(foodWeek, 3)}T20:00:00.000Z`),
    });
    expect(foods.challenges.find((item) => item.id === "new-foods-3")?.progress).toBe(3);
    expect(foods.events.filter((event) => event.key === `challenge:${foodWeek}:new-foods-3`)[0]?.xp).toBe(CHALLENGE_XP);

    const tagWeek = weekContaining("four-tags");
    const tags = evaluateRewards({
      meals: (["breakfast", "lunch", "dinner", "snack"] as MealType[]).map((type) =>
        meal(tagWeek, { id: `tag-${type}`, kind: "typed", type, calories: 100, name: type }),
      ),
      targets: { calorieGoal: null, proteinGoal: null, windowPercent: 10 },
      now: new Date(`${tagWeek}T20:00:00.000Z`),
    });
    expect(tags.challenges.find((item) => item.id === "four-tags")?.completed).toBe(true);
    expect(tags.badges.find((badge) => badge.id === "all-tags")?.earned).toBe(true);
    expect(tags.weeklyXp).toBe(tags.xp);
  });
});

describe("friend requests", () => {
  it("needs both people, and only the person who was asked can accept", () => {
    const asked = applyFriendRequest([], "user-a", "user-b", "fr-1");
    expect(asked.status).toBe("pending");
    const waiting = applyFriendRequest(asked.records, "user-a", "user-b", "fr-2");
    expect(waiting.status).toBe("pending");
    expect(waiting.records).toHaveLength(1);
    const mutual = applyFriendRequest(asked.records, "user-b", "user-a", "fr-3");
    expect(mutual.status).toBe("accepted");
    expect(applyFriendRequest(mutual.records, "user-a", "user-a", "fr-4").status).toBe("self");

    const declined = respondToFriend(asked.records, "user-a", "fr-1", true);
    expect(declined.ok).toBe(false);
    const accepted = respondToFriend(asked.records, "user-b", "fr-1", true);
    expect(accepted.ok).toBe(true);
    expect(accepted.records[0]?.status).toBe("accepted");
  });
});
