// Copyright (c) 2026 AI anime
export function resolveMaxAllowedLineThickness(
  imageWidth: number,
  imageHeight: number,
  rows: number,
  cols: number,
): number {
  const maxLineByWidth =
    cols > 1
      ? Math.floor((imageWidth - cols) / (cols - 1))
      : Number.MAX_SAFE_INTEGER;
  const maxLineByHeight =
    rows > 1
      ? Math.floor((imageHeight - rows) / (rows - 1))
      : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(maxLineByWidth, maxLineByHeight));
}

export function splitIntoSegments(
  totalSize: number,
  segmentCount: number,
): number[] {
  const baseSize = Math.floor(totalSize / segmentCount);
  const remainder = totalSize % segmentCount;

  return Array.from(
    { length: segmentCount },
    (_item, index) => baseSize + (index < remainder ? 1 : 0),
  );
}
