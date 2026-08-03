// Copyright (c) 2026 AI anime
export function parseAspectRatio(value: string): number {
  const [width, height] = value.split(':').map((item) => Number(item));
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return 1;
  }
  return width / height;
}
