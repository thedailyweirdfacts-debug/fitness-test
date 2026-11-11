import { z } from "zod";
import {
  AnalysisError,
  finalizeAnalysis,
  mealAnalysisSchema,
  sumMacros,
  type AnalysisItem,
  type MealAnalysis,
} from "../../shared/src/index.js";
import { rethrowEstimate, PHOTO_TOO_LARGE_MESSAGE } from "./analyze.js";
import { HttpError } from "./errors.js";
import { normalizeBarcode, type OffLookup } from "./open-food-facts.js";
import type { RecipeVisionRequest, VisionProvider } from "./providers/types.js";
import { applyScaleOverride, defaultDishScale, type DishScale } from "./scale.js";

const MAX_IMAGE = 700_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const ingredientSchema = z
  .object({
    text: z.string().trim().max(200).optional(),
    imageBase64: z.string().max(MAX_IMAGE).optional(),
    mimeType: z.string().max(40).optional(),
    barcode: z.string().max(32).optional(),
  })
  .strict();

const requestSchema = z
  .object({
    ingredients: z.array(ingredientSchema).min(1).max(6),
    dishImageBase64: z.string().max(MAX_IMAGE).optional(),
    dishMimeType: z.string().max(40).optional(),
    scalePlateInches: z.union([z.number(), z.string()]).optional(),
    scaleForkInches: z.union([z.number(), z.string()]).optional(),
  })
  .strict();

export const RECIPE_INVALID_MESSAGE =
  "Add at least one ingredient: a photo, a barcode, or a short line like 2 cups rice.";
export const RECIPE_NO_FOOD_MESSAGE = "No ingredients were found. Add a photo or name each ingredient.";

export type PreparedRecipe =
  | { needsVision: false; analysis: MealAnalysis }
  | { needsVision: true; vision: RecipeVisionRequest; barcodeItems: AnalysisItem[] };

export async function prepareRecipe(
  body: unknown,
  lookup: (barcode: string) => Promise<OffLookup>,
  scale: DishScale = defaultDishScale(),
): Promise<PreparedRecipe> {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const oversized = parsed.error.issues.some((issue) => issue.code === "too_big");
    if (oversized) throw new HttpError(413, "payload_too_large", PHOTO_TOO_LARGE_MESSAGE);
    throw new HttpError(400, "invalid_request", RECIPE_INVALID_MESSAGE);
  }

  const photos = parsed.data.ingredients.filter((item) => item.imageBase64).length;
  if (photos > 4) {
    throw new HttpError(400, "invalid_request", "Use up to 4 ingredient photos. Type the other ingredients.");
  }

  const barcodeItems: AnalysisItem[] = [];
  const lines: string[] = [];
  const images: RecipeVisionRequest["images"] = [];
  let unresolved = 0;

  for (const ingredient of parsed.data.ingredients) {
    const text = ingredient.text?.trim() ?? "";
    const barcode = normalizeBarcode(ingredient.barcode);
    const image = readImage(ingredient.imageBase64, ingredient.mimeType);
    if (!text && !barcode && !image) {
      throw new HttpError(400, "invalid_request", RECIPE_INVALID_MESSAGE);
    }

    if (barcode) {
      const found = await lookup(barcode);
      if (found.status === "found") {
        barcodeItems.push(...found.analysis.items);
        continue;
      }
    }

    if (!text && !image) {
      unresolved += 1;
      continue;
    }
    if (text) lines.push(text);
    if (image) images.push({ ...image, role: "ingredient" });
  }

  const dish = readImage(parsed.data.dishImageBase64, parsed.data.dishMimeType);
  const needsVision = lines.length > 0 || images.length > 0;
  if (!needsVision) {
    if (barcodeItems.length === 0) {
      throw new HttpError(
        422,
        "no_food",
        unresolved > 0
          ? "Those barcodes aren't in the food database. Add a photo of the package or type the ingredient."
          : RECIPE_NO_FOOD_MESSAGE,
      );
    }
    return { needsVision: false, analysis: batchAnalysis(barcodeItems, "high", barcodeNotes(barcodeItems.length)) };
  }

  if (dish) images.push({ ...dish, role: "dish" });
  return {
    needsVision: true,
    vision: {
      lines,
      images,
      scale: applyScaleOverride(scale, {
        plateInches: parsed.data.scalePlateInches,
        forkInches: parsed.data.scaleForkInches,
      }),
    },
    barcodeItems,
  };
}

export async function estimatePreparedRecipe(prepared: Extract<PreparedRecipe, { needsVision: true }>, provider: VisionProvider | null): Promise<MealAnalysis> {
  if (!provider?.analyzeRecipe) {
    throw new HttpError(503, "not_configured", "No vision API key is configured on the server.");
  }
  try {
    const raw = await provider.analyzeRecipe(prepared.vision);
    return mergeRecipeEstimate(prepared.barcodeItems, raw);
  } catch (error) {
    if (error instanceof AnalysisError && error.code === "no_food" && prepared.barcodeItems.length > 0) {
      return batchAnalysis(prepared.barcodeItems, "high", barcodeNotes(prepared.barcodeItems.length));
    }
    rethrowEstimate(error, RECIPE_NO_FOOD_MESSAGE);
  }
}

export function mergeRecipeEstimate(barcodeItems: AnalysisItem[], raw: unknown): MealAnalysis {
  let model: MealAnalysis | null = null;
  try {
    model = finalizeAnalysis(raw);
  } catch (error) {
    if (barcodeItems.length === 0 || !(error instanceof AnalysisError)) throw error;
    if (error.code !== "no_food") throw error;
  }
  const items = [...barcodeItems, ...(model?.items ?? [])].slice(0, 12);
  if (items.length === 0) throw new AnalysisError("no_food", RECIPE_NO_FOOD_MESSAGE);
  const notes = ["Totals are for the whole batch, from the ingredients.", model?.notes ?? "", barcodeItems.length ? barcodeNotes(barcodeItems.length) : ""]
    .filter((part) => part.trim().length > 0)
    .join(" ")
    .slice(0, 500);
  const confidence = model?.confidence ?? "high";
  return mealAnalysisSchema.parse({
    items,
    totals: sumMacros(items),
    confidence,
    notes,
    excluded: model?.excluded ?? [],
  });
}

function batchAnalysis(items: AnalysisItem[], confidence: MealAnalysis["confidence"], notes: string): MealAnalysis {
  return mealAnalysisSchema.parse({
    items: items.slice(0, 12),
    totals: sumMacros(items.slice(0, 12)),
    confidence,
    notes: notes.slice(0, 500),
    excluded: [],
  });
}

function barcodeNotes(count: number): string {
  return count === 1
    ? "One packaged ingredient used Open Food Facts for the whole package."
    : `${count} packaged ingredients used Open Food Facts for the whole package.`;
}

function readImage(value: string | undefined, mimeType: string | undefined): { imageBase64: string; mimeType: string } | null {
  if (!value || value.length < 32) return null;
  const imageBase64 = value.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw new HttpError(400, "invalid_request", "An ingredient photo was not valid base64.");
  }
  const mime = mimeType === "image/jpg" || !mimeType ? "image/jpeg" : mimeType;
  if (!ALLOWED_MIME.has(mime)) {
    throw new HttpError(400, "invalid_request", "Ingredient photos need to be jpeg, png, webp, or heic.");
  }
  return { imageBase64, mimeType: mime };
}
