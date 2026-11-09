export {
  AnalysisError,
  analysisItemSchema,
  confidenceSchema,
  foodItemSchema,
  loggedMealSchema,
  macrosSchema,
  mealAnalysisSchema,
  mealSourceSchema,
  modelOutputSchema,
} from "./schema";
export type {
  AnalysisItem,
  Confidence,
  FoodItem,
  LoggedMeal,
  Macros,
  MealAnalysis,
  MealSource,
  ModelOutput,
} from "./schema";

export {
  MAX_SCALE,
  MIN_SCALE,
  createId,
  createManualItem,
  finalizeAnalysis,
  formatPortion,
  formatScale,
  itemsFromAnalysis,
  parseMealLog,
  presentItem,
  presentMeal,
  quantizeScale,
  round1,
  sumMacros,
  withGrams,
  withScale,
} from "./nutrition";
export type { PresentedItem } from "./nutrition";

export { EMPTY_MACROS, addDays, dailyTotals, dayKeyFromDate, formatDayLabel, mealsForDay } from "./dates";

export {
  FRIES_MEAL,
  SAMPLE_ORDER,
  SAUSAGE_MEAL,
  getSample,
  mockSampleForSeed,
  sampleBlurb,
  sampleTitle,
} from "./mocks";
export type { SampleId } from "./mocks";
