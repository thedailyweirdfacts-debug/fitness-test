import {
  createId,
  itemsFromAnalysis,
  type FoodItem,
  type LoggedMeal,
  mealTypeForTime,
  type MealAnalysis,
  type MealSource,
  type MealType,
  type SampleId,
  type Confidence,
} from "../../../shared/src";

export type Draft = {
  key: string;
  photoUri: string | null;
  items: FoodItem[];
  confidence: Confidence;
  notes: string;
  excluded: string[];
  source: MealSource;
  sampleId: SampleId | null;
  editingId: string | null;
  loggedAt: string | null;
  mealType: MealType;
};

export function draftFromAnalysis(
  analysis: MealAnalysis,
  extra: {
    photoUri: string | null;
    source: MealSource;
    sampleId: SampleId | null;
  },
): Draft {
  return {
    key: createId(),
    photoUri: extra.photoUri,
    items: itemsFromAnalysis(analysis),
    confidence: analysis.confidence,
    notes: analysis.notes,
    excluded: analysis.excluded,
    source: extra.source,
    sampleId: extra.sampleId,
    editingId: null,
    loggedAt: null,
    mealType: mealTypeForTime(new Date()),
  };
}

export function draftFromMeal(meal: LoggedMeal): Draft {
  return {
    key: createId(),
    photoUri: meal.photoUri,
    items: meal.items,
    confidence: meal.confidence,
    notes: meal.notes,
    excluded: meal.excluded,
    source: meal.source,
    sampleId: null,
    editingId: meal.id,
    loggedAt: meal.loggedAt,
    mealType: meal.mealType,
  };
}
