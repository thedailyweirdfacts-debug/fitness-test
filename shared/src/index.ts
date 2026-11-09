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
} from "./schema";
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
} from "./schema";

export {
  MEAL_TYPES,
  groupMealsByType,
  mealTypeForTime,
  mealTypeFromUnknown,
  mealTypeLabel,
  needsMealTypeMigration,
} from "./meal-type";

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
} from "./goals";
export type { Badge, DayGoalStatus, FreshRewards, GoalTargets, RewardReport, SeenRewards } from "./goals";

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
