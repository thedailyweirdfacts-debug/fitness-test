import { createProvider, resolveVisionConfig } from "./config";
import { createRateLimiter, readLimit, type RateLimiter } from "./rate-limit";
import type { ServerOptions } from "./server";

let limiter: RateLimiter | null = null;

export function runtimeOptions(env: NodeJS.ProcessEnv = process.env): ServerOptions {
  const config = resolveVisionConfig(env);
  return {
    provider: createProvider(config),
    providerId: config.providerId,
    model: config.model,
    appSecret: env.APP_SECRET?.trim() || null,
    rateLimiter: sharedLimiter(env),
  };
}

function sharedLimiter(env: NodeJS.ProcessEnv): RateLimiter {
  if (!limiter) {
    limiter = createRateLimiter({
      perMinute: readLimit(env.RATE_LIMIT_PER_MINUTE, 5),
      perDay: readLimit(env.RATE_LIMIT_PER_DAY, 20),
    });
  }
  return limiter;
}
