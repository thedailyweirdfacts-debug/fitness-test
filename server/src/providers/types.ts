export type VisionImage = {
  imageBase64: string;
  mimeType: string;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VisionProvider {
  id: "openai" | "anthropic";
  model: string;
  analyze(image: VisionImage): Promise<unknown>;
}

export type ProviderId = VisionProvider["id"];

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-5.4-mini",
  anthropic: "claude-haiku-5-5",
};
