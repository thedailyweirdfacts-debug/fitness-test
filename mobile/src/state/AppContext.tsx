import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  bakeRecipeItems,
  createId,
  migrationPlan,
  needsMealTypeMigration,
  parseAuthCallback,
  parseMealLog,
  parseRecipeList,
  recipeSchema,
  type LoggedMeal,
  type MealType,
  type Recipe,
  type SeenRewards,
} from "../../../shared/src";
import { fetchQuota } from "../lib/api";
import {
  deleteCloudMeal,
  deleteCloudRecipe,
  fetchCloudLog,
  fetchCloudRecipes,
  readPhotoBytes,
  saveCloudPreferences,
  upsertCloudMeal,
  upsertCloudRecipe,
  type CloudPreferences,
} from "../lib/cloud";
import type { Draft } from "../lib/draft";
import { deleteStoredPhoto, persistMealPhoto } from "../lib/photos";
import { defaultSettings, normalizeApiBaseUrl, resolveAppSecret, settingsFromStorage, settingsSchema, type AppSettings } from "../lib/settings";
import { getSupabase, supabaseConfigured } from "../lib/supabase";

const SETTINGS_KEY = "@plateful/settings";
const MEALS_KEY = "@plateful/meals";
const RECIPES_KEY = "@plateful/recipes";
const REWARDS_KEY = "@plateful/rewards";
const EMPTY_SEEN: SeenRewards = { badges: [], goalDays: [] };

export type AccountSession = {
  userId: string;
  email: string;
  accessToken: string;
};

