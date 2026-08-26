// Copyright (c) 2026 AI anime
import type { PoolImage } from "@/modules/production/public";

interface ResolvedImage {
  url: string | null;
  poolImage: PoolImage | null;
}

export function resolveImage(
  _images: PoolImage[],
  _assignments: Record<string, string>,
  _beatNum: number,
  _imageType: "sketch" | "render",
  currentUrl: string | null,
): ResolvedImage {
  if (currentUrl) return { url: currentUrl, poolImage: null };
  return { url: null, poolImage: null };
}
