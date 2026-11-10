import { describe, expect, it } from "vitest";
import { addDays, dayKeyFromDate } from "./dates.js";
import {
  buildRewardReport,
  calorieGoalHit,
  freshRewards,
  goalBounds,
  markRewardsSeen,
  parseGoalInput,
  progressCopy,
  streakStats,
} from "./goals.js";
import { mealTypeForTime } from "./meal-type.js";
import type { FoodItem, LoggedMeal, MealType } from "./schema.js";

const TARGETS = { calorieGoal: 2000, proteinGoal: null, windowPercent: 10 };

function food(calories: number, protein = 10): FoodItem {
  return {
    id: `food-${calories}-${protein}`,
    name: "Food",
    portionLabel: "1 serving",
    baseGrams: 100,
    baseCalories: calories,
    baseProtein: protein,
    baseCarbs: 20,
    baseFat: 8,
    scale: 1,
  };
}

function meal(day: string, hour: number, calories: number, type?: MealType, protein = 10): LoggedMeal {
  const [year, month, date] = day.split("-").map(Number);
  const when = new Date(year!, month! - 1, date, hour, 0, 0);
  return {
    id: `${day}-${hour}-${calories}-${type ?? "auto"}`,
    loggedAt: when.toISOString(),
    photoUri: null,
    mealType: type ?? mealTypeForTime(when),
    items: [food(calories, protein)],
    confidence: "medium",
    notes: "",
    excluded: [],
    source: "sample",
  };
}

describe("calorie window", () => {
  it("counts a day inside the window and ignores an empty day or a large overshoot", () => {
    expect(goalBounds(2000, 10)).toEqual({ low: 1800, high: 2200 });
    expect(calorieGoalHit(2000, 2000, 10)).toBe(true);
    expect(calorieGoalHit(1800, 2000, 10)).toBe(true);
    expect(calorieGoalHit(2200, 2000, 10)).toBe(true);
    expect(calorieGoalHit(2201, 2000, 10)).toBe(false);
    expect(calorieGoalHit(1799, 2000, 10)).toBe(false);
    expect(calorieGoalHit(0, 2000, 10)).toBe(false);
    expect(calorieGoalHit(2000, null, 10)).toBe(false);
    expect(calorieGoalHit(2300, 2000, 20)).toBe(true);
    expect(calorieGoalHit(2300, 2000, 10)).toBe(false);
  });

  it("parses an optional goal and rejects junk", () => {
    expect(parseGoalInput("", 5000)).toBeNull();
    expect(parseGoalInput("  2000 ", 5000)).toBe(2000);
    expect(parseGoalInput("0", 5000)).toBe("invalid");
    expect(parseGoalInput("20%", 5000)).toBe("invalid");
    expect(parseGoalInput("9000", 5000)).toBe("invalid");
  });
});

describe("streaks and badges", () => {
  const today = "2026-11-09";

  it("keeps today's unfinished day from breaking a streak, and ignores overeating", () => {
    const hits = new Set(["2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(streakStats(hits, today)).toEqual({ current: 3, best: 3 });
    expect(streakStats(new Set([...hits, today]), today)).toEqual({ current: 4, best: 4 });

    const meals = [
      meal("2026-11-07", 12, 2000),
      meal("2026-11-08", 12, 2000),
      meal(today, 12, 2600),
    ];
    const report = buildRewardReport(meals, TARGETS, today);
    expect(report.today.hit).toBe(false);
    expect(report.currentStreak).toBe(2);
    expect(report.bestStreak).toBe(2);
    expect(report.hitDays).toEqual(["2026-11-07", "2026-11-08"]);
    expect(progressCopy(report.today)).toContain("Above the window");
  });

  it("remembers the best run when a later day is only a single hit", () => {
    const meals = [
      meal("2026-11-01", 12, 2000),
      meal("2026-11-02", 12, 2000),
      meal("2026-11-03", 12, 2000),
      meal("2026-11-04", 12, 400),
      meal(today, 12, 2000),
    ];
    const report = buildRewardReport(meals, TARGETS, today);
    expect(report.currentStreak).toBe(1);
    expect(report.bestStreak).toBe(3);
    expect(report.badges.find((badge) => badge.id === "streak-3")?.earned).toBe(true);
    expect(report.badges.find((badge) => badge.id === "streak-7")?.earned).toBe(false);
    expect(report.badges.find((badge) => badge.id === "first-goal")?.earned).toBe(true);
  });

  it("unlocks a full day, a protein day, and a 30-day streak", () => {
    const start = "2026-10-11";
    const meals: LoggedMeal[] = [];
    for (let day = start; day <= today; day = addDays(day, 1)) {
      meals.push(meal(day, 8, 500, "breakfast", 20));
      meals.push(meal(day, 12, 800, "lunch", 25));
      meals.push(meal(day, 18, 700, "dinner", 20));
    }
    const report = buildRewardReport(meals, { calorieGoal: 2000, proteinGoal: 60, windowPercent: 10 }, today);
    expect(report.currentStreak).toBe(30);
    expect(report.bestStreak).toBe(30);
    expect(report.today.hit).toBe(true);
    expect(report.today.proteinMet).toBe(true);
    expect(report.badges.filter((badge) => badge.earned).map((badge) => badge.id)).toEqual([
      "first-meal",
      "full-day",
      "first-goal",
      "streak-3",
      "streak-7",
      "streak-30",
      "protein-day",
    ]);
  });

  it("hides the protein badge until a protein goal exists and stays quiet with no goal", () => {
    const meals = [meal(today, 8, 500, "breakfast")];
    const quiet = buildRewardReport(meals, { calorieGoal: null, proteinGoal: null, windowPercent: 10 }, today);
    expect(quiet.currentStreak).toBe(0);
    expect(quiet.badges.map((badge) => badge.id)).not.toContain("protein-day");
    expect(quiet.badges.find((badge) => badge.id === "first-meal")?.earned).toBe(true);
    expect(quiet.badges.find((badge) => badge.id === "first-goal")?.earned).toBe(false);
    expect(progressCopy(quiet.today)).toBe("");
  });

  it("celebrates a new goal day and badge once", () => {
    const meals = [meal(today, 12, 2000)];
    const report = buildRewardReport(meals, TARGETS, today);
    const seen = { badges: [], goalDays: [] };
    const fresh = freshRewards(report, seen, today);
    expect(fresh.goalDay).toBe(true);
    expect(fresh.badges.map((badge) => badge.id)).toEqual(["first-meal", "first-goal"]);
    const next = markRewardsSeen(seen, fresh, today);
    expect(freshRewards(report, next, today)).toEqual({ badges: [], goalDay: false });
    expect(dayKeyFromDate(new Date(today + "T12:00:00"))).toBe(today);
  });
});
