// Copyright (c) 2026 AI anime
import {
  deleteFreezoneVideoCharacterLibraryItem,
  fetchFreezoneVideoCharacterLibrary,
  submitFreezoneAddVideoCharacterLibraryItem,
  syncFreezoneAssetLibraryFromMainline,
} from "@/api/ops";

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
    return normalizeItems(await fetchFreezoneVideoCharacterLibrary(projectId));
  },
  async syncFromMainline(projectId) {
    return normalizeItems(await syncFreezoneAssetLibraryFromMainline(projectId));
  },
  async addUploadedItem(projectId, command) {
    await submitFreezoneAddVideoCharacterLibraryItem(projectId, {
      name: command.name,
      media: command.media,
      imageUrls: command.media === "image" ? [command.url] : undefined,
      videoUrl: command.media === "video" ? command.url : undefined,
      audioUrl: command.media === "audio" ? command.url : undefined,
    });
  },
  async deleteItem(projectId, itemId) {
    await deleteFreezoneVideoCharacterLibraryItem(projectId, itemId);
  },
};
