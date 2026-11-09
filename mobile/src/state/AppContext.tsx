import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createId, parseMealLog, type LoggedMeal } from "../../../shared/src";
import type { Draft } from "../lib/draft";
import { deleteStoredPhoto, persistMealPhoto } from "../lib/photos";
import { defaultSettings, normalizeApiBaseUrl, settingsSchema, type AppSettings } from "../lib/settings";

const SETTINGS_KEY = "@plateful/settings";
const MEALS_KEY = "@plateful/meals";

type AppContextValue = {
  ready: boolean;
  settings: AppSettings;
  meals: LoggedMeal[];
  draft: Draft | null;
  saveSettings: (next: AppSettings) => Promise<void>;
  openDraft: (draft: Draft) => void;
  saveDraft: (draft: Draft) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const mealsRef = useRef<LoggedMeal[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsRaw, mealsRaw] = await Promise.all([
          AsyncStorage.getItem(SETTINGS_KEY),
          AsyncStorage.getItem(MEALS_KEY),
        ]);
        if (cancelled) return;
        if (settingsRaw) {
          const parsed = settingsSchema.safeParse(JSON.parse(settingsRaw));
          if (parsed.success) {
            setSettings({
              useDemoMode: parsed.data.useDemoMode,
              apiBaseUrl: normalizeApiBaseUrl(parsed.data.apiBaseUrl),
              appSecret: parsed.data.appSecret ?? defaultSettings().appSecret,
            });
          }
        }
        if (mealsRaw) {
          const parsed = parseMealLog(JSON.parse(mealsRaw));
          mealsRef.current = parsed;
          setMeals(parsed);
        }
      } catch {
        // Unreadable storage falls back to an empty log and demo mode.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      settings,
      meals,
      draft,
      async saveSettings(next) {
        const stored: AppSettings = {
          useDemoMode: next.useDemoMode,
          apiBaseUrl: normalizeApiBaseUrl(next.apiBaseUrl),
          appSecret: next.appSecret.trim(),
        };
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
        setSettings(stored);
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
          items: next.items.map((item) => ({ ...item, name: item.name.trim() })),
          confidence: next.confidence,
          notes: next.notes,
          excluded: next.excluded,
          source: next.source,
        };
        const current = mealsRef.current;
        const nextMeals = next.editingId
          ? current.map((item) => (item.id === meal.id ? meal : item))
          : [...current, meal];
        try {
          await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(nextMeals));
        } catch (error) {
          throw error instanceof Error ? error : new Error("Couldn't save this meal on the device.");
        }
        if (previous?.photoUri && previous.photoUri !== photoUri) deleteStoredPhoto(previous.photoUri);
        mealsRef.current = nextMeals;
        setMeals(nextMeals);
        setDraft(next);
      },
      async deleteMeal(id) {
        const current = mealsRef.current;
        const target = current.find((meal) => meal.id === id);
        const nextMeals = current.filter((meal) => meal.id !== id);
        await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(nextMeals));
        mealsRef.current = nextMeals;
        setMeals(nextMeals);
        if (target) deleteStoredPhoto(target.photoUri);
      },
    }),
    [ready, settings, meals, draft],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