type AppContextValue = {
  ready: boolean;
  accountsEnabled: boolean;
  session: AccountSession | null;
  passwordReset: boolean;
  clearPasswordReset: () => void;
  scansRemaining: number | null;
  noteScansRemaining: (value: number | null) => void;
  refreshQuota: () => Promise<void>;
  syncError: string | null;
  signOut: () => Promise<void>;
  settings: AppSettings;
  meals: LoggedMeal[];
  recipes: Recipe[];
  saveRecipe: (recipe: Recipe) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  seenRewards: SeenRewards;
  saveSeenRewards: (next: SeenRewards) => Promise<void>;
  draft: Draft | null;
  saveSettings: (next: AppSettings) => Promise<void>;
  openDraft: (draft: Draft) => void;
  saveDraft: (draft: Draft) => Promise<void>;
  updateMealType: (id: string, mealType: MealType) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

function readSeen(raw: string | null): SeenRewards {
  if (!raw) return EMPTY_SEEN;
  try {
    const parsed = JSON.parse(raw) as { badges?: unknown; goalDays?: unknown };
    return {
      badges: Array.isArray(parsed.badges) ? parsed.badges.filter((id): id is string => typeof id === "string") : [],
      goalDays: Array.isArray(parsed.goalDays) ? parsed.goalDays.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return EMPTY_SEEN;
  }
}

function toAccount(session: Session): AccountSession {
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    accessToken: session.access_token,
  };
}

function prefsFrom(settings: AppSettings, seen: SeenRewards): CloudPreferences {
  return {
    calorieGoal: settings.calorieGoal,
    proteinGoal: settings.proteinGoal,
    goalWindowPercent: settings.goalWindowPercent,
    seenBadges: seen.badges,
    seenGoalDays: seen.goalDays,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [session, setSession] = useState<AccountSession | null>(null);
  const [passwordReset, setPasswordReset] = useState(false);
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [seenRewards, setSeenRewards] = useState<SeenRewards>(EMPTY_SEEN);
  const mealsRef = useRef<LoggedMeal[]>([]);
  const localMealsRef = useRef<LoggedMeal[]>([]);
  const recipesRef = useRef<Recipe[]>([]);
  const localRecipesRef = useRef<Recipe[]>([]);
  const recipePathsRef = useRef<Map<string, string>>(new Map());
  const settingsRef = useRef<AppSettings>(defaultSettings());
  const seenRef = useRef<SeenRewards>(EMPTY_SEEN);
  const localSeenRef = useRef<SeenRewards>(EMPTY_SEEN);
  const sessionRef = useRef<AccountSession | null>(null);
  const photoPathsRef = useRef<Map<string, string>>(new Map());
  const bootedRef = useRef(false);

  const replaceMeals = useCallback((next: LoggedMeal[], local: boolean) => {
    mealsRef.current = next;
    if (local) localMealsRef.current = next;
    setMeals(next);
  }, []);

  const replaceRecipes = useCallback((next: Recipe[], local: boolean) => {
    recipesRef.current = next;
    if (local) localRecipesRef.current = next;
    setRecipes(next);
  }, []);

  const refreshQuota = useCallback(async () => {
    const current = sessionRef.current;
    const stored = settingsRef.current;
    if (!current || !stored.apiBaseUrl || stored.useDemoMode) {
      setScansRemaining(null);
      return;
    }
    try {
      const quota = await fetchQuota(stored.apiBaseUrl, current.accessToken, resolveAppSecret(stored.appSecret));
      setScansRemaining(quota.remaining);
    } catch {
      setScansRemaining(null);
    }
  }, []);

  const adoptSession = useCallback(
    async (nextSession: Session) => {
      const account = toAccount(nextSession);
      sessionRef.current = account;
      setSession(account);
      const supabase = getSupabase();
      if (!supabase) return;
      try {
        const remote = await fetchCloudLog(supabase);
        const localMeals = localMealsRef.current;
        const marked = (await AsyncStorage.getItem(`@plateful/migrated/${account.userId}`)) === "1";
        const pending = migrationPlan(
          localMeals.map((meal) => meal.id),
          remote.meals.map((meal) => meal.id),
          marked,
        );
        const mealsById = new Map(remote.meals.map((meal) => [meal.id, meal]));
        const paths = new Map(remote.paths);
        for (const id of pending) {
          const meal = localMeals.find((item) => item.id === id);
          if (!meal) continue;
          const bytes = await readPhotoBytes(meal.photoUri);
          const saved = await upsertCloudMeal(supabase, account.userId, meal, bytes, null);
          mealsById.set(saved.meal.id, saved.meal);
          if (saved.path) paths.set(saved.meal.id, saved.path);
        }
        if (pending.length === 0 || pending.every((id) => mealsById.has(id))) {
          await AsyncStorage.setItem(`@plateful/migrated/${account.userId}`, "1");
        }
        let prefs = remote.preferences;
        if (!prefs) {
          prefs = await saveCloudPreferences(supabase, account.userId, prefsFrom(settingsRef.current, localSeenRef.current));
        }
        const nextSettings: AppSettings = {
          ...settingsRef.current,
          calorieGoal: prefs.calorieGoal,
          proteinGoal: prefs.proteinGoal,
          goalWindowPercent: prefs.goalWindowPercent,
        };
        settingsRef.current = nextSettings;
        setSettings(nextSettings);
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
        const seen = { badges: prefs.seenBadges, goalDays: prefs.seenGoalDays };
        seenRef.current = seen;
        setSeenRewards(seen);
        photoPathsRef.current = paths;
        replaceMeals([...mealsById.values()].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)), false);
        try {
          const remoteRecipes = await fetchCloudRecipes(supabase);
          const recipeMarked = (await AsyncStorage.getItem(`@plateful/recipes-migrated/${account.userId}`)) === "1";
          const pendingRecipes = migrationPlan(
            localRecipesRef.current.map((recipe) => recipe.id),
            remoteRecipes.recipes.map((recipe) => recipe.id),
            recipeMarked,
          );
          const recipesById = new Map(remoteRecipes.recipes.map((recipe) => [recipe.id, recipe]));
          const recipePaths = new Map(remoteRecipes.paths);
          for (const id of pendingRecipes) {
            const recipe = localRecipesRef.current.find((item) => item.id === id);
            if (!recipe) continue;
            const bytes = await readPhotoBytes(recipe.photoUri);
            const saved = await upsertCloudRecipe(supabase, account.userId, recipe, bytes, null);
            recipesById.set(saved.recipe.id, saved.recipe);
            if (saved.path) recipePaths.set(saved.recipe.id, saved.path);
          }
          if (pendingRecipes.length === 0 || pendingRecipes.every((id) => recipesById.has(id))) {
            await AsyncStorage.setItem(`@plateful/recipes-migrated/${account.userId}`, "1");
          }
          recipePathsRef.current = recipePaths;
          replaceRecipes([...recipesById.values()], false);
          setSyncError(null);
        } catch {
          setSyncError("Couldn't open your saved recipes. In Supabase, run the recipes SQL, then sign in again.");
        }
        await refreshQuota();
      } catch {
        setSyncError("Couldn't open your account log. Check the connection and try again.");
      }
    },
    [refreshQuota, replaceMeals, replaceRecipes],
  );

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    const subscription = supabase?.auth.onAuthStateChange((event, next) => {
      if (!bootedRef.current || cancelled) return;
      if (!next) {
        sessionRef.current = null;
        setSession(null);
        setScansRemaining(null);
        seenRef.current = localSeenRef.current;
        setSeenRewards(localSeenRef.current);
        replaceMeals(localMealsRef.current, false);
        replaceRecipes(localRecipesRef.current, false);
        recipePathsRef.current = new Map();
        return;
      }
      const account = toAccount(next);
      sessionRef.current = account;
      setSession(account);
      if (event === "SIGNED_IN") {
        setTimeout(() => {
          if (!cancelled) void adoptSession(next);
        }, 0);
      }
    });

    (async () => {
      try {
        const [settingsRaw, mealsRaw, recipesRaw, rewardsRaw] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(MEALS_KEY),
          AsyncStorage.getItem(RECIPES_KEY),
          AsyncStorage.getItem(REWARDS_KEY),
        ]);
        if (cancelled) return;
        let stored = defaultSettings();
        if (settingsRaw) {
          const parsed = settingsSchema.safeParse(JSON.parse(settingsRaw));
          if (parsed.success) stored = settingsFromStorage(parsed.data);
        }
        settingsRef.current = stored;
        setSettings(stored);
        if (mealsRaw) {
          const raw = JSON.parse(mealsRaw);
          const parsed = parseMealLog(raw);
          localMealsRef.current = parsed;
          mealsRef.current = parsed;
          setMeals(parsed);
          if (needsMealTypeMigration(raw)) await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(parsed));
        }
        if (recipesRaw) {
          const parsed = parseRecipeList(JSON.parse(recipesRaw));
          localRecipesRef.current = parsed;
          recipesRef.current = parsed;
          setRecipes(parsed);
        }
        const seen = readSeen(rewardsRaw);
        localSeenRef.current = seen;
        seenRef.current = seen;
        setSeenRewards(seen);
        if (supabase) {
          const { data } = await supabase.auth.getSession();
          if (!cancelled && data.session) await adoptSession(data.session);
        }
      } catch {
        // Unreadable storage falls back to an empty log and demo mode.
      } finally {
        bootedRef.current = true;
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.data.subscription.unsubscribe();
    };
  }, [adoptSession, replaceMeals]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const apply = async (url: string) => {
      const parsed = parseAuthCallback(url);
      if (!parsed) return;
      if (parsed.kind === "code") {
        await supabase.auth.exchangeCodeForSession(parsed.code);
        return;
      }
      await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
      if (parsed.type === "recovery") setPasswordReset(true);
    };
    Linking.getInitialURL().then((url) => {
      if (url) void apply(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => void apply(url));
    return () => sub.remove();
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      accountsEnabled: supabaseConfigured(),
      session,
      passwordReset,
      clearPasswordReset() {
        setPasswordReset(false);
      },
      scansRemaining,
      noteScansRemaining(value) {
        setScansRemaining(value);
      },
      refreshQuota,
      syncError,
      async signOut() {
        await getSupabase()?.auth.signOut();
        sessionRef.current = null;
        setSession(null);
        setScansRemaining(null);
        setPasswordReset(false);
        seenRef.current = localSeenRef.current;
        setSeenRewards(localSeenRef.current);
        replaceMeals(localMealsRef.current, false);
        replaceRecipes(localRecipesRef.current, false);
        recipePathsRef.current = new Map();
      },
      settings,
      meals,
      recipes,
      async saveRecipe(recipe) {
        const photoUri = recipe.photoUri ? await persistMealPhoto(recipe.photoUri, recipe.id) : null;
        const candidate = { ...recipe, photoUri, items: bakeRecipeItems(recipe.items), updatedAt: new Date().toISOString() };
        const parsed = recipeSchema.safeParse(candidate);
        if (!parsed.success) throw new Error("Check the recipe name, servings, and ingredients.");
        const current = sessionRef.current;
        const supabase = getSupabase();
        let stored = parsed.data;
        if (current && supabase) {
          const bytes = await readPhotoBytes(photoUri);
          const saved = await upsertCloudRecipe(supabase, current.userId, stored, bytes, recipePathsRef.current.get(recipe.id) ?? null);
          stored = saved.recipe;
          if (saved.path) recipePathsRef.current.set(recipe.id, saved.path);
        }
        const next = recipesRef.current.some((item) => item.id === stored.id)
          ? recipesRef.current.map((item) => (item.id === stored.id ? stored : item))
          : [...recipesRef.current, stored];
        if (!current) await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify(next));
        replaceRecipes(next, !current);
      },
      async deleteRecipe(id) {
        const current = sessionRef.current;
        const supabase = getSupabase();
        const target = recipesRef.current.find((recipe) => recipe.id === id);
        if (current && supabase) {
          await deleteCloudRecipe(supabase, id, recipePathsRef.current.get(id) ?? null);
          recipePathsRef.current.delete(id);
        }
        const next = recipesRef.current.filter((recipe) => recipe.id !== id);
        if (!current) await AsyncStorage.setItem(RECIPES_KEY, JSON.stringify(next));
        replaceRecipes(next, !current);
        if (target && !current) deleteStoredPhoto(target.photoUri);
      },
      seenRewards,
      async saveSeenRewards(next) {
        seenRef.current = next;
        setSeenRewards(next);
        const current = sessionRef.current;
        const supabase = getSupabase();
        if (current && supabase) {
          await saveCloudPreferences(supabase, current.userId, prefsFrom(settingsRef.current, next));
          return;
        }
        localSeenRef.current = next;
        await AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(next));
      },
      draft,
      async saveSettings(next) {
        const stored: AppSettings = {
          useDemoMode: next.useDemoMode,
          apiBaseUrl: normalizeApiBaseUrl(next.apiBaseUrl),
          appSecret: next.appSecret.trim(),
          calorieGoal: next.calorieGoal,
          proteinGoal: next.proteinGoal,
          goalWindowPercent: next.goalWindowPercent,
        };
        settingsRef.current = stored;
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
        setSettings(stored);
        const current = sessionRef.current;
        const supabase = getSupabase();
        if (current && supabase) {
          await saveCloudPreferences(supabase, current.userId, prefsFrom(stored, seenRef.current));
        }
        if (stored.useDemoMode) setScansRemaining(null);
        else void refreshQuota();
      },
      openDraft(next) {
        setDraft(next);
      },
      async saveDraft(next) {
        const mealId = next.editingId ?? createId();
        const previous = mealsRef.current.find((meal) => meal.id === mealId);
        const photoUri = next.photoUri ? await persistMealPhoto(next.photoUri, mealId) : null;
        const meal: LoggedMeal = {
          id: mealId,
          loggedAt: next.loggedAt ?? new Date().toISOString(),
          photoUri,
          mealType: next.mealType,
          items: next.items.map((item) => ({ ...item, name: item.name.trim() })),
          confidence: next.confidence,
          notes: next.notes,
          excluded: next.excluded,
          source: next.source,
        };
        const current = sessionRef.current;
        const supabase = getSupabase();
        let storedMeal = meal;
        if (current && supabase) {
          const bytes = await readPhotoBytes(photoUri);
          const saved = await upsertCloudMeal(supabase, current.userId, meal, bytes, photoPathsRef.current.get(mealId) ?? null);
          storedMeal = saved.meal;
          if (saved.path) photoPathsRef.current.set(mealId, saved.path);
        }
        const nextMeals = next.editingId
          ? mealsRef.current.map((item) => (item.id === storedMeal.id ? storedMeal : item))
          : [...mealsRef.current, storedMeal];
        if (!current) {
          try {
            await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(nextMeals));
          } catch (error) {
            throw error instanceof Error ? error : new Error("Couldn't save this meal on the device.");
          }
        }
        if (previous?.photoUri && previous.photoUri !== photoUri) deleteStoredPhoto(previous.photoUri);
        replaceMeals(nextMeals, !current);
        setDraft(next);
      },
      async updateMealType(id, mealType) {
        const currentMeal = mealsRef.current.find((meal) => meal.id === id);
        if (!currentMeal) return;
        const updated = { ...currentMeal, mealType };
        const current = sessionRef.current;
        const supabase = getSupabase();
        if (current && supabase) {
          await upsertCloudMeal(supabase, current.userId, updated, null, photoPathsRef.current.get(id) ?? null);
        }
        const nextMeals = mealsRef.current.map((meal) => (meal.id === id ? updated : meal));
        if (!current) await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(nextMeals));
        replaceMeals(nextMeals, !current);
        setDraft((item) => (item?.editingId === id ? { ...item, mealType } : item));
      },
      async deleteMeal(id) {
        const current = sessionRef.current;
        const supabase = getSupabase();
        const target = mealsRef.current.find((meal) => meal.id === id);
        if (current && supabase) {
          await deleteCloudMeal(supabase, id, photoPathsRef.current.get(id) ?? null);
          photoPathsRef.current.delete(id);
        }
        const nextMeals = mealsRef.current.filter((meal) => meal.id !== id);
        if (!current) await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(nextMeals));
        replaceMeals(nextMeals, !current);
        if (target && !current) deleteStoredPhoto(target.photoUri);
      },
    }),
    [ready, session, passwordReset, scansRemaining, refreshQuota, syncError, settings, meals, recipes, seenRewards, draft, replaceMeals, replaceRecipes],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
