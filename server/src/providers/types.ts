export type VisionImage = {
  imageBase64: string;
  mimeType: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type RecipeVisionImage = {
  imageBase64: string;
  mimeType: string;
  role: "ingredient" | "dish";
};

export type RecipeVisionRequest = {
  lines: string[];
  images: RecipeVisionImage[];
};

export interface VisionProvider {
  id: "gemini" | "openai" | "anthropic";
  model: string;
  analyze(image: VisionImage): Promise<unknown>;
  analyzeText?(text: string): Promise<unknown>;
  /** One call for every ingredient photo and the optional finished dish. */
  analyzeRecipe?(request: RecipeVisionRequest): Promise<unknown>;
}

export type ProviderId = VisionProvider["id"];

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-5.4-mini",
  anthropic: "claude-haiku-5-5",
};
