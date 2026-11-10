import type { MealAnalysis } from "./schema.js";

export type SampleId = "sausage-green-beans" | "fries-ketchup";

/**
 * Owner's meal 1: sliced smoked sausage (about one link, ~5 oz),
 * about a cup of green beans, and a dab of mustard.
 * A second person's burger plate was in the background and is excluded.
 * Ballpark: ~500 kcal, ~20g protein, ~12g carbs, ~40g fat.
 */
export const SAUSAGE_MEAL: MealAnalysis = {
  items: [
    {
      name: "Smoked sausage",
      grams: 142,
      portionLabel: "1 link (5 oz)",
      calories: 453,
      protein: 18,
      carbs: 4,
      fat: 40,
    },
    {
      name: "Green beans",
      grams: 125,
      portionLabel: "1 cup",
      calories: 44,
      protein: 2,
      carbs: 8,
      fat: 0,
    },
    {
      name: "Yellow mustard",
      grams: 5,
      portionLabel: "a dab",
      calories: 3,
      protein: 0,
      carbs: 0,
      fat: 0,
    },
  ],
  totals: { calories: 500, protein: 20, carbs: 12, fat: 40 },
  confidence: "medium",
  notes:
    "Sized the sausage as about one link (5 oz) against the plate. A burger on a second plate in the background was left out.",
  excluded: ["Someone else's burger plate in the background"],
};

/**
 * Owner's meal 2: about 100 g of french fries with ~1.5 tbsp ketchup.
 * A few scraps and another plate in the background are excluded.
 * Ballpark: ~340 kcal, ~4g protein, ~45g carbs, ~15g fat.
 */
export const FRIES_MEAL: MealAnalysis = {
  items: [
    {
      name: "French fries",
      grams: 100,
      portionLabel: "about 100 g",
      calories: 312,
      protein: 4,
      carbs: 38,
      fat: 15,
    },
    {
      name: "Ketchup",
      grams: 23,
      portionLabel: "1½ tbsp",
      calories: 28,
      protein: 0,
      carbs: 7,
      fat: 0,
    },
  ],
  totals: { calories: 340, protein: 4, carbs: 45, fat: 15 },
  confidence: "medium",
  notes:
    "The fries look like about 100 g, using the plate for scale, with roughly 1½ tbsp of ketchup. Crumbs were skipped, and a plate in the background was left out.",
  excluded: ["Another plate in the background", "A few negligible scraps"],
};

export const SAMPLE_ORDER: SampleId[] = ["sausage-green-beans", "fries-ketchup"];

const SAMPLES: Record<SampleId, MealAnalysis> = {
  "sausage-green-beans": SAUSAGE_MEAL,
  "fries-ketchup": FRIES_MEAL,
};

export function sampleTitle(id: SampleId): string {
  return id === "sausage-green-beans" ? "Sausage & green beans" : "Fries & ketchup";
}

export function sampleBlurb(id: SampleId): string {
  return id === "sausage-green-beans"
    ? "One link, a cup of beans, a dab of mustard"
    : "About 100 g of fries and some ketchup";
}

export function getSample(id: SampleId): MealAnalysis {
  return JSON.parse(JSON.stringify(SAMPLES[id])) as MealAnalysis;
}

/** Stable pick so the same photo keeps the same demo meal. */
export function mockSampleForSeed(seed: string): { id: SampleId; analysis: MealAnalysis } {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  const id: SampleId = hash % 2 === 0 ? "sausage-green-beans" : "fries-ketchup";
  return { id, analysis: getSample(id) };
}
