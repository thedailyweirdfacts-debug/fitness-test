import { presentMeal } from "./nutrition.js";
import type { LoggedMeal, Macros } from "./schema.js";

export function dayKeyFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(year, month - 1, date);
  next.setDate(next.getDate() + delta);
  return dayKeyFromDate(next);
}

export function formatDayLabel(day: string, today = dayKeyFromDate(new Date())): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function mealsForDay(meals: LoggedMeal[], day: string): LoggedMeal[] {
  return meals
    .filter((meal) => dayKeyFromDate(new Date(meal.loggedAt)) === day)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
}

export function dailyTotals(meals: LoggedMeal[], day: string): Macros {
  const items = mealsForDay(meals, day).flatMap((meal) => meal.items);
  return presentMeal(items).totals;
}

export const EMPTY_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };
