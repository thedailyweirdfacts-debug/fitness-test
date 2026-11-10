import { mealAnalysisSchema, type MealAnalysis } from "../../../shared/src";

export type HealthReport = {
  ok: boolean;
  provider: string;
  model: string;
  configured: boolean;
};

export class AnalyzeError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "not_configured" | "no_food" | "bad_response" | "server",
  ) {
    super(message);
    this.name = "AnalyzeError";
  }
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

export type ScanResult = {
  analysis: MealAnalysis;
  scansRemaining: number | null;
};

export type QuotaReport = {
  limit: number;
  used: number;
  remaining: number;
};

export async function analyzeImage(
  baseUrl: string,
  image: { imageBase64: string; mimeType: string },
  appSecret: string,
  accessToken: string,
): Promise<ScanResult> {
  if (!baseUrl.trim()) {
    throw new AnalyzeError("Add the server address in Settings, or turn demo mode back on.", "network");
  }
  if (!accessToken) {
    throw new AnalyzeError("Sign in again, then retry the photo.", "server");
  }

  let response: Response;
  try {
    response = await fetch(endpoint(baseUrl, "/api/analyze"), {
      method: "POST",
      headers: authHeaders(appSecret, accessToken, true),
      body: JSON.stringify(image),
    });
  } catch {
    throw new AnalyzeError(
      "Couldn't reach the server. Check the address in Settings, or turn demo mode back on.",
      "network",
    );
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const message =
      payload && typeof payload.message === "string"
        ? payload.message
        : "The server couldn't estimate this meal.";
    if (response.status === 503) throw new AnalyzeError(message, "not_configured");
    if (response.status === 422) throw new AnalyzeError(message, "no_food");
    throw new AnalyzeError(message, "server");
  }

  const parsed = mealAnalysisSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AnalyzeError("The estimate didn't match the expected format.", "bad_response");
  }
  return { analysis: parsed.data, scansRemaining: scansRemaining(response) };
}

export async function fetchQuota(baseUrl: string, accessToken: string, appSecret: string): Promise<QuotaReport> {
  if (!baseUrl.trim() || !accessToken) {
    throw new AnalyzeError("Sign in again, then retry the photo.", "server");
  }
  let response: Response;
  try {
    response = await fetch(endpoint(baseUrl, "/api/quota"), { headers: authHeaders(appSecret, accessToken, false) });
  } catch {
    throw new AnalyzeError("Couldn't reach the server.", "network");
  }
  const payload = await readJson(response);
  if (
    !response.ok ||
    !payload ||
    typeof payload.limit !== "number" ||
    typeof payload.used !== "number" ||
    typeof payload.remaining !== "number"
  ) {
    throw new AnalyzeError("Couldn't read how many scans are left.", "server");
  }
  return { limit: payload.limit, used: payload.used, remaining: payload.remaining };
}

function authHeaders(appSecret: string, accessToken: string, json: boolean): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (json) headers["Content-Type"] = "application/json";
  if (appSecret.trim()) headers["x-plateful-secret"] = appSecret.trim();
  return headers;
}

function scansRemaining(response: Response): number | null {
  const raw = response.headers.get("x-scans-remaining");
  if (raw == null || raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function checkHealth(baseUrl: string): Promise<HealthReport> {
  if (!baseUrl.trim()) {
    throw new AnalyzeError("Enter the server address first.", "network");
  }
  let response: Response;
  try {
    response = await fetch(endpoint(baseUrl, "/api/health"));
  } catch {
    throw new AnalyzeError("Couldn't reach that address. Is the server running, and is the phone on the same Wi-Fi?", "network");
  }
  const payload = await readJson(response);
  if (
    !payload ||
    payload.ok !== true ||
    typeof payload.provider !== "string" ||
    typeof payload.model !== "string" ||
    typeof payload.configured !== "boolean"
  ) {
    throw new AnalyzeError("That address responded, but it doesn't look like the Plateful server.", "bad_response");
  }
  return {
    ok: true,
    provider: payload.provider,
    model: payload.model,
    configured: payload.configured,
  };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const json = await response.json();
    return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
