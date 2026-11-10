import { File } from "expo-file-system";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loggedMealSchema, recipeSchema, type LoggedMeal, type Recipe } from "../../../shared/src";

const BUCKET = "meal-photos";
const SIGNED_SECONDS = 60 * 60 * 12;

export type CloudPreferences = {
  calorieGoal: number | null;
  proteinGoal: number | null;
  goalWindowPercent: number;
  seenBadges: string[];
  seenGoalDays: string[];
};

export type CloudLog = {
  meals: LoggedMeal[];
  paths: Map<string, string>;
  preferences: CloudPreferences | null;
};

type MealRow = {
  id: string;
  logged_at: string;
  meal_type: string;
  photo_path: string | null;
  items: unknown;
  confidence: string;
  notes: string | null;
  excluded: unknown;
  source: string;
};

export async function readPhotoBytes(uri: string | null): Promise<Uint8Array | null> {
  if (!uri || /^https?:/i.test(uri)) return null;
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return await file.bytes();
  } catch {
    return null;
  }
}

export async function fetchCloudLog(supabase: SupabaseClient): Promise<CloudLog> {
  const { data, error } = await supabase.from("meals").select("*").order("logged_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MealRow[];
  const paths = new Map<string, string>();
  const meals: LoggedMeal[] = [];
  for (const row of rows) {
    if (row.photo_path) paths.set(row.id, row.photo_path);
    const photoUri = row.photo_path ? await signedPhotoUrl(supabase, row.photo_path) : null;
    const meal = mealFromRow(row, photoUri);
    if (meal) meals.push(meal);
  }
  return { meals, paths, preferences: await fetchPreferences(supabase) };
}

export async function upsertCloudMeal(
  supabase: SupabaseClient,
  userId: string,
  meal: LoggedMeal,
  photoBytes: Uint8Array | null,
  existingPath: string | null,
): Promise<{ meal: LoggedMeal; path: string | null }> {
  let path = existingPath;
  if (photoBytes) {
    path = `${userId}/${meal.id}.jpg`;
    const body = photoBytes.buffer.slice(photoBytes.byteOffset, photoBytes.byteOffset + photoBytes.byteLength) as ArrayBuffer;
    const uploaded = await supabase.storage.from(BUCKET).upload(path, body, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (uploaded.error) throw new Error(uploaded.error.message);
  }
  const saved = await supabase.from("meals").upsert({
    id: meal.id,
    user_id: userId,
    logged_at: meal.loggedAt,
    meal_type: meal.mealType,
    photo_path: path,
    items: meal.items,
    confidence: meal.confidence,
    notes: meal.notes,
    excluded: meal.excluded,
    source: meal.source,
    updated_at: new Date().toISOString(),
  });
  if (saved.error) throw new Error(saved.error.message);
  const photoUri = path ? (await signedPhotoUrl(supabase, path)) ?? meal.photoUri : meal.photoUri;
  return { meal: { ...meal, photoUri }, path };
}

export async function deleteCloudMeal(supabase: SupabaseClient, mealId: string, path: string | null): Promise<void> {
  if (path) {
    const removed = await supabase.storage.from(BUCKET).remove([path]);
    if (removed.error) throw new Error(removed.error.message);
  }
  const deleted = await supabase.from("meals").delete().eq("id", mealId);
  if (deleted.error) throw new Error(deleted.error.message);
}

export async function saveCloudPreferences(
  supabase: SupabaseClient,
  userId: string,
  prefs: CloudPreferences,
): Promise<CloudPreferences> {
  const saved = await supabase.from("preferences").upsert({
    user_id: userId,
    calorie_goal: prefs.calorieGoal,
    protein_goal: prefs.proteinGoal,
    goal_window_percent: prefs.goalWindowPercent,
    seen_badges: prefs.seenBadges,
    seen_goal_days: prefs.seenGoalDays,
  });
  if (saved.error) throw new Error(saved.error.message);
  return prefs;
}

async function fetchPreferences(supabase: SupabaseClient): Promise<CloudPreferences | null> {
  const { data, error } = await supabase.from("preferences").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as {
    calorie_goal: number | null;
    protein_goal: number | null;
    goal_window_percent: number | null;
    seen_badges: string[] | null;
    seen_goal_days: string[] | null;
  };
  const window = row.goal_window_percent;
  return {
    calorieGoal: row.calorie_goal,
    proteinGoal: row.protein_goal,
    goalWindowPercent: window === 5 || window === 15 || window === 20 || window === 10 ? window : 10,
    seenBadges: row.seen_badges ?? [],
    seenGoalDays: row.seen_goal_days ?? [],
  };
}

async function signedPhotoUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  return signed.data?.signedUrl ?? null;
}

type RecipeRow = {
  id: string;
  name: string;
  servings: number | string;
  cooked_grams: number | string | null;
  photo_path: string | null;
  items: unknown;
  confidence: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchCloudRecipes(supabase: SupabaseClient): Promise<{ recipes: Recipe[]; paths: Map<string, string> }> {
  const { data, error } = await supabase.from("recipes").select("*").order("updated_at", { ascending: true });
  if (error) throw new Error(error.message);
  const paths = new Map<string, string>();
  const recipes: Recipe[] = [];
  for (const row of (data ?? []) as RecipeRow[]) {
    if (row.photo_path) paths.set(row.id, row.photo_path);
    const photoUri = row.photo_path ? await signedPhotoUrl(supabase, row.photo_path) : null;
    const recipe = recipeFromRow(row, photoUri);
    if (recipe) recipes.push(recipe);
  }
  return { recipes, paths };
}

export async function upsertCloudRecipe(
  supabase: SupabaseClient,
  userId: string,
  recipe: Recipe,
  photoBytes: Uint8Array | null,
  existingPath: string | null,
): Promise<{ recipe: Recipe; path: string | null }> {
  let path = existingPath;
  if (photoBytes) {
    path = `${userId}/recipes/${recipe.id}.jpg`;
    const body = photoBytes.buffer.slice(photoBytes.byteOffset, photoBytes.byteOffset + photoBytes.byteLength) as ArrayBuffer;
    const uploaded = await supabase.storage.from(BUCKET).upload(path, body, { contentType: "image/jpeg", upsert: true });
    if (uploaded.error) throw new Error(uploaded.error.message);
  }
  const saved = await supabase.from("recipes").upsert({
    id: recipe.id,
    user_id: userId,
    name: recipe.name,
    servings: recipe.servings,
    cooked_grams: recipe.cookedGrams,
    photo_path: path,
    items: recipe.items,
    confidence: recipe.confidence,
    notes: recipe.notes,
    created_at: recipe.createdAt,
    updated_at: recipe.updatedAt,
  });
  if (saved.error) throw new Error(saved.error.message);
  const photoUri = path ? (await signedPhotoUrl(supabase, path)) ?? recipe.photoUri : recipe.photoUri;
  return { recipe: { ...recipe, photoUri }, path };
}

export async function deleteCloudRecipe(supabase: SupabaseClient, recipeId: string, path: string | null): Promise<void> {
  if (path) {
    const removed = await supabase.storage.from(BUCKET).remove([path]);
    if (removed.error) throw new Error(removed.error.message);
  }
  const deleted = await supabase.from("recipes").delete().eq("id", recipeId);
  if (deleted.error) throw new Error(deleted.error.message);
}

function recipeFromRow(row: RecipeRow, photoUri: string | null): Recipe | null {
  const servings = typeof row.servings === "string" ? Number(row.servings) : row.servings;
  const cooked = row.cooked_grams == null ? null : typeof row.cooked_grams === "string" ? Number(row.cooked_grams) : row.cooked_grams;
  const parsed = recipeSchema.safeParse({
    id: row.id,
    name: row.name,
    servings,
    cookedGrams: cooked,
    photoUri,
    items: row.items,
    confidence: row.confidence,
    notes: row.notes ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  return parsed.success ? parsed.data : null;
}

function mealFromRow(row: MealRow, photoUri: string | null): LoggedMeal | null {
  const parsed = loggedMealSchema.safeParse({
    id: row.id,
    loggedAt: row.logged_at,
    photoUri,
    mealType: row.meal_type,
    items: row.items,
    confidence: row.confidence,
    notes: row.notes ?? "",
    excluded: row.excluded ?? [],
    source: row.source,
  });
  return parsed.success ? parsed.data : null;
}
