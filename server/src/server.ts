import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { analyzeRequest } from "./analyze";
import { HttpError } from "./errors";
import type { ProviderId, VisionProvider } from "./providers/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export type ServerOptions = {
  provider: VisionProvider | null;
  providerId: ProviderId;
  model: string;
  bodyLimit?: number;
};

export function createServer(options: ServerOptions): Server {
  const bodyLimit = options.bodyLimit ?? 7_500_000;
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        send(res, 200, {
          ok: true,
          provider: options.providerId,
          model: options.model,
          configured: options.provider !== null,
        });
        return;
      }

      if (url.pathname === "/api/analyze") {
        if (req.method !== "POST") {
          throw new HttpError(405, "method_not_allowed", "Use POST to estimate a meal.");
        }
        const body = await readJson(req, bodyLimit);
        const analysis = await analyzeRequest(body, options.provider);
        send(res, 200, analysis);
        return;
      }

      throw new HttpError(404, "not_found", "Nothing is mounted at that path.");
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

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) {
      throw new HttpError(413, "payload_too_large", "That photo is too large. Try again after it has been resized.");
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

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}
