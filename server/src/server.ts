import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { quotaDayKey } from "../../shared/src/account.js";
import { bearerToken, type QuotaStore, type VerifiedUser } from "./accounts.js";
import { analyzeRequest, PHOTO_TOO_LARGE_MESSAGE } from "./analyze.js";
import { HttpError } from "./errors.js";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";
import { SECRET_HEADER, secretMatches } from "./secret.js";
import type { ProviderId, VisionProvider } from "./providers/types.js";

export const DEFAULT_BODY_LIMIT = 4_000_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": `Content-Type, Authorization, ${SECRET_HEADER}`,
  "Access-Control-Expose-Headers": "x-scans-remaining",
  "Access-Control-Max-Age": "86400",
};

export type ServerOptions = {
  provider: VisionProvider | null;
  providerId: ProviderId;
  model: string;
  appSecret?: string | null;
  bodyLimit?: number;
  rateLimiter?: RateLimiter;
  verifyUser?: (token: string) => Promise<VerifiedUser | null>;
  quota?: QuotaStore;
  dailyCap?: number;
};

export type RequestOutcome = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

export function createServer(options: ServerOptions): Server {
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const rateLimiter = options.rateLimiter ?? createRateLimiter();
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      const outcome = await handleRequest(options, rateLimiter, {
        method: req.method ?? "GET",
        pathname: url.pathname,
        header: (name) => {
          const value = req.headers[name.toLowerCase()];
          return Array.isArray(value) ? value[0] : value;
        },
        ip: clientIp(req),
        readBody: () => readJson(req, bodyLimit),
      });
      send(res, outcome.status, outcome.body, outcome.headers);
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, error.status, { error: error.code, message: error.message });
        return;
      }
      console.error("Unhandled server error");
      send(res, 500, { error: "server_error", message: "Something went wrong while estimating the meal." });
    }
  });
}

export async function handleRequest(
  options: ServerOptions,
  rateLimiter: RateLimiter,
  input: {
    method: string;
    pathname: string;
    header: (name: string) => string | undefined;
    ip: string;
    readBody: () => Promise<unknown>;
  },
): Promise<RequestOutcome> {
  if (input.method === "OPTIONS") {
    return { status: 204, body: null };
  }

  if (input.method === "GET" && input.pathname === "/api/health") {
    return {
      status: 200,
      body: {
        ok: true,
        provider: options.providerId,
        model: options.model,
        configured: options.provider !== null,
        protected: Boolean(options.appSecret),
        accounts: Boolean(options.verifyUser && options.quota),
      },
    };
  }

  if (input.pathname !== "/api/analyze" && input.pathname !== "/api/quota") {
    throw new HttpError(404, "not_found", "Nothing is mounted at that path.");
  }
  if (input.pathname === "/api/analyze" && input.method !== "POST") {
    throw new HttpError(405, "method_not_allowed", "Use POST to estimate a meal.");
  }
  if (input.pathname === "/api/quota" && input.method !== "GET") {
    throw new HttpError(405, "method_not_allowed", "Use GET to read today's scans.");
  }

  const body = input.pathname === "/api/analyze" ? await input.readBody() : null;
  const user = await requireUser(options, input.header);
  const day = quotaDayKey(new Date());
  const cap = options.dailyCap ?? 10;

  if (input.pathname === "/api/quota") {
    const status = await options.quota!.status(user.userId, day, cap);
    return { status: 200, body: status };
  }

  const decision = rateLimiter(input.ip || "unknown");
  if (!decision.ok) {
    return {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
      body: {
        error: "rate_limited",
        message: "Too many scans. Wait a bit and try again. The free Gemini plan only allows a handful of photos a day.",
      },
    };
  }

  let remaining: number;
  try {
    remaining = await options.quota!.consume(user.userId, day, cap);
  } catch {
    throw new HttpError(503, "quota_unavailable", "The scan counter could not be reached. Try again in a moment.");
  }
  if (remaining < 0) {
    return {
      status: 429,
      headers: { "x-scans-remaining": "0" },
      body: {
        error: "scan_cap",
        message: "No free scans left today. They reset overnight, Pacific time. Demo mode still works.",
      },
    };
  }

  try {
    const analysis = await analyzeRequest(body, options.provider);
    return {
      status: 200,
      body: analysis,
      headers: { "x-scans-remaining": String(remaining) },
    };
  } catch (error) {
    await options.quota!.release(user.userId, day).catch(() => undefined);
    throw error;
  }
}

async function requireUser(
  options: ServerOptions,
  header: (name: string) => string | undefined,
): Promise<VerifiedUser> {
  if (!options.verifyUser || !options.quota) {
    throw new HttpError(503, "accounts_not_configured", "Set the Supabase URL and keys on the server before it will estimate meals.");
  }
  const token = bearerToken(header("authorization"));
  const user = token ? await options.verifyUser(token) : null;
  if (!user) {
    throw new HttpError(401, "unauthorized", "Sign in again, then retry the photo.");
  }
  const secret = options.appSecret?.trim() ?? "";
  if (secret && !secretMatches(header(SECRET_HEADER) ?? "", secret)) {
    throw new HttpError(401, "unauthorized", "The app secret did not match. Check Settings and the server's APP_SECRET.");
  }
  return user;
}

export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "unknown";
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) {
      throw new HttpError(413, "payload_too_large", PHOTO_TOO_LARGE_MESSAGE);
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
}

function send(res: ServerResponse, status: number, body: unknown, extra?: Record<string, string>): void {
  if (status === 204) {
    res.writeHead(204, { ...CORS_HEADERS, ...extra });
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    ...extra,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}
