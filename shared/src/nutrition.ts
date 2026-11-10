import { mealTypeFromUnknown } from "./meal-type.js";
import {
  AnalysisError,
  type AnalysisItem,
  type FoodItem,
  type LoggedMeal,
  type Macros,
  type MealAnalysis,
  loggedMealSchema,
  mealAnalysisSchema,
  modelOutputSchema,
} from "./schema.js";

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 8;

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function sumMacros(items: Array<Pick<AnalysisItem, "calories" | "protein" | "carbs" | "fat">>): Macros {
  return {
    calories: items.reduce((sum, item) => sum + item.calories, 0),
    protein: round1(items.reduce((sum, item) => sum + item.protein, 0)),
    carbs: round1(items.reduce((sum, item) => sum + item.carbs, 0)),
    fat: round1(items.reduce((sum, item) => sum + item.fat, 0)),
  };
}

function normalizeItem(item: AnalysisItem): AnalysisItem | null {
  const grams = Math.round(item.grams);
  if (grams < 1) return null;
  return {
    name: item.name.trim(),
    grams,
    portionLabel: item.portionLabel.trim(),
    calories: Math.max(0, Math.round(item.calories)),
    protein: round1(item.protein),
    carbs: round1(item.carbs),
    fat: round1(item.fat),
  };
}

/**
 * Validate a model payload, drop sub-gram scraps, and fill in totals from the items.
 * Totals always come from the line items so the screen never shows a mismatched sum.
 */
export function finalizeAnalysis(raw: unknown): MealAnalysis {
  const parsed = modelOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AnalysisError("invalid_estimate", "The estimate didn't match the expected format.");
  }

  const items = parsed.data.items
    .map(normalizeItem)
    .filter((item): item is AnalysisItem => item !== null);

  if (items.length === 0) {
    throw new AnalysisError("no_food", "No food was found on the main plate.");
  }

  const analysis = {
    items,
    totals: sumMacros(items),
    confidence: parsed.data.confidence,
    notes: parsed.data.notes.trim(),
    excluded: parsed.data.excluded.map((entry) => entry.trim()).filter((entry) => entry.length > 0),
  };

  const checked = mealAnalysisSchema.safeParse(analysis);
  if (!checked.success) {
    throw new AnalysisError("invalid_estimate", "The estimate didn't match the expected format.");
  }
  return checked.data;
}

export function createId(): string {
  return `meal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function itemsFromAnalysis(
  analysis: MealAnalysis,
  idFor: (index: number) => string = () => createId(),
): FoodItem[] {
  return analysis.items.map((item, index) => ({
    id: idFor(index),
    name: item.name,
    portionLabel: item.portionLabel,
    baseGrams: item.grams,
    baseCalories: item.calories,
    baseProtein: item.protein,
    baseCarbs: item.carbs,
    baseFat: item.fat,
    scale: 1,
  }));
}

export function quantizeScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  return Math.round(clamped * 100) / 100;
}

export function withScale(item: FoodItem, scale: number): FoodItem {
  return { ...item, scale: quantizeScale(scale) };
}

export function withGrams(item: FoodItem, grams: number): FoodItem {
  if (!Number.isFinite(grams) || grams <= 0 || item.baseGrams <= 0) return item;
  return withScale(item, grams / item.baseGrams);
}

const FRACTIONS: Record<string, string> = {
  "0.25": "¼",
  "0.5": "½",
  "0.75": "¾",
};

export function formatScale(scale: number): string {
  const whole = Math.floor(scale + 1e-6);
  const fraction = Math.round((scale - whole) * 4) / 4;
  const fractionText = FRACTIONS[String(fraction)] ?? "";
  if (whole <= 0) return fractionText || String(round1(scale));
  if (!fractionText) return String(whole);
  return `${whole}${fractionText}`;
}

export function formatPortion(portionLabel: string, scale: number): string {
  const onStep = Math.abs(scale * 4 - Math.round(scale * 4)) < 0.02;
  if (Math.abs(scale - 1) < 0.02) return portionLabel;
  if (!onStep) return `about ${portionLabel}`;
  return `${formatScale(scale)} × ${portionLabel}`;
}

export type PresentedItem = FoodItem & {
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  portionText: string;
};

export function presentItem(item: FoodItem): PresentedItem {
  return {
    ...item,
    grams: Math.max(1, Math.round(item.baseGrams * item.scale)),
    calories: Math.round(item.baseCalories * item.scale),
    protein: round1(item.baseProtein * item.scale),
    carbs: round1(item.baseCarbs * item.scale),
    fat: round1(item.baseFat * item.scale),
    portionText: formatPortion(item.portionLabel, item.scale),
  };
}

export function presentMeal(items: FoodItem[]): { items: PresentedItem[]; totals: Macros } {
  const presented = items.map(presentItem);
  return { items: presented, totals: sumMacros(presented) };
}

export function createManualItem(input: {
  name: string;
  portionLabel: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}): FoodItem {
  const grams = Math.round(input.grams);
  return {
    id: createId(),
    name: input.name.trim(),
    portionLabel: input.portionLabel.trim() || "1 serving",
    baseGrams: grams,
    baseCalories: Math.max(0, Math.round(input.calories)),
    baseProtein: round1(Math.max(0, input.protein)),
    baseCarbs: round1(Math.max(0, input.carbs)),
    baseFat: round1(Math.max(0, input.fat)),
    scale: 1,
  };
}

export function parseMealLog(raw: unknown): LoggedMeal[] {
  if (!Array.isArray(raw)) return [];
  const meals: LoggedMeal[] = [];
  for (const entry of raw) {
    const migrated = migrateMealType(entry);
    const parsed = loggedMealSchema.safeParse(migrated);
    if (parsed.success) meals.push(parsed.data);
  }
  return meals;
}

function migrateMealType(entry: unknown): unknown {
  if (!entry || typeof entry !== "object") return entry;
  const record = entry as { mealType?: unknown; loggedAt?: unknown };
  const loggedAt = typeof record.loggedAt === "string" ? record.loggedAt : "";
  return { ...record, mealType: mealTypeFromUnknown(record.mealType, loggedAt) };
}
