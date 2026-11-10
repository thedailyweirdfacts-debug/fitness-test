import { describe, expect, it } from "vitest";
import { mealAnalysisSchema } from "./schema.js";
import { sumMacros } from "./nutrition.js";
import { FRIES_MEAL, SAUSAGE_MEAL, getSample, mockSampleForSeed } from "./mocks.js";

describe("owner sample meals", () => {
  it("matches the sausage plate estimate and leaves out the other burger", () => {
    expect(mealAnalysisSchema.parse(SAUSAGE_MEAL)).toEqual(SAUSAGE_MEAL);
    expect(sumMacros(SAUSAGE_MEAL.items)).toEqual(SAUSAGE_MEAL.totals);
    expect(SAUSAGE_MEAL.totals).toEqual({ calories: 500, protein: 20, carbs: 12, fat: 40 });
    expect(SAUSAGE_MEAL.items.map((item) => item.name)).toEqual([
      "Smoked sausage",
      "Green beans",
      "Yellow mustard",
    ]);
    expect(SAUSAGE_MEAL.items[0]?.portionLabel).toContain("5 oz");
    expect(SAUSAGE_MEAL.items[1]?.portionLabel).toBe("1 cup");
    expect(SAUSAGE_MEAL.excluded.join(" ").toLowerCase()).toContain("burger");
    expect(SAUSAGE_MEAL.notes.toLowerCase()).toContain("left out");
  });

  it("matches the fries estimate and skips scraps plus the background plate", () => {
    expect(mealAnalysisSchema.parse(FRIES_MEAL)).toEqual(FRIES_MEAL);
    expect(sumMacros(FRIES_MEAL.items)).toEqual(FRIES_MEAL.totals);
    expect(FRIES_MEAL.totals).toEqual({ calories: 340, protein: 4, carbs: 45, fat: 15 });
    expect(FRIES_MEAL.items[0]?.grams).toBe(100);
    expect(FRIES_MEAL.items[1]?.portionLabel).toContain("tbsp");
    const skipped = FRIES_MEAL.excluded.join(" ").toLowerCase();
    expect(skipped).toContain("plate");
    expect(skipped).toContain("scrap");
  });

  it("returns a copy and picks a stable demo meal from a photo seed", () => {
    const sample = getSample("sausage-green-beans");
    sample.items[0]!.name = "changed";
    expect(SAUSAGE_MEAL.items[0]?.name).toBe("Smoked sausage");

    const first = mockSampleForSeed("file://plate-a.jpg");
    const again = mockSampleForSeed("file://plate-a.jpg");
    expect(again.id).toBe(first.id);
    expect(again.analysis.totals).toEqual(first.analysis.totals);
  });
});
