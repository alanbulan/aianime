// Copyright (c) 2026 AI anime
export interface VideoFrameStripFrame {
  readonly timeMs: number;
  readonly url: string;
}

export interface VideoFrameStripCaptureOptions {
  readonly count: number | ((durationSeconds: number) => number);
  readonly targetWidth: number;
}

export type CaptureVideoFrameStrip = (
  source: string,
  options: VideoFrameStripCaptureOptions,
) => Promise<VideoFrameStripFrame[]>;
