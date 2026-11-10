import { mealAnalysisSchema, round1, type Macros, type MealAnalysis } from "../../shared/src/index.js";
import { HttpError } from "./errors.js";

export const PRODUCT_MISSING_MESSAGE =
  "That barcode isn't in the food database. Take a photo of the package instead.";
export const PRODUCT_NO_FACTS_MESSAGE =
  "That product has no nutrition facts yet. Take a photo of the label instead.";
export const PRODUCT_UNAVAILABLE_MESSAGE =
  "The food database could not be reached. Take a photo of the package instead.";
export const PRODUCT_INVALID_MESSAGE =
  "That barcode doesn't look right. Use the numbers under the bars, usually 8 to 14 digits.";

const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/";
const OFF_USER_AGENT = "Plateful/1.0 (meal log; https://github.com/thedailyweirdfacts-debug/fitness-test)";

export type OffLookup =
  | { status: "found"; analysis: MealAnalysis }
  | { status: "missing" }
  | { status: "no_facts" };

export type OffFetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

type OffProduct = {
  product_name?: unknown;
  product_name_en?: unknown;
  brands?: unknown;
  quantity?: unknown;
  serving_size?: unknown;
  product_quantity?: unknown;
  serving_quantity?: unknown;
  nutriments?: unknown;
};

type Basis = { macros: Macros; sugar: number | null };

