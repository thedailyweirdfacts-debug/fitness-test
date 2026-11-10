import { HttpError } from "../server/src/errors.js";
import { createRateLimiter } from "../server/src/rate-limit.js";
import { runtimeOptions } from "../server/src/runtime.js";
import { DEFAULT_BODY_LIMIT, handleRequest } from "../server/src/server.js";

export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-plateful-secret",
  "Access-Control-Expose-Headers": "x-scans-remaining",
  "Cache-Control": "no-store",
};

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const options = runtimeOptions();
  try {
    const outcome = await handleRequest(options, options.rateLimiter ?? createRateLimiter(), {
      method: request.method,
      pathname: url.pathname,
      header: (name) => request.headers.get(name) ?? undefined,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      readBody: () => readJson(request, DEFAULT_BODY_LIMIT),
    });
    if (outcome.status === 204) {
      return new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...outcome.headers } });
    }
    return Response.json(outcome.body, {
      status: outcome.status,
      headers: { ...CORS_HEADERS, ...outcome.headers },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: CORS_HEADERS });
    }
    console.error("Unhandled server error");
    return Response.json(
      { error: "server_error", message: "Something went wrong while estimating the meal." },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

async function readJson(request: Request, limit: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, "payload_too_large", "That photo is too large. Try again after it has been resized.");
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > limit) {
    throw new HttpError(413, "payload_too_large", "That photo is too large. Try again after it has been resized.");
  }
  if (buffer.length === 0) {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
}
