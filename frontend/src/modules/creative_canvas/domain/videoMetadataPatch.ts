// Copyright (c) 2026 AI anime

export interface VideoMetadataFields {
  widthPx?: number | null;
  heightPx?: number | null;
  durationMs?: number | null;
}

export interface LoadedVideoMetadata {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly durationMs: number;
}

export function buildVideoMetadataPatch(
  current: VideoMetadataFields,
  loaded: LoadedVideoMetadata,
): Partial<VideoMetadataFields> {
  if (!loaded.widthPx || !loaded.heightPx) return {};

  const patch: Partial<VideoMetadataFields> = {};
  if (current.widthPx !== loaded.widthPx) {
    patch.widthPx = loaded.widthPx;
  }
  if (current.heightPx !== loaded.heightPx) {
    patch.heightPx = loaded.heightPx;
  }
  if (current.durationMs !== loaded.durationMs) {
    patch.durationMs = loaded.durationMs;
  }
  return patch;
}
