// Copyright (c) 2026 AI anime
export const CANVAS_ASSET_LIBRARY_MEDIA = [
  "image",
  "video",
  "audio",
] as const;
export type CanvasAssetLibraryMedia =
  (typeof CANVAS_ASSET_LIBRARY_MEDIA)[number];

export const CANVAS_ASSET_LIBRARY_SOURCES = [
  "upload",
  "character",
  "scene",
  "prop",
] as const;
export type CanvasAssetLibrarySource =
  (typeof CANVAS_ASSET_LIBRARY_SOURCES)[number];

export interface CanvasAssetLibraryItem {
  readonly id: string | null;
  readonly name: string;
  readonly media: CanvasAssetLibraryMedia;
  readonly source: CanvasAssetLibrarySource;
  readonly url: string;
}

export interface CanvasAssetLibrarySelection {
  readonly media: CanvasAssetLibraryMedia;
  readonly url: string;
  readonly name: string;
}
