/** JSON Schema sent to the model. Kept strict so the provider must fill every field. */
export const MEAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      description: "Foods on the main plate only, largest first. No scraps and no other people's food.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "Short food name, such as 'smoked sausage' or 'green beans'." },
          grams: { type: "number", description: "Edible portion weight in grams." },
          portionLabel: {
            type: "string",
            description: "Friendly measure for this portion, such as '1 cup' or '5 oz'.",
          },
          calories: { type: "number", description: "Kilocalories for this portion." },
          protein: { type: "number", description: "Protein grams for this portion." },
          carbs: { type: "number", description: "Carbohydrate grams for this portion." },
          fat: { type: "number", description: "Fat grams for this portion." },
        },
        required: ["name", "grams", "portionLabel", "calories", "protein", "carbs", "fat"],
      },
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "How sure the portion estimate is.",
    },
    notes: {
      type: "string",
      description: "One or two sentences on scale cues and what was left out.",
    },
    excluded: {
      type: "array",
      description: "Things deliberately ignored, such as another person's plate or scraps.",
      items: { type: "string" },
    },
  },
  required: ["items", "confidence", "notes", "excluded"],
} as const;
