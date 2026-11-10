import { describe, expect, it } from "vitest";
import { AnalysisError } from "./schema.js";
import { SAUSAGE_MEAL } from "./mocks.js";
import {
  createManualItem,
  finalizeAnalysis,
  formatPortion,
  itemsFromAnalysis,
  parseMealLog,
  presentMeal,
  withGrams,
  withScale,
} from "./nutrition.js";

describe("finalizeAnalysis", () => {
  it("recomputes totals and drops a sub-gram scrap", () => {
    const analysis = finalizeAnalysis({
      items: [
        {
          name: "Apple",
          grams: 180.4,
          portionLabel: "1 apple",
          calories: 94.6,
          protein: 0.44,
          carbs: 25.2,
          fat: 0.26,
        },
        {
          name: "Crumb",
          grams: 0.4,
          portionLabel: "a crumb",
          calories: 2,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
      ],
      confidence: "high",
      notes: "  One apple.  ",
      excluded: ["  a smear of sauce  ", ""],
    });

    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0]).toMatchObject({ grams: 180, calories: 95, protein: 0.4, carbs: 25.2, fat: 0.3 });
    expect(analysis.totals).toEqual({ calories: 95, protein: 0.4, carbs: 25.2, fat: 0.3 });
    expect(analysis.notes).toBe("One apple.");
    expect(analysis.excluded).toEqual(["a smear of sauce"]);
  });

  it("keeps a readable package barcode out of the saved meal", () => {
    const analysis = finalizeAnalysis({
      items: [
        {
          name: "Red Bull Energy Drink",
          grams: 250,
          portionLabel: "1 can (8.4 fl oz)",
          calories: 110,
          protein: 0,
          carbs: 27,
          fat: 0,
        },
      ],
      confidence: "high",
      notes: "Published package values for one 8.4 fl oz can.",
      excluded: [],
      barcode: "9002490100070",
    });

    expect(analysis.totals).toEqual({ calories: 110, protein: 0, carbs: 27, fat: 0 });
    expect(analysis).not.toHaveProperty("barcode");
  });

  it("rejects an empty plate and a payload that is not the schema", () => {
    expect(() =>
      finalizeAnalysis({
        items: [],
        confidence: "low",
        notes: "",
        excluded: [],
      }),
    ).toThrow(AnalysisError);

    try {
      finalizeAnalysis({
        items: [{ name: "Mystery", grams: 0.2, portionLabel: "dust", calories: 0, protein: 0, carbs: 0, fat: 0 }],
        confidence: "low",
        notes: "",
        excluded: [],
      });
      throw new Error("expected no_food");
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisError);
      expect((error as AnalysisError).code).toBe("no_food");
    }

    expect(() => finalizeAnalysis({ hello: "plate" })).toThrow(AnalysisError);
  });
});

describe("portion edits", () => {
  const [sausage, beans, mustard] = itemsFromAnalysis(SAUSAGE_MEAL, (index) => `item-${index}`);

  it("scales one item and recalculates the meal", () => {
    const doubled = withScale(sausage!, 2);
    const view = presentMeal([doubled, beans!, mustard!]);
    expect(view.items[0]).toMatchObject({
      grams: 284,
      calories: 906,
      protein: 36,
      carbs: 8,
      fat: 80,
      portionText: "2 × 1 link (5 oz)",
    });
    expect(view.totals).toEqual({ calories: 953, protein: 38, carbs: 16, fat: 80 });
  });

  it("derives the multiplier from a gram edit and clamps tiny portions", () => {
    const edited = withGrams(sausage!, 71);
    expect(edited.scale).toBe(0.5);
    expect(presentMeal([edited]).items[0]?.portionText).toBe("½ × 1 link (5 oz)");
    expect(formatPortion("1 cup", 1)).toBe("1 cup");
    expect(formatPortion("1 cup", 1.41)).toBe("about 1 cup");
    expect(withScale(beans!, 0.01).scale).toBe(0.25);
    expect(withScale(beans!, 40).scale).toBe(8);
  });

  it("adds a manual item and ignores corrupt log rows", () => {
    const added = createManualItem({
      name: "  Rice  ",
      portionLabel: "",
      grams: 150,
      calories: 195,
      protein: 4,
      carbs: 42,
      fat: 0.4,
    });
    expect(added).toMatchObject({
      name: "Rice",
      portionLabel: "1 serving",
      baseGrams: 150,
      baseFat: 0.4,
      scale: 1,
    });

    const valid = {
      id: "meal-1",
      loggedAt: new Date(2026, 10, 9, 12).toISOString(),
      photoUri: null,
      items: [beans],
      confidence: "medium",
      notes: "",
      excluded: [],
      source: "sample",
    };
    expect(parseMealLog([valid, { id: "broken" }, "nope", null])).toEqual([{ ...valid, mealType: "lunch" }]);
    expect(parseMealLog([{ ...valid, loggedAt: "not-a-date" }])[0]?.mealType).toBe("snack");
    const evening = { ...valid, loggedAt: new Date(2026, 10, 9, 18, 30).toISOString() };
    expect(parseMealLog([evening])[0]?.mealType).toBe("dinner");
    expect(parseMealLog([{ ...valid, mealType: "snack" }])[0]?.mealType).toBe("snack");
    expect(parseMealLog({ not: "an array" })).toEqual([]);
  });
});
