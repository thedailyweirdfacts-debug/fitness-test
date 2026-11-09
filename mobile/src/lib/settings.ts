import { z } from "zod";

export const settingsSchema = z.object({
  useDemoMode: z.boolean(),
  apiBaseUrl: z.string(),
  appSecret: z.string().optional(),
});

export type AppSettings = {
  useDemoMode: boolean;
  apiBaseUrl: string;
  appSecret: string;
};

export function defaultSettings(): AppSettings {
  const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  return {
    apiBaseUrl,
    appSecret: (process.env.EXPO_PUBLIC_APP_SECRET ?? "").trim(),
    useDemoMode: apiBaseUrl.length === 0,
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
