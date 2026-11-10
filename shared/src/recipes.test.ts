import { describe, expect, it } from "vitest";
import type { Recipe } from "./schema.js";
import { bakeRecipeItems, demoRecipeAnalysis, portionFromRecipe, recipeShareTotals } from "./recipes.js";

const chili: Recipe = {
  id: "recipe_chili",
  name: "Chicken rice",
  servings: 4,
  cookedGrams: 1200,
  photoUri: null,
  items: [
    {
      id: "chicken",
      name: "1 lb chicken breast",
      portionLabel: "1 lb chicken breast",
      baseGrams: 454,
      baseCalories: 748,
      baseProtein: 140,
      baseCarbs: 0,
      baseFat: 16,
      scale: 1,
    },
    {
      id: "rice",
      name: "2 cups rice",
      portionLabel: "2 cups rice",
      baseGrams: 316,
      baseCalories: 400,
      baseProtein: 8,
      baseCarbs: 88,
      baseFat: 1,
      scale: 1,
    },
  ],
  confidence: "high",
  notes: "Totals are for the whole batch, from the ingredients.",
  createdAt: "2026-11-10T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
};

describe("recipe portions", () => {
  it("splits the batch by servings and keeps a snapshot", () => {
    const one = portionFromRecipe(chili, 1);
    const more = portionFromRecipe(chili, 1.5);
    expect(recipeShareTotals(chili, 1)).toEqual({ calories: 287, protein: 37, carbs: 22, fat: 4.3 });
    expect(one.items).toHaveLength(2);
    expect(one.items[0]).toMatchObject({ baseCalories: 187, baseProtein: 35, scale: 1, portionLabel: "300 g" });
    expect(one.items[0]?.id).not.toBe(chili.items[0]?.id);
    expect(recipeShareTotals(chili, 1.5)).toEqual({ calories: 431, protein: 55.5, carbs: 33, fat: 6.4 });
    expect(more.items[0]?.scale).toBe(1.5);

    chili.items[0]!.baseCalories = 10;
    expect(one.items[0]?.baseCalories).toBe(187);
    chili.items[0]!.baseCalories = 748;
  });

  it("folds a corrected ingredient amount into the batch before saving", () => {
    const baked = bakeRecipeItems([{ ...chili.items[1]!, scale: 0.5 }]);
    expect(baked[0]).toMatchObject({ baseCalories: 200, baseGrams: 158, scale: 1 });
  });

  it("builds a demo batch from typed ingredients", () => {
    const analysis = demoRecipeAnalysis(["1 lb chicken breast", "2 cups rice"]);
    expect(analysis.totals).toEqual({ calories: 1148, protein: 148, carbs: 88, fat: 17 });
    expect(analysis.notes).toMatch(/whole batch/);
  });
});
