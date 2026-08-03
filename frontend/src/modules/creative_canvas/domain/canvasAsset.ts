// Copyright (c) 2026 AI anime
export type CanvasAssetKind = 'image' | 'video' | 'audio' | 'model';

export interface CanvasAsset {
  /** Stable key, unique per (node, media URL). */
  id: string;
  kind: CanvasAssetKind;
  /** Resolved, render-safe media URL. */
  url: string;
  /** Poster or thumbnail for video and audio cards. */
  previewUrl: string | null;
  nodeId: string;
  /** Display name from the source node. */
  label: string | null;
  /** Prompt captured by generation history; absent for live Canvas assets. */
  prompt?: string | null;
  /** Original model registry ID used to restore historical generation state. */
  model?: string | null;
  /** Original generation mode used to restore historical generation state. */
  genMode?: string | null;
  /** Best-effort creation time in milliseconds since epoch. */
  timestamp: number | null;
}

export interface CanvasAssetBuckets {
  image: CanvasAsset[];
  video: CanvasAsset[];
  audio: CanvasAsset[];
  model: CanvasAsset[];
}

export interface CanvasAssetDateGroup {
  /** `YYYY-MM-DD`, or null when no usable timestamp exists. */
  date: string | null;
  assets: CanvasAsset[];
}

export type CanvasMediaUrlResolver = (
  rawUrl: string | null | undefined,
) => string | null;
