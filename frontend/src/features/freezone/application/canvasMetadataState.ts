// Copyright (c) 2026 AI anime
let currentCanvasMetadata: Record<string, unknown> | null = null;

export function setFreezoneCanvasMetadata(metadata: Record<string, unknown> | null): void {
  currentCanvasMetadata = metadata;
}

export function getFreezoneCanvasMetadata(): Record<string, unknown> | null {
  return currentCanvasMetadata;
}
