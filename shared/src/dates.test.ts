import { describe, expect, it } from "vitest";
import { itemsFromAnalysis } from "./nutrition";
import { SAUSAGE_MEAL } from "./mocks";
import type { LoggedMeal } from "./schema";
import { addDays, dailyTotals, dayKeyFromDate, formatDayLabel, mealsForDay } from "./dates";

function mealAt(date: Date, id: string): LoggedMeal {
  return {
    id,
    loggedAt: date.toISOString(),
    photoUri: null,
    items: itemsFromAnalysis(SAUSAGE_MEAL, (index) => `${id}-${index}`),
    confidence: "medium",
    notes: "",
    excluded: [],
    source: "sample",
  };
}

describe("daily log dates", () => {
  it("groups meals in local time and sums the day", () => {
    const lunch = new Date(2026, 10, 9, 12, 30);
    const dinner = new Date(2026, 10, 9, 19, 0);
    const yesterday = new Date(2026, 10, 8, 18, 0);
    const meals = [mealAt(lunch, "lunch"), mealAt(dinner, "dinner"), mealAt(yesterday, "old")];
    const day = dayKeyFromDate(lunch);

    expect(day).toBe("2026-11-09");
    expect(mealsForDay(meals, day).map((meal) => meal.id)).toEqual(["dinner", "lunch"]);
    expect(dailyTotals(meals, day)).toEqual({ calories: 1000, protein: 40, carbs: 24, fat: 80 });
    expect(dailyTotals(meals, "2026-11-01")).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it("labels today and yesterday and steps across months", () => {
    expect(formatDayLabel("2026-11-09", "2026-11-09")).toBe("Today");
    expect(formatDayLabel("2026-11-08", "2026-11-09")).toBe("Yesterday");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
