import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, TEXT_SYSTEM_PROMPT } from "./prompt.js";
import { HttpError } from "./errors.js";
import { analyzeRequest } from "./analyze.js";
import {
  analysisFromOffProduct,
  lookupOpenFoodFacts,
  PRODUCT_UNAVAILABLE_MESSAGE,
  type OffFetch,
} from "./open-food-facts.js";

const redBull = {
  product_name: "Energy Drink",
  brands: "Red Bull",
  quantity: "250 ml",
  serving_size: "250 ml",
  product_quantity: 250,
  serving_quantity: 250,
  nutriments: {
    "energy-kcal_serving": 110,
    fat_serving: 0,
    carbohydrates_serving: 27,
    proteins_serving: 0,
    sugars_serving: 27,
  },
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("Open Food Facts products", () => {
  it("logs a can from the published serving when the can is one serving", () => {
    const analysis = analysisFromOffProduct(redBull);
    expect(analysis?.items[0]).toMatchObject({
      name: "Red Bull Energy Drink",
      grams: 250,
      calories: 110,
      protein: 0,
      carbs: 27,
      fat: 0,
    });
    expect(analysis?.totals).toEqual({ calories: 110, protein: 0, carbs: 27, fat: 0 });
    expect(analysis?.confidence).toBe("high");
    expect(analysis?.notes).toMatch(/Open Food Facts/);
    expect(analysis?.notes).toMatch(/250 ml/);
    expect(analysis?.notes).toMatch(/27 g sugar/);
    expect(analysis?.items[0]?.portionLabel).toBe("1 package (250 ml)");
  });

  it("scales per-100g values to the whole package", () => {
    const analysis = analysisFromOffProduct({
      ...redBull,
      nutriments: {
        "energy-kcal_100g": 44,
        fat_100g: 0,
        carbohydrates_100g: 10.8,
        proteins_100g: 0,
        sugars_100g: 10.8,
      },
    });
    expect(analysis?.totals).toEqual({ calories: 110, protein: 0, carbs: 27, fat: 0 });
    expect(analysis?.notes).toMatch(/whole package/);
  });

  it("multiplies a serving up to the whole bag", () => {
    const analysis = analysisFromOffProduct({
      product_name: "Potato chips",
      brands: "Example",
      quantity: "140 g",
      serving_size: "28 g",
      product_quantity: 140,
      serving_quantity: 28,
      nutriments: {
        "energy-kcal_serving": 150,
        fat_serving: 9,
        carbohydrates_serving: 15,
        proteins_serving: 2,
      },
    });
    expect(analysis?.items[0]).toMatchObject({ grams: 140, calories: 750, fat: 45, carbs: 75, protein: 10 });
    expect(analysis?.notes).toMatch(/whole package \(140 g\)/);
  });

  it("says when only one serving was listed", () => {
    const analysis = analysisFromOffProduct({
      product_name: "Protein bar",
      serving_size: "1 bar",
      nutriments: { "energy-kcal_serving": 200, proteins_serving: 20, carbohydrates_serving: 22, fat_serving: 7 },
    });
    expect(analysis?.items[0]?.calories).toBe(200);
    expect(analysis?.notes).toMatch(/one serving/);
    expect(analysis?.notes).toMatch(/wasn't listed/);
  });

  it("looks up a mocked product and treats a miss as not found", async () => {
    const found = await lookupOpenFoodFacts("9002490100070", async (url, init) => {
      expect(url).toBe("https://world.openfoodfacts.org/api/v2/product/9002490100070.json");
      expect(init?.headers?.["User-Agent"]).toMatch(/Plateful/);
      return jsonResponse(200, { status: 1, product: redBull });
    });
    expect(found.status).toBe("found");
    if (found.status === "found") expect(found.analysis.totals.calories).toBe(110);

    const missing = await lookupOpenFoodFacts("00000000", async () => jsonResponse(200, { status: 0, product: null }));
    expect(missing.status).toBe("missing");

    const empty = await lookupOpenFoodFacts("12345678", async () =>
      jsonResponse(200, { status: 1, product: { product_name: "Mystery", nutriments: {} } }),
    );
    expect(empty.status).toBe("no_facts");
  });

  it("reports a database that cannot be reached", async () => {
    const down: OffFetch = async () => {
      throw new Error("offline");
    };
    await expect(lookupOpenFoodFacts("9002490100070", down)).rejects.toMatchObject({
      status: 502,
      message: PRODUCT_UNAVAILABLE_MESSAGE,
    });
    await expect(lookupOpenFoodFacts("9002490100070", down)).rejects.toBeInstanceOf(HttpError);
  });
});

describe("packaged photo estimates", () => {
  it("asks the photo model for a label, published package values, and a barcode", () => {
    expect(SYSTEM_PROMPT).toMatch(/Nutrition Facts/);
    expect(SYSTEM_PROMPT).toMatch(/Red Bull/);
    expect(SYSTEM_PROMPT).toMatch(/8\.4 fl oz/);
    expect(SYSTEM_PROMPT).toMatch(/other people's plates/);
    expect(TEXT_SYSTEM_PROMPT).toMatch(/published/);
    expect(TEXT_SYSTEM_PROMPT).toMatch(/whole container/);
  });

  it("replaces the photo estimate when the model reads a barcode that Open Food Facts knows", async () => {
    const analysis = await analyzeRequest(
      { imageBase64: "a".repeat(40), mimeType: "image/jpeg" },
      {
        id: "gemini",
        model: "test",
        async analyze() {
          return {
            items: [{ name: "Can", grams: 250, portionLabel: "1 can", calories: 80, protein: 0, carbs: 20, fat: 0 }],
            confidence: "low",
            notes: "A guess.",
            excluded: [],
            barcode: "9002 4901 0007 0",
          };
        },
      },
      async (barcode) => {
        expect(barcode).toBe("9002490100070");
        return { status: "found", analysis: analysisFromOffProduct(redBull)! };
      },
    );
    expect(analysis.totals.calories).toBe(110);
    expect(analysis.items[0]?.name).toBe("Red Bull Energy Drink");
  });

  it("keeps the photo estimate when the barcode is missing or the lookup fails", async () => {
    const provider = {
      id: "gemini" as const,
      model: "test",
      async analyze() {
        return {
          items: [{ name: "Apple", grams: 180, portionLabel: "1 apple", calories: 95, protein: 0.5, carbs: 25, fat: 0.3 }],
          confidence: "high" as const,
          notes: "A whole apple.",
          excluded: [],
          barcode: "12345678",
        };
      },
    };
    const missed = await analyzeRequest({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }, provider, async () => ({
      status: "missing",
    }));
    expect(missed.totals.calories).toBe(95);

    const failed = await analyzeRequest({ imageBase64: "a".repeat(40), mimeType: "image/jpeg" }, provider, async () => {
      throw new Error("offline");
    });
    expect(failed.totals.calories).toBe(95);
  });
});
