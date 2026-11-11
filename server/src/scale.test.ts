import { describe, expect, it } from "vitest";
import { TEXT_SYSTEM_PROMPT, photoSystemPrompt, recipeSystemPrompt, recipeUserPrompt } from "./prompt.js";
import { applyScaleOverride, centimeters, defaultDishScale, resolveDishScale } from "./scale.js";
import { createGeminiProvider } from "./providers/gemini.js";

describe("dishware scale", () => {
  it("defaults to a 9.5 inch plate and a 7.5 inch fork", () => {
    expect(resolveDishScale({})).toEqual({ plateInches: 9.5, forkInches: 7.5 });
    expect(centimeters(9.5)).toBe(24.13);
    expect(centimeters(7.5)).toBe(19.05);
    expect(resolveDishScale({ SCALE_PLATE_INCHES: "", SCALE_FORK_INCHES: "nope" })).toEqual(defaultDishScale());
    expect(resolveDishScale({ SCALE_PLATE_INCHES: "0", SCALE_FORK_INCHES: "-1" })).toEqual(defaultDishScale());
    expect(resolveDishScale({ SCALE_PLATE_INCHES: "10", SCALE_FORK_INCHES: "8" })).toEqual({
      plateInches: 10,
      forkInches: 8,
    });
  });

  it("keeps a bad per-request override on the server scale", () => {
    const base = resolveDishScale({ SCALE_PLATE_INCHES: "10", SCALE_FORK_INCHES: "8" });
    expect(applyScaleOverride(base, { plateInches: "11.25", forkInches: 0 })).toEqual({
      plateInches: 11.25,
      forkInches: 8,
    });
    expect(applyScaleOverride(base, null)).toEqual(base);
  });

  it("tells a photo scan to prefer the plate rim and fall back when it is not his", () => {
    const prompt = photoSystemPrompt();
    expect(prompt).toContain("9.5 inches (24.13 cm)");
    expect(prompt).toContain("7.5 inches (19.05 cm)");
    expect(prompt).toContain("long axis");
    expect(prompt).toContain("measure the food against that rim first");
    expect(prompt).toContain("Cross-check with the fork");
    expect(prompt).toContain("perspective and camera angle");
    expect(prompt).toContain("no scale reference was in frame");
    expect(prompt).toContain("restaurant platter");
    expect(prompt).toContain("paper plate");
    expect(prompt).not.toContain("10–11 inches");
    expect(prompt).toMatch(/Nutrition Facts/);
    expect(prompt).toMatch(/other people's plates/);
  });

  it("puts a custom size in the photo prompt and leaves typed meals alone", () => {
    const custom = photoSystemPrompt({ plateInches: 10, forkInches: 8 });
    expect(custom).toContain("10 inches (25.4 cm)");
    expect(custom).toContain("8 inches (20.32 cm)");
    expect(custom).not.toContain("9.5 inches");
    expect(TEXT_SYSTEM_PROMPT).not.toContain("9.5");
    expect(TEXT_SYSTEM_PROMPT).not.toContain("SCALE_");
  });

  it("uses the finished dish only as a scale check, and skips that when there is no dish photo", () => {
    const system = recipeSystemPrompt();
    expect(system).toContain("ingredient totals");
    expect(system).toContain("sanity check");
    expect(system).toContain("9.5 inches (24.13 cm)");
    expect(system).toContain("restaurant platter");
    const withDish = recipeUserPrompt({ lines: ["2 cups rice"], ingredientPhotos: 0, dishPhoto: true });
    expect(withDish).toContain("sanity check");
    expect(withDish).toContain("7.5 inches (19.05 cm)");
    expect(withDish).toContain("Do not replace the ingredient totals");
    const withoutDish = recipeUserPrompt({
      lines: ["2 cups rice"],
      ingredientPhotos: 0,
      dishPhoto: false,
      scale: { plateInches: 10, forkInches: 8 },
    });
    expect(withoutDish).not.toContain("10 inches");
    expect(withoutDish).toContain("There is no finished-dish photo.");
  });

  it("sends the request override to Gemini instead of the server default", async () => {
    let system = "";
    const provider = createGeminiProvider({
      apiKey: "key",
      model: "gemini-3.5-flash-lite",
      fallbackModels: [],
      sleep: async () => undefined,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { systemInstruction?: { parts?: Array<{ text?: string }> } };
        system = body.systemInstruction?.parts?.[0]?.text ?? "";
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }), { status: 200 });
      },
    });
    await provider.analyze({
      imageBase64: "cccc",
      mimeType: "image/jpeg",
      scale: { plateInches: 11, forkInches: 6.5 },
    });
    expect(system).toContain("11 inches (27.94 cm)");
    expect(system).toContain("6.5 inches (16.51 cm)");
    expect(system).not.toContain("9.5 inches");
  });
});
