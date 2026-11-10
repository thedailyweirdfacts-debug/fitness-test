import { mealAnalysisSchema, recipeSchema, type AnalysisItem, type FoodItem, type Macros, type MealAnalysis, type Recipe } from "./schema.js";
import { createId, presentMeal, quantizeScale, round1, sumMacros } from "./nutrition.js";

/** Whole-batch items with any portion edits folded in, so a serving is a straight split. */
export function bakeRecipeItems(items: FoodItem[]): FoodItem[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name.trim(),
    portionLabel: item.portionLabel.trim() || "1 batch",
    baseGrams: clamp(Math.round(item.baseGrams * item.scale), 1, 5000),
    baseCalories: clamp(Math.round(item.baseCalories * item.scale), 0, 8000),
    baseProtein: clamp(round1(item.baseProtein * item.scale), 0, 500),
    baseCarbs: clamp(round1(item.baseCarbs * item.scale), 0, 500),
    baseFat: clamp(round1(item.baseFat * item.scale), 0, 500),
    scale: 1,
  }));
}

export function recipeShareTotals(recipe: Recipe, servingsEaten: number): Macros {
  const factor = quantizeScale(servingsEaten) / recipe.servings;
  return sumMacros(
    recipe.items.map((item) => ({
      calories: Math.round(item.baseCalories * item.scale * factor),
      protein: round1(item.baseProtein * item.scale * factor),
      carbs: round1(item.baseCarbs * item.scale * factor),
      fat: round1(item.baseFat * item.scale * factor),
    })),
  );
}

/**
 * A logged meal keeps its own copy of the numbers. Later edits to the recipe
 * do not flow back into this portion.
 */
export function portionFromRecipe(recipe: Recipe, servingsEaten: number): { items: FoodItem[]; notes: string } {
  const eaten = quantizeScale(servingsEaten);
  const factor = 1 / recipe.servings;
  const servingGrams = recipe.cookedGrams ? Math.max(1, Math.round(recipe.cookedGrams / recipe.servings)) : null;
  const portionLabel = servingGrams ? `${servingGrams} g` : "1 serving";
  const items = recipe.items.map((item) => ({
    id: createId(),
    name: item.name,
    portionLabel,
    baseGrams: clamp(Math.round(item.baseGrams * item.scale * factor), 1, 5000),
    baseCalories: clamp(Math.round(item.baseCalories * item.scale * factor), 0, 8000),
    baseProtein: clamp(round1(item.baseProtein * item.scale * factor), 0, 500),
    baseCarbs: clamp(round1(item.baseCarbs * item.scale * factor), 0, 500),
    baseFat: clamp(round1(item.baseFat * item.scale * factor), 0, 500),
    scale: eaten,
  }));
  const totals = presentMeal(items).totals;
  const count = eaten === 1 ? "1 serving" : `${trimNumber(eaten)} servings`;
  const notes = `${count} of ${recipe.name}. ${totals.calories} kcal from the ingredient batch (${trimNumber(recipe.servings)} servings).`;
  return { items, notes: notes.slice(0, 500) };
}

export function createRecipeId(): string {
  return `recipe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function parseRecipeList(raw: unknown): Recipe[] {
  if (!Array.isArray(raw)) return [];
  const recipes: Recipe[] = [];
  for (const entry of raw) {
    const parsed = recipeSchema.safeParse(entry);
    if (parsed.success) recipes.push(parsed.data);
  }
  return recipes;
}

/** A stand-in batch for demo mode, so the recipe screens work before a server is connected. */
export function demoRecipeAnalysis(lines: string[]): MealAnalysis {
  const names = lines.map((line) => line.trim()).filter((line) => line.length > 0).slice(0, 12);
  const source = names.length > 0 ? names : ["Homemade batch"];
  const items: AnalysisItem[] = source.map((line) => {
    const guess = guessLine(line);
    const name = clip(line, 80);
    return {
      name,
      grams: guess.grams,
      portionLabel: name,
      calories: guess.calories,
      protein: guess.protein,
      carbs: guess.carbs,
      fat: guess.fat,
    };
  });
  const analysis = {
    items,
    totals: sumMacros(items),
    confidence: "low" as const,
    notes: "Demo estimate for the whole batch. Sign in with a server to read real ingredient amounts.",
    excluded: [] as string[],
  };
  return mealAnalysisSchema.parse(analysis);
}

function guessLine(line: string): { grams: number; calories: number; protein: number; carbs: number; fat: number } {
  const text = line.toLowerCase();
  if (text.includes("chicken")) return { grams: 454, calories: 748, protein: 140, carbs: 0, fat: 16 };
  if (text.includes("rice")) return { grams: 316, calories: 400, protein: 8, carbs: 88, fat: 1 };
  if (text.includes("oil") || text.includes("butter")) return { grams: 14, calories: 120, protein: 0, carbs: 0, fat: 14 };
  return { grams: 100, calories: 150, protein: 5, carbs: 15, fat: 6 };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trim();
}
