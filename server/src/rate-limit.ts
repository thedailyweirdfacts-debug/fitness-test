export type RateLimitDecision =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

export type RateLimiter = (key: string, now?: number) => RateLimitDecision;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function createRateLimiter(options?: { perMinute?: number; perDay?: number }): RateLimiter {
  const perMinute = options?.perMinute ?? 5;
  const perDay = options?.perDay ?? 20;
  const buckets = new Map<string, number[]>();

  return (key, now = Date.now()) => {
    const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < DAY_MS);
    const thisMinute = recent.filter((stamp) => now - stamp < MINUTE_MS);
    if (thisMinute.length >= perMinute) {
      const oldest = thisMinute[0] ?? now;
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((MINUTE_MS - (now - oldest)) / 1000)) };
    }
    if (recent.length >= perDay) {
      const oldest = recent[0] ?? now;
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((DAY_MS - (now - oldest)) / 1000)) };
    }
    recent.push(now);
    buckets.set(key, recent);
    return { ok: true };
  };
}

export function readLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}
