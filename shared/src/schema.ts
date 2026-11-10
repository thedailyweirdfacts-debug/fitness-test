import { z } from "zod";

export const macrosSchema = z
  .object({
    calories: z.number().nonnegative(),
    protein: z.number().nonnegative(),
    carbs: z.number().nonnegative(),
    fat: z.number().nonnegative(),
  })
  .strict();

export const analysisItemSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    grams: z.number().positive().max(5000),
    portionLabel: z.string().trim().min(1).max(80),
    calories: z.number().nonnegative().max(8000),
    protein: z.number().nonnegative().max(500),
    carbs: z.number().nonnegative().max(500),
    fat: z.number().nonnegative().max(500),
  })
  .strict();

export const confidenceSchema = z.enum(["low", "medium", "high"]);

/** What the vision model is asked to return, before totals are added. */
export const modelOutputSchema = z
  .object({
    items: z.array(analysisItemSchema).max(12),
    confidence: confidenceSchema,
    notes: z.string().max(500).optional().default(""),
    excluded: z.array(z.string().max(140)).max(8).optional().default([]),
    barcode: z
      .preprocess((value) => {
        if (value == null || value === "") return undefined;
        if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
        if (typeof value === "string") return value.slice(0, 40);
        return value;
      }, z.string().max(40).optional())
      .default(""),
  })
  .strict();

export const mealAnalysisSchema = z
  .object({
    items: z.array(analysisItemSchema).min(1).max(12),
    totals: macrosSchema,
    confidence: confidenceSchema,
    notes: z.string().max(500),
    excluded: z.array(z.string().max(140)).max(8),
  })
  .strict();

export const foodItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    portionLabel: z.string().trim().min(1).max(80),
    baseGrams: z.number().positive().max(5000),
    baseCalories: z.number().nonnegative().max(8000),
    baseProtein: z.number().nonnegative().max(500),
    baseCarbs: z.number().nonnegative().max(500),
    baseFat: z.number().nonnegative().max(500),
    scale: z.number().positive().max(20),
  })
  .strict();

export const mealSourceSchema = z.enum(["demo", "vision", "sample"]);

export const mealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);

export const loggedMealSchema = z
  .object({
    id: z.string().min(1),
    loggedAt: z.string().min(1),
    photoUri: z.string().nullable(),
    mealType: mealTypeSchema,
    items: z.array(foodItemSchema).min(1).max(20),
    confidence: confidenceSchema,
    notes: z.string().max(500),
    excluded: z.array(z.string().max(140)).max(8),
    source: mealSourceSchema,
  })
  .strict();

export type Macros = z.infer<typeof macrosSchema>;
export type AnalysisItem = z.infer<typeof analysisItemSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type ModelOutput = z.infer<typeof modelOutputSchema>;
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;
export type FoodItem = z.infer<typeof foodItemSchema>;
export type MealSource = z.infer<typeof mealSourceSchema>;
export type MealType = z.infer<typeof mealTypeSchema>;
export type LoggedMeal = z.infer<typeof loggedMealSchema>;

export class AnalysisError extends Error {
  constructor(
    readonly code: "invalid_estimate" | "no_food",
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}
