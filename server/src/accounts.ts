import { DEFAULT_SCAN_CAP } from "../../shared/src/account.js";

export type VerifiedUser = { userId: string };

export type QuotaStatus = { used: number; remaining: number; limit: number };

export type QuotaStore = {
  consume(userId: string, day: string, cap: number): Promise<number>;
  release(userId: string, day: string): Promise<void>;
  status(userId: string, day: string, cap: number): Promise<QuotaStatus>;
};

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function verifySupabaseUser(
  token: string,
  env: { url: string; anonKey: string },
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedUser | null> {
  if (!token) return null;
  let response: Response;
  try {
    response = await fetchImpl(`${env.url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.anonKey,
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json()) as { id?: unknown };
  return typeof body.id === "string" && body.id ? { userId: body.id } : null;
}

export function createMemoryQuota(): QuotaStore {
  const counts = new Map<string, number>();
  const key = (userId: string, day: string) => `${userId}|${day}`;
  return {
    async consume(userId, day, cap) {
      const current = counts.get(key(userId, day)) ?? 0;
      if (current >= cap) return -1;
      const next = current + 1;
      counts.set(key(userId, day), next);
      return cap - next;
    },
    async release(userId, day) {
      const name = key(userId, day);
      counts.set(name, Math.max(0, (counts.get(name) ?? 0) - 1));
    },
    async status(userId, day, cap) {
      const used = counts.get(key(userId, day)) ?? 0;
      return { used, remaining: Math.max(0, cap - used), limit: cap };
    },
  };
}

export function createSupabaseQuota(env: { url: string; serviceKey: string }, fetchImpl: typeof fetch = fetch): QuotaStore {
  const endpoint = `${env.url.replace(/\/$/, "")}/rest/v1/rpc`;
  async function call(name: string, body: unknown): Promise<Response> {
    return fetchImpl(`${endpoint}/${name}`, {
      method: "POST",
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  return {
    async consume(userId, day, cap) {
      const response = await call("consume_scan", { p_user: userId, p_day: day, p_cap: cap });
      if (!response.ok) throw new Error("quota");
      const remaining = await response.json();
      return typeof remaining === "number" ? remaining : -1;
    },
    async release(userId, day) {
      const response = await call("release_scan", { p_user: userId, p_day: day });
      if (!response.ok) throw new Error("quota");
    },
    async status(userId, day, cap) {
      const response = await fetchImpl(
        `${env.url.replace(/\/$/, "")}/rest/v1/scan_usage?user_id=eq.${encodeURIComponent(userId)}&day=eq.${day}&select=count`,
        {
          headers: {
            apikey: env.serviceKey,
            Authorization: `Bearer ${env.serviceKey}`,
          },
        },
      );
      if (!response.ok) throw new Error("quota");
      const rows = (await response.json()) as Array<{ count?: number }>;
      const used = rows[0]?.count ?? 0;
      return { used, remaining: Math.max(0, cap - used), limit: cap };
    },
  };
}

export function scanCap(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_SCAN_CAP;
  return Math.floor(parsed);
}
