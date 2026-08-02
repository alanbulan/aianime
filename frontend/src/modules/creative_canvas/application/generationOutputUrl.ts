// Copyright (c) 2026 AI anime
export type GenerationOutputMedia = "image" | "video" | "audio";

const OUTPUT_URL_KEYS: Record<GenerationOutputMedia, readonly string[]> = {
  image: ["output_url", "image_url", "url"],
  video: ["video_url", "output_url", "url"],
  audio: ["audio_url", "output_url", "url"],
};

export function resolveGenerationOutputUrl(
  result: unknown,
  media: GenerationOutputMedia,
): string | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }

  for (const key of OUTPUT_URL_KEYS[media]) {
    const value = Reflect.get(result, key);
    if (typeof value === "string" && value.length > 0) return value;
  }

  return null;
}
