// Copyright (c) 2026 AI anime
export type VideoSubtitleEraseMode = "smart" | "box";

export interface VideoSubtitleEraseBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
