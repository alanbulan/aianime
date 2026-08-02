// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasAssetLibraryGateway } from "../application/assetLibrary";
import type {
  CanvasAssetLibraryItem,
  CanvasAssetLibraryMedia,
  CanvasAssetLibrarySource,
} from "../domain/assetLibrary";

function payloadItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  for (const key of ["items", "data", "characters", "list", "records"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function itemUrl(
  media: CanvasAssetLibraryMedia,
  item: Record<string, unknown>,
): string {
  if (media === "video") {
    return typeof item.video_url === "string" ? item.video_url : "";
  }
  if (media === "audio") {
    return typeof item.audio_url === "string" ? item.audio_url : "";
  }

  const urls = item.image_urls ?? item.imageUrls ?? item.images;
  if (Array.isArray(urls)) {
    const first = urls.find((url): url is string => typeof url === "string");
    if (first) return first;
  }
  return typeof item.cover_url === "string" ? item.cover_url : "";
}

function mapItem(value: unknown): CanvasAssetLibraryItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const idValue = item.id ?? item.item_id ?? item.itemId ?? null;
  const id =
    typeof idValue === "string"
      ? idValue
      : idValue != null
        ? String(idValue)
        : null;
  const mediaValue = typeof item.media === "string" ? item.media : "image";
  const media: CanvasAssetLibraryMedia =
    mediaValue === "video" || mediaValue === "audio" ? mediaValue : "image";
  const sourceValue = typeof item.source === "string" ? item.source : "upload";
  const source: CanvasAssetLibrarySource =
    sourceValue === "character" ||
    sourceValue === "scene" ||
    sourceValue === "prop"
      ? sourceValue
      : "upload";
  const url = itemUrl(media, item);
  if (!url) return null;

  return {
    id,
    name: typeof item.name === "string" ? item.name : "",
    media,
    source,
    url,
  };
}

function normalizeItems(payload: unknown): CanvasAssetLibraryItem[] {
  return payloadItems(payload)
    .map(mapItem)
    .filter((item): item is CanvasAssetLibraryItem => item !== null);
}

export const freezoneAssetLibraryGateway: CanvasAssetLibraryGateway = {
  async list(projectId) {
    return normalizeItems(
      await apiCall<unknown>(
        `projects/${encodeURIComponent(projectId)}/freezone/video/character-library`,
      ),
    );
  },
  async syncFromMainline(projectId) {
    return normalizeItems(
      await apiCall<unknown>(
        `projects/${encodeURIComponent(projectId)}/freezone/video/asset-library/sync-from-mainline`,
        { method: "POST" },
      ),
    );
  },
  async addUploadedItem(projectId, command) {
    await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/video/character-library`,
      {
        method: "POST",
        json: {
          name: command.name,
          media: command.media,
          ...(command.media === "image"
            ? { image_urls: [command.url] }
            : {}),
          ...(command.media === "video"
            ? { video_url: command.url }
            : {}),
          ...(command.media === "audio"
            ? { audio_url: command.url }
            : {}),
        },
      },
    );
  },
  async deleteItem(projectId, itemId) {
    await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/video/character-library/${encodeURIComponent(itemId)}`,
      { method: "DELETE" },
    );
  },
};
