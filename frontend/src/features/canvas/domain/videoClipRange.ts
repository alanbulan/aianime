// Copyright (c) 2026 AI anime
export const VIDEO_CLIP_MIN_DURATION_MS = 200;

export interface ResolvedVideoClipRange {
  readonly totalMs: number | null;
  readonly startMs: number;
  readonly endMs: number;
  readonly selectionMs: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveVideoClipRange(input: {
  readonly durationMs: number | null | undefined;
  readonly startMs: number | null | undefined;
  readonly endMs: number | null | undefined;
}): ResolvedVideoClipRange {
  const totalMs =
    typeof input.durationMs === "number" && input.durationMs > 0
      ? input.durationMs
      : null;
  const startMs =
    typeof input.startMs === "number"
      ? clamp(input.startMs, 0, totalMs ?? input.startMs)
      : 0;
  const endMs =
    typeof input.endMs === "number"
      ? clamp(input.endMs, 0, totalMs ?? input.endMs)
      : (totalMs ?? 0);
  return {
    totalMs,
    startMs,
    endMs,
    selectionMs: Math.max(0, endMs - startMs),
  };
}

export function constrainVideoClipStartMs(
  nextStartMs: number,
  endMs: number,
): number {
  return clamp(
    nextStartMs,
    0,
    Math.max(0, endMs - VIDEO_CLIP_MIN_DURATION_MS),
  );
}

export function constrainVideoClipEndMs(
  nextEndMs: number,
  startMs: number,
  totalMs: number,
): number {
  return clamp(
    nextEndMs,
    startMs + VIDEO_CLIP_MIN_DURATION_MS,
    totalMs,
  );
}
