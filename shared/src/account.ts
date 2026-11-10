/** Per person, per Pacific day. Flash-Lite is tried first, which leaves more free headroom than the old ~20/day Flash cap. */
export const DEFAULT_SCAN_CAP = 30;

const PACIFIC = "America/Los_Angeles";

/** Gemini's free day resets at midnight Pacific time. The scan cap uses the same day. */
export function quotaDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return "1970-01-01";
  return `${year}-${month}-${day}`;
}

/**
 * Copy this phone's meals up only when the account is empty, or when a previous
 * copy from this same phone stopped halfway. Another phone's log is left alone.
 */
export function migrationPlan(localIds: string[], remoteIds: string[], markedDone: boolean): string[] {
  if (markedDone) return [];
  const local = new Set(localIds);
  const remote = new Set(remoteIds);
  const remoteCameFromThisPhone = [...remote].every((id) => local.has(id));
  if (remote.size > 0 && !remoteCameFromThisPhone) return [];
  return localIds.filter((id) => !remote.has(id));
}

export type AuthCallback =
  | { kind: "code"; code: string }
  | { kind: "session"; accessToken: string; refreshToken: string; type: string | null }
  | null;

export function parseAuthCallback(url: string): AuthCallback {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : "";
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : "";
  const hashParams = readParams(hash);
  const queryParams = readParams(query);
  const accessToken = hashParams.get("access_token") ?? queryParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token") ?? queryParams.get("refresh_token");
  if (accessToken && refreshToken) {
    return {
      kind: "session",
      accessToken,
      refreshToken,
      type: hashParams.get("type") ?? queryParams.get("type") ?? null,
    };
  }
  const code = queryParams.get("code") ?? hashParams.get("code");
  if (code) return { kind: "code", code };
  return null;
}

function readParams(value: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of value.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq >= 0 ? part.slice(0, eq) : part;
    const rawValue = eq >= 0 ? part.slice(eq + 1) : "";
    params.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue));
  }
  return params;
}
