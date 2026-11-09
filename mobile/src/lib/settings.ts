import { z } from "zod";

export const settingsSchema = z
  .object({
    useDemoMode: z.boolean(),
    apiBaseUrl: z.string(),
  })
  .strict();

export type AppSettings = z.infer<typeof settingsSchema>;

export function defaultSettings(): AppSettings {
  const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  return {
    apiBaseUrl,
    useDemoMode: apiBaseUrl.length === 0,
  };
}

export function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, "");
}
