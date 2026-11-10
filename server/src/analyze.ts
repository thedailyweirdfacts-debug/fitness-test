import { z } from "zod";
import { AnalysisError, finalizeAnalysis, type MealAnalysis } from "../../shared/src/index.js";
import { HttpError, ProviderError } from "./errors.js";
import type { VisionProvider } from "./providers/types.js";

const requestSchema = z.object({
  imageBase64: z.string().min(32).max(3_500_000),
  mimeType: z.string().min(1).max(40),
});

export const PHOTO_TOO_LARGE_MESSAGE =
  "That photo is too large to upload. Take it again so the app can shrink it, or choose a smaller picture.";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function analyzeRequest(body: unknown, provider: VisionProvider | null): Promise<MealAnalysis> {
  if (!provider) {
    throw new HttpError(503, "not_configured", "No vision API key is configured on the server.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const oversized = parsed.error.issues.some((issue) => issue.code === "too_big" && issue.path[0] === "imageBase64");
    if (oversized) {
      throw new HttpError(413, "payload_too_large", PHOTO_TOO_LARGE_MESSAGE);
    }
    throw new HttpError(400, "invalid_request", "Send a JSON body with imageBase64 and mimeType.");
  }

  const mimeType = parsed.data.mimeType === "image/jpg" ? "image/jpeg" : parsed.data.mimeType;
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new HttpError(400, "invalid_request", "The photo needs to be a jpeg, png, webp, or heic image.");
  }

  const imageBase64 = normalizeBase64(parsed.data.imageBase64);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw new HttpError(400, "invalid_request", "imageBase64 is not valid base64.");
  }

  try {
    const raw = await provider.analyze({ imageBase64, mimeType });
    return finalizeAnalysis(raw);
  } catch (error) {
    if (error instanceof AnalysisError) {
      const status = error.code === "no_food" ? 422 : 502;
      throw new HttpError(status, error.code, error.message);
    }
    if (error instanceof ProviderError) {
      if (error.status === 503) {
        throw new HttpError(503, "provider_busy", error.message);
      }
      throw new HttpError(502, "provider_error", error.message);
    }
    throw error;
  }
}

function normalizeBase64(value: string): string {
  const comma = value.indexOf(",");
  const payload = value.startsWith("data:") && comma !== -1 ? value.slice(comma + 1) : value;
  return payload.replace(/\s/g, "");
}
