import { z } from "zod";

export const settingsSchema = z.object({
  useDemoMode: z.boolean(),
  apiBaseUrl: z.string(),
  appSecret: z.string().optional(),
  calorieGoal: z.number().int().positive().max(20000).nullable().optional(),
  proteinGoal: z.number().int().positive().max(1000).nullable().optional(),
  goalWindowPercent: z.number().int().min(1).max(50).optional(),
});

export type AppSettings = {
  useDemoMode: boolean;
  apiBaseUrl: string;
  appSecret: string;
  calorieGoal: number | null;
  proteinGoal: number | null;
  goalWindowPercent: number;
};

export function defaultSettings(): AppSettings {
  const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  return {
    apiBaseUrl,
    appSecret: (process.env.EXPO_PUBLIC_APP_SECRET ?? "").trim(),
    useDemoMode: apiBaseUrl.length === 0,
    calorieGoal: null,
    proteinGoal: null,
    goalWindowPercent: 10,
  };
}

export function settingsFromStorage(parsed: z.infer<typeof settingsSchema>): AppSettings {
  const defaults = defaultSettings();
  return {
    useDemoMode: parsed.useDemoMode,
    apiBaseUrl: normalizeApiBaseUrl(parsed.apiBaseUrl),
    appSecret: (parsed.appSecret ?? defaults.appSecret).trim(),
    calorieGoal: parsed.calorieGoal ?? null,
    proteinGoal: parsed.proteinGoal ?? null,
    goalWindowPercent: parsed.goalWindowPercent ?? defaults.goalWindowPercent,
  };
}

export function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}

/** An empty saved secret falls back to the one baked in at build time. */
export function resolveAppSecret(stored: string): string {
  const typed = stored.trim();
  if (typed) return typed;
  return (process.env.EXPO_PUBLIC_APP_SECRET ?? "").trim();
}
