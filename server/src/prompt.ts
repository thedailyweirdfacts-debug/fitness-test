import { centimeters, defaultDishScale, type DishScale } from "./scale.js";

function inchesLabel(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function scaleReference(scale: DishScale = defaultDishScale()): string {
  const plate = inchesLabel(scale.plateInches);
  const fork = inchesLabel(scale.forkInches);
  return `This person's dinner plate is ${plate} inches (${centimeters(scale.plateInches)} cm) across. Treat that as the diameter; if the plate is oval, use the long axis. This person's fork is ${fork} inches (${centimeters(scale.forkInches)} cm) long, from the end of the handle to the tip of the tines.`;
}

export function photoScaleRules(scale: DishScale = defaultDishScale()): string {
  return `- Look for a dinner plate and a fork before you estimate portion size. ${scaleReference(scale)}
- If the plate rim is visible and the plate looks like this person's dinner plate, measure the food against that rim first. Cross-check with the fork length when a fork is also in frame.
- Account for perspective and camera angle. A plate seen at an angle looks like an ellipse; use the longer visible axis of the rim as the diameter, and do not treat foreshortening as a smaller plate.
- Use those references to estimate food length, area, volume, and gram weight, then convert that weight to calories and macros.
- If neither a fork nor a plate is visible, estimate portions the way you normally would. Say in notes that no scale reference was in frame, and lower confidence when the portion is hard to judge.
- Do not assume a plate is this person's plate when it clearly is not, such as a restaurant platter, a compartment tray, a paper plate, a bowl, or a plate that is obviously a different size. Say that in notes, estimate without these measurements, and lower confidence if the size is still uncertain.`;
}

export function photoSystemPrompt(scale: DishScale = defaultDishScale()): string {
  return `You estimate the food on the MAIN plate in a meal photo for a personal food log.

Rules:
- Count only the meal that belongs to the person taking the photo: the foreground plate, bowl, or tray.
- Ignore other people's plates and any food that is clearly in the background or off to the side.
- Skip negligible scraps, crumbs, smears, and bites too small to matter.
${photoScaleRules(scale)}
- Estimate an edible portion in grams and a friendly household measure (examples: "1 cup", "5 oz", "1 link", "1½ tbsp").
- Estimate calories, protein grams, carbs grams, and fat grams for that portion. Use typical home-cooked values unless the food is obviously from a restaurant.
- If you are unsure, lower confidence instead of inventing extra foods.
- confidence is "low" when the plate is occluded, blurry, or the scale is unclear; "medium" for a normal phone photo; "high" only when the foods and portions are unmistakable.
- notes: one or two short sentences on how you judged the portion and what you left out.
- excluded: short labels for plates, foods, or scraps you deliberately skipped. Use an empty array if nothing was skipped.
- Do not include totals. Do not include items you excluded.
- If the main plate has no real food, return an empty items array.
- A packaged product counts too: a can, bottle, bag, box, or bar in the foreground. Log the whole container, not one sip or a handful.
- If a Nutrition Facts label is readable, use those numbers. When the label lists one serving and the package holds several, multiply up to the whole container.
- If the label is not readable but the brand and size are clear, use that brand's published values for that package. A Red Bull can of 8.4 fl oz is 110 kcal and 27 g sugar.
- portionLabel should name the package, such as "1 can (8.4 fl oz)" or "1 bag".
- notes must say whether you read the Nutrition Facts label or used published package values, and the size you assumed.
- confidence is "high" when the label was readable or the package is unmistakable.
- barcode is the digits of a barcode you can actually read on the package. Use an empty string when no barcode is readable. Do not guess a barcode.`;
}

export const SYSTEM_PROMPT = photoSystemPrompt();

export const USER_PROMPT = "Estimate the main plate in this photo.";

export const TEXT_SYSTEM_PROMPT = `You estimate a meal from a short written description for a personal food log.

Rules:
- Split the description into separate foods. A sandwich and fries are two items, not one.
- When the person names a restaurant, chain, or brand, use that item's published nutrition for the size they named. Examples: a Chick-fil-A Grilled Chicken Sandwich, and Chick-fil-A medium Waffle Potato Fries. If they leave the size out, use that chain's regular or medium size.
- If you do not know a published value, use a typical estimate for that food and say so.
- Give an edible portion in grams and a friendly household measure (examples: "1 sandwich", "medium fries", "1 cup").
- Estimate calories, protein grams, carbs grams, and fat grams for that portion.
- confidence is "high" when the numbers come from published chain or brand nutrition, "medium" for a typical estimate, and "low" when the description is vague.
- notes: one or two short sentences on whether you used published numbers or a typical estimate.
- excluded: parts of the description that are not food. Use an empty array when everything counted.
- Do not include totals. Do not include items you excluded.
- If the description is not food, return an empty items array.
- For a packaged product, log the whole container the person named (one can, one bag, or one bar) and say the size you assumed.`;

export function textUserPrompt(description: string): string {
  return `Estimate this meal:\n${description}`;
}

export function recipeScaleRules(scale: DishScale = defaultDishScale()): string {
  return `- When the finished-dish photo shows a plate or fork, use it only as a sanity check on the batch size. ${scaleReference(scale)} Prefer the plate rim when it looks like this person's dinner plate, cross-check with the fork, and account for perspective and camera angle.
- Do not replace the ingredient totals with a guess from the finished dish. If the scaled dish looks much larger or smaller than the ingredients, say so in notes and lower confidence.
- If the dishware is clearly not this person's, such as a restaurant platter, a paper plate, or a plate of a different size, do not apply these measurements. Say that in notes.
- If neither a fork nor a plate is visible in the finished photo, skip the scale check and keep the ingredient totals.`;
}

export function recipeSystemPrompt(scale: DishScale = defaultDishScale()): string {
  return `You total the ingredients of one homemade recipe for a personal food log.

Rules:
- Each ingredient line or ingredient photo is food that goes into the whole batch. Estimate the full amount described or shown, not a single bite of the finished dish.
- If a Nutrition Facts label is readable, use those numbers. If the label is not readable but the brand and package size are clear, use that brand's published values for the amount used. A whole package that is the ingredient counts as the whole package.
- The finished-dish photo, when one is included, is only a sanity check. Do not replace the ingredient totals with a guess from how the finished dish looks. Use notes to say if the dish looks inconsistent with the ingredients.
${recipeScaleRules(scale)}
- Return one item per ingredient, with the amount for the whole batch. Do not divide by servings.
- portionLabel names that ingredient amount, such as "2 cups" or "1 lb".
- confidence is "high" when amounts come from a label, a package, or a clear measurement, and "medium" for a typical estimate.
- notes: one or two short sentences on the batch. Say that the numbers are for the whole batch.
- excluded: anything in the photos that is not part of this recipe. Use an empty array when everything counted.
- barcode: empty string. Do not guess a barcode.
- Do not include totals.
- If there are no real ingredients, return an empty items array.`;
}

export const RECIPE_SYSTEM_PROMPT = recipeSystemPrompt();

export function recipeUserPrompt(input: { lines: string[]; ingredientPhotos: number; dishPhoto: boolean; scale?: DishScale }): string {
  const lines = input.lines.length > 0 ? input.lines.map((line, index) => `${index + 1}. ${line}`).join("\n") : "No typed lines.";
  const photos =
    input.ingredientPhotos > 0
      ? `The next ${input.ingredientPhotos} photo${input.ingredientPhotos === 1 ? "" : "s"} show the ingredients, in order.`
      : "There are no ingredient photos.";
  const dish = input.dishPhoto
    ? `The last photo is the finished dish. Use it only as a sanity check. ${scaleReference(input.scale)} Prefer the plate rim, cross-check with the fork, and account for camera angle. Do not replace the ingredient totals.`
    : "There is no finished-dish photo.";
  return `Total this recipe batch.\n\nIngredients:\n${lines}\n\n${photos}\n${dish}`;
}
