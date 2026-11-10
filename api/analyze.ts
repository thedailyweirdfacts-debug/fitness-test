import { PHOTO_TOO_LARGE_MESSAGE } from "../server/src/analyze.js";
import { HttpError } from "../server/src/errors.js";
import { createRateLimiter } from "../server/src/rate-limit.js";
import { runtimeOptions } from "../server/src/runtime.js";
import { DEFAULT_BODY_LIMIT, handleRequest, type RequestOutcome } from "../server/src/server.js";

export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-plateful-secret",
  "Access-Control-Expose-Headers": "x-scans-remaining",
  "Cache-Control": "no-store",
};

/** Node's IncomingMessage, plus the helpers Vercel adds. `url` is a path such as `/api/health`. */
type NodeRequest = {
  url?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array | string>;
};

type NodeResponse = {
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
  writeHead?: (status: number, headers?: Record<string, string>) => void;
  end: (body?: string) => void;
};

/**
 * Vercel invokes a default-exported Node function as `(req, res)`.
 * `req.url` is only the path. A Web `Request` (absolute URL, no `res`) still works for tests.
 */
export default async function handler(request: Request | NodeRequest, response?: NodeResponse): Promise<Response | void> {
  const outcome = await dispatch(request);
  if (response && typeof response.end === "function") {
    sendNode(response, outcome);
    return;
  }
  return toWeb(outcome);
}

async function dispatch(request: Request | NodeRequest): Promise<RequestOutcome> {
  const options = runtimeOptions();
  try {
    const url = requestUrl(request);
    return await handleRequest(options, options.rateLimiter ?? createRateLimiter(), {
      method: request.method ?? "GET",
      pathname: url.pathname,
      header: (name) => headerValue(request, name),
      ip: headerValue(request, "x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      query: url.searchParams,
      readBody: () => parseIncomingBody(request, options.bodyLimit ?? DEFAULT_BODY_LIMIT),
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return { status: error.status, body: { error: error.code, message: error.message } };
    }
    console.error("Unhandled server error");
    return { status: 500, body: { error: "server_error", message: "Something went wrong while estimating the meal." } };
  }
}

/** Absolute Web URLs ignore the base. Path-only Node URLs need it. */
export function requestUrl(request: Request | NodeRequest): URL {
  const raw = request.url || "/";
  const host = headerValue(request, "x-forwarded-host") ?? headerValue(request, "host") ?? "localhost";
  const proto = headerValue(request, "x-forwarded-proto") ?? "https";
  return new URL(raw, `${proto}://${firstHeader(host)}`);
}

function isWebRequest(request: Request | NodeRequest): request is Request {
  if (typeof Request !== "undefined" && request instanceof Request) return true;
  const headers = (request as Request).headers;
  return typeof headers?.get === "function" && typeof (request as Request).arrayBuffer === "function";
}

function headerValue(request: Request | NodeRequest, name: string): string | undefined {
  if (isWebRequest(request)) return request.headers.get(name) ?? undefined;
  const value = request.headers?.[name.toLowerCase()];
  return firstHeader(value);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

/**
 * Vercel parses JSON into `req.body` and consumes the stream. Use that value
 * when it is an object, a string, or a Buffer. Read the stream only when
 * `body` is undefined.
 */
export async function parseIncomingBody(request: Request | NodeRequest, limit: number): Promise<unknown> {
  if (!isWebRequest(request) && request.body !== undefined) {
    return decodePresentBody(request.body, limit);
  }
  if (isWebRequest(request)) return readWebBody(request, limit);
  return readNodeStream(request, limit);
}

function decodePresentBody(body: unknown, limit: number): unknown {
  if (typeof body === "string") return parseJson(body, limit);
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    return parseJson(Buffer.from(body).toString("utf8"), limit);
  }
  const size = jsonSize(body);
  if (size > limit) throw new HttpError(413, "payload_too_large", PHOTO_TOO_LARGE_MESSAGE);
  return body;
}

function jsonSize(body: unknown): number {
  if (body === null || typeof body !== "object") return 0;
  try {
    return Buffer.byteLength(JSON.stringify(body));
  } catch {
    return 0;
  }
}

async function readNodeStream(request: NodeRequest, limit: number): Promise<unknown> {
  if (typeof request[Symbol.asyncIterator] !== "function") {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Uint8Array | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new HttpError(413, "payload_too_large", PHOTO_TOO_LARGE_MESSAGE);
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  return parseJson(Buffer.concat(chunks).toString("utf8"), limit);
}

async function readWebBody(request: Request, limit: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, "payload_too_large", PHOTO_TOO_LARGE_MESSAGE);
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.length > limit) {
    throw new HttpError(413, "payload_too_large", PHOTO_TOO_LARGE_MESSAGE);
  }
  if (buffer.length === 0) throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  return parseJson(buffer.toString("utf8"), limit);
}

function parseJson(text: string, limit: number): unknown {
  if (Buffer.byteLength(text) > limit) {
    throw new HttpError(413, "payload_too_large", PHOTO_TOO_LARGE_MESSAGE);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be JSON.");
  }
}

function toWeb(outcome: RequestOutcome): Response {
  if (outcome.status === 204) {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...outcome.headers } });
  }
  return Response.json(outcome.body, {
    status: outcome.status,
    headers: { ...CORS_HEADERS, ...outcome.headers },
  });
}

function sendNode(response: NodeResponse, outcome: RequestOutcome): void {
  const headers = { ...CORS_HEADERS, ...outcome.headers };
  if (outcome.status === 204) {
    response.writeHead?.(204, headers);
    response.end();
    return;
  }
  const payload = JSON.stringify(outcome.body);
  response.writeHead?.(outcome.status, {
    ...headers,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(payload)),
  });
  response.statusCode = outcome.status;
  response.end(payload);
}
