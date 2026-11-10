import { createProvider, resolveVisionConfig } from "./config";
import { createSupabaseQuota, scanCap, verifySupabaseUser } from "./accounts";
import { createRateLimiter, readLimit, type RateLimiter } from "./rate-limit";
import type { ServerOptions } from "./server";

let limiter: RateLimiter | null = null;

export function runtimeOptions(env: NodeJS.ProcessEnv = process.env): ServerOptions {
  const config = resolveVisionConfig(env);
  const supabaseUrl = env.SUPABASE_URL?.trim() ?? "";
  const anonKey = env.SUPABASE_ANON_KEY?.trim() ?? "";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  return {
    provider: createProvider(config),
    providerId: config.providerId,
    model: config.model,
    appSecret: env.APP_SECRET?.trim() || null,
    rateLimiter: sharedLimiter(env),
    dailyCap: scanCap(env.SCAN_DAILY_CAP),
    verifyUser: supabaseUrl && anonKey ? (token) => verifySupabaseUser(token, { url: supabaseUrl, anonKey }) : undefined,
    quota: supabaseUrl && serviceKey ? createSupabaseQuota({ url: supabaseUrl, serviceKey }) : undefined,
  };
}

function sharedLimiter(env: NodeJS.ProcessEnv): RateLimiter {
  if (!limiter) {
    limiter = createRateLimiter({
      perMinute: readLimit(env.RATE_LIMIT_PER_MINUTE, 5),
      perDay: readLimit(env.RATE_LIMIT_PER_DAY, 60),
    });
  }
  return limiter;
}
