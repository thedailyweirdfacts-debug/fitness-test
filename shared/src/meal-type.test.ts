import { describe, expect, it } from "vitest";
import { groupMealsByType, mealTypeForTime, mealTypeFromUnknown, needsMealTypeMigration } from "./meal-type";
import type { LoggedMeal } from "./schema";

describe("meal types", () => {
  it("picks a type from the time of day", () => {
    expect(mealTypeForTime(new Date(2026, 10, 9, 7, 30))).toBe("breakfast");
    expect(mealTypeForTime(new Date(2026, 10, 9, 11, 0))).toBe("lunch");
    expect(mealTypeForTime(new Date(2026, 10, 9, 15, 59))).toBe("lunch");
    expect(mealTypeForTime(new Date(2026, 10, 9, 18, 0))).toBe("dinner");
    expect(mealTypeForTime(new Date(2026, 10, 9, 22, 15))).toBe("snack");
    expect(mealTypeForTime(new Date(2026, 10, 9, 3, 0))).toBe("snack");
    expect(mealTypeForTime(new Date("nope"))).toBe("snack");
  });

  it("keeps an explicit type and infers a missing one", () => {
    expect(mealTypeFromUnknown("dinner", "2026-11-09T12:00:00")).toBe("dinner");
    expect(mealTypeFromUnknown(undefined, new Date(2026, 10, 9, 8).toISOString())).toBe("breakfast");
    expect(mealTypeFromUnknown(undefined, "nope")).toBe("snack");
    expect(needsMealTypeMigration([{ id: "a", loggedAt: "2026-11-09T12:00:00.000Z" }])).toBe(true);
    expect(needsMealTypeMigration([{ id: "a", loggedAt: "2026-11-09T12:00:00.000Z", mealType: "lunch" }])).toBe(false);
  });

  it("groups a day in meal order", () => {
    const base = {
      photoUri: null,
      items: [],
      confidence: "medium" as const,
      notes: "",
      excluded: [],
      source: "sample" as const,
    };
    const meals = [
      { ...base, id: "s", loggedAt: "2026-11-09T22:00:00.000Z", mealType: "snack" as const, items: [{ id: "1" }] },
      { ...base, id: "b", loggedAt: "2026-11-09T08:00:00.000Z", mealType: "breakfast" as const, items: [{ id: "1" }] },
      { ...base, id: "d", loggedAt: "2026-11-09T19:00:00.000Z", mealType: "dinner" as const, items: [{ id: "1" }] },
    ] as unknown as LoggedMeal[];
    expect(groupMealsByType(meals).map((group) => group.type)).toEqual(["breakfast", "dinner", "snack"]);
  });
});
