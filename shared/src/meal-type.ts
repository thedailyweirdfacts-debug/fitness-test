import { mealTypeSchema, type LoggedMeal, type MealType } from "./schema.js";

export const MEAL_TYPES: readonly MealType[] = ["breakfast", "lunch", "dinner", "snack"];

const LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export function mealTypeLabel(type: MealType): string {
  return LABELS[type];
}

/**
 * Breakfast through mid-morning, lunch through mid-afternoon, dinner through the evening.
 * Late night and very early hours are a snack.
 */
export function mealTypeForTime(date: Date): MealType {
  if (Number.isNaN(date.getTime())) return "snack";
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 5 * 60 && minutes < 11 * 60) return "breakfast";
  if (minutes >= 11 * 60 && minutes < 16 * 60) return "lunch";
  if (minutes >= 16 * 60 && minutes < 21 * 60) return "dinner";
  return "snack";
}

export function mealTypeFromUnknown(value: unknown, loggedAt: string): MealType {
  const parsed = mealTypeSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const date = new Date(loggedAt);
  return Number.isNaN(date.getTime()) ? "snack" : mealTypeForTime(date);
}

export function groupMealsByType(meals: LoggedMeal[]): Array<{ type: MealType; meals: LoggedMeal[] }> {
  return MEAL_TYPES.map((type) => ({
    type,
    meals: meals.filter((meal) => meal.mealType === type).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
  })).filter((group) => group.meals.length > 0);
}

export function needsMealTypeMigration(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  return raw.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as { mealType?: unknown; id?: unknown; loggedAt?: unknown };
    const missing = !mealTypeSchema.safeParse(record.mealType).success;
    return missing && typeof record.id === "string" && typeof record.loggedAt === "string";
  });
}