/** Digits only, 8–14 long. Leading zeros stay, because they are part of the code. */
export function normalizeBarcode(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

/** A barcode the vision model claims it read. Empty or guessed text stays empty. */
export function barcodeFromModel(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const barcode = (raw as { barcode?: unknown }).barcode;
  if (typeof barcode === "number" && Number.isFinite(barcode)) return normalizeBarcode(String(Math.trunc(barcode)));
  return typeof barcode === "string" ? normalizeBarcode(barcode) : null;
}

/**
 * Map an Open Food Facts product to one logged item for the whole container.
 * Per-100g values scaled by the package weight win. Otherwise per-serving
 * values are multiplied when the package holds more than one serving.
 */
export function analysisFromOffProduct(product: OffProduct): MealAnalysis | null {
  const nutriments = product.nutriments;
  if (!nutriments || typeof nutriments !== "object") return null;
  const bag = nutriments as Record<string, unknown>;
  const per100 = readBasis(bag, "100g");
  const perServing = readBasis(bag, "serving");
  const packageGrams = positive(product.product_quantity) ?? gramsFromLabel(text(product.quantity));
  const servingGrams = positive(product.serving_quantity) ?? gramsFromLabel(text(product.serving_size));

  if (per100 && packageGrams) {
    const meal = toMeal(product, scale(per100, packageGrams / 100), packageGrams, true);
    if (meal) return meal;
  }

  const ratio = packageGrams && servingGrams ? packageGrams / servingGrams : null;
  if (perServing && ratio != null && ratio > 1.05 && packageGrams) {
    const meal = toMeal(product, scale(perServing, ratio), packageGrams, true);
    if (meal) return meal;
  }

  if (perServing) {
    const grams = servingGrams ?? packageGrams ?? gramsFromLabel(text(product.serving_size)) ?? 100;
    const whole = ratio != null ? ratio <= 1.05 : Boolean(text(product.quantity));
    return toMeal(product, perServing, grams, whole);
  }

  if (per100 && servingGrams) {
    return toMeal(product, scale(per100, servingGrams / 100), servingGrams, false);
  }

  return null;
}

export async function lookupOpenFoodFacts(barcode: string, fetchImpl: OffFetch = fetch): Promise<OffLookup> {
  const code = normalizeBarcode(barcode);
  if (!code) return { status: "missing" };

  let response: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    response = await fetchImpl(`${OFF_PRODUCT_URL}${encodeURIComponent(code)}.json`, {
      headers: { Accept: "application/json", "User-Agent": OFF_USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new HttpError(502, "provider_error", PRODUCT_UNAVAILABLE_MESSAGE);
  }

  if (response.status === 404) return { status: "missing" };
  if (!response.ok) throw new HttpError(502, "provider_error", PRODUCT_UNAVAILABLE_MESSAGE);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, "provider_error", PRODUCT_UNAVAILABLE_MESSAGE);
  }

  if (!payload || typeof payload !== "object") return { status: "missing" };
  const record = payload as { status?: unknown; product?: unknown };
  if (record.status !== 1 || !record.product || typeof record.product !== "object") return { status: "missing" };

  const analysis = analysisFromOffProduct(record.product);
  return analysis ? { status: "found", analysis } : { status: "no_facts" };
}

function readBasis(bag: Record<string, unknown>, suffix: "100g" | "serving"): Basis | null {
  const calories = readNum(bag, `energy-kcal_${suffix}`);
  if (calories == null) return null;
  return {
    macros: {
      calories,
      protein: readNum(bag, `proteins_${suffix}`) ?? 0,
      carbs: readNum(bag, `carbohydrates_${suffix}`) ?? 0,
      fat: readNum(bag, `fat_${suffix}`) ?? 0,
    },
    sugar: readNum(bag, `sugars_${suffix}`),
  };
}

function scale(basis: Basis, factor: number): Basis {
  return {
    macros: {
      calories: Math.round(basis.macros.calories * factor),
      protein: round1(basis.macros.protein * factor),
      carbs: round1(basis.macros.carbs * factor),
      fat: round1(basis.macros.fat * factor),
    },
    sugar: basis.sugar == null ? null : round1(basis.sugar * factor),
  };
}

function toMeal(product: OffProduct, basis: Basis, grams: number, whole: boolean): MealAnalysis | null {
  const weight = Math.round(grams);
  const macros = {
    calories: Math.round(basis.macros.calories),
    protein: round1(basis.macros.protein),
    carbs: round1(basis.macros.carbs),
    fat: round1(basis.macros.fat),
  };
  if (weight < 1 || weight > 5000 || macros.calories > 8000 || macros.protein > 500 || macros.carbs > 500 || macros.fat > 500) {
    return null;
  }

  const parsed = mealAnalysisSchema.safeParse({
    items: [
      {
        name: productTitle(product),
        grams: weight,
        portionLabel: portionText(product, whole),
        ...macros,
      },
    ],
    totals: macros,
    confidence: "high",
    notes: buildNotes(product, whole, basis.sugar),
    excluded: [],
  });
  return parsed.success ? parsed.data : null;
}

function productTitle(product: OffProduct): string {
  const name = clip(text(product.product_name) || text(product.product_name_en) || "Packaged food", 80);
  const brand = firstBrand(product.brands);
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name;
  const combined = `${brand} ${name}`;
  return combined.length <= 80 ? combined : name;
}

function portionText(product: OffProduct, whole: boolean): string {
  const quantity = text(product.quantity);
  const serving = text(product.serving_size);
  if (whole && quantity) return clip(`1 package (${quantity})`, 80);
  if (whole) return "1 package";
  if (serving) return clip(serving, 80);
  return "1 serving";
}

function buildNotes(product: OffProduct, whole: boolean, sugar: number | null): string {
  const size = text(product.quantity) || text(product.serving_size) || "the listed size";
  const basis = whole
    ? `Open Food Facts for the whole package (${size}).`
    : `Open Food Facts for one serving (${size}). The full package size wasn't listed.`;
  const sugarNote = sugar != null && sugar > 0 ? ` ${Math.round(sugar)} g sugar.` : "";
  return clip(`${basis}${sugarNote}`, 500);
}

function firstBrand(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  return raw.split(",")[0]?.trim() ?? "";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNum(bag: Record<string, unknown>, key: string): number | null {
  const value = bag[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function gramsFromLabel(label: string): number | null {
  const match = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|fl oz|oz)\b/i.exec(label);
  if (!match?.[1] || !match[2]) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === "kg" || unit === "l") return amount * 1000;
  if (unit === "oz") return amount * 28.35;
  if (unit === "fl oz") return amount * 29.57;
  return amount;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max).trim();
}
