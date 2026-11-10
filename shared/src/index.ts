export {
  AnalysisError,
  analysisItemSchema,
  confidenceSchema,
  foodItemSchema,
  loggedMealSchema,
  macrosSchema,
  mealAnalysisSchema,
  mealSourceSchema,
  mealTypeSchema,
  modelOutputSchema,
} from "./schema.js";
export type {
  AnalysisItem,
  Confidence,
  FoodItem,
  LoggedMeal,
  Macros,
  MealAnalysis,
  MealSource,
  MealType,
  ModelOutput,
} from "./schema.js";

export {
  MEAL_TYPES,
  groupMealsByType,
  mealTypeForTime,
  mealTypeFromUnknown,
  mealTypeLabel,
  needsMealTypeMigration,
} from "./meal-type.js";

export {
  BADGE_CATALOG,
  buildRewardReport,
  calorieGoalHit,
  clampWindow,
  dayGoalStatus,
  freshRewards,
  goalBounds,
  markRewardsSeen,
  parseGoalInput,
  progressCopy,
  streakStats,
} from "./goals.js";
export type { Badge, DayGoalStatus, FreshRewards, GoalTargets, RewardReport, SeenRewards } from "./goals.js";

export { DEFAULT_SCAN_CAP, migrationPlan, parseAuthCallback, quotaDayKey } from "./account.js";
export type { AuthCallback } from "./account.js";

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
} from "./nutrition.js";
export type { PresentedItem } from "./nutrition.js";

export { EMPTY_MACROS, addDays, dailyTotals, dayKeyFromDate, formatDayLabel, mealsForDay } from "./dates.js";

export {
  FRIES_MEAL,
  SAMPLE_ORDER,
  SAUSAGE_MEAL,
  getSample,
  mockSampleForSeed,
  sampleBlurb,
  sampleTitle,
} from "./mocks.js";
export type { SampleId } from "./mocks.js";
