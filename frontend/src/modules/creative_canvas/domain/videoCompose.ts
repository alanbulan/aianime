// Copyright (c) 2026 AI anime
export type CanvasVideoComposeResolution = "720p" | "1080p";
export type CanvasVideoComposeTrackKind = "video" | "audio";

export interface CanvasVideoComposeItem {
  readonly itemId: string;
  readonly sourceUrl: string;
  readonly timelineStart?: number;
  readonly sourceStart?: number;
  readonly sourceEnd: number;
  readonly volume?: number;
  readonly muted?: boolean;
  readonly speed?: number;
}

export interface CanvasVideoComposeTrack {
  readonly trackId: string;
  readonly kind: CanvasVideoComposeTrackKind;
  readonly items: readonly CanvasVideoComposeItem[];
}

export interface CanvasVideoComposeRequest {
  readonly title?: string;
  readonly canvasId?: string;
  readonly resolution?: CanvasVideoComposeResolution;
  readonly fps?: number;
  readonly backgroundColor?: string;
  readonly keepOriginalAudio?: boolean;
  readonly tracks: readonly CanvasVideoComposeTrack[];
}
