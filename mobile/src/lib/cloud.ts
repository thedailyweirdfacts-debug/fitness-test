import { File } from "expo-file-system";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loggedMealSchema, type LoggedMeal } from "../../../shared/src";

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
