// Copyright (c) 2026 AI anime

const STATIC_PREFIX_RE = /^(\/static\/[^/]+\/[^/]+\/)/;

function pad(value: number, width: number): string {
  const text = String(value);
  return text.length >= width
    ? text
    : "0".repeat(width - text.length) + text;
}

export function staticPrefixOf(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const match = STATIC_PREFIX_RE.exec(url);
  return match ? match[1] : null;
}

export function deriveSketchUrl(
  anchorUrl: string | null | undefined,
  episode: number,
  beatNum: number,
): string | null {
  const prefix = staticPrefixOf(anchorUrl);
  if (!prefix) return null;
  return `${prefix}sketches/ep${pad(episode, 3)}/beat_${pad(beatNum, 2)}.png`;
}

export function deriveDirectorRenderUrl(
  anchorUrl: string | null | undefined,
  episode: number,
  beatNum: number,
): string | null {
  const prefix = staticPrefixOf(anchorUrl);
  if (!prefix) return null;
  return `${prefix}director_control_frames/ep${pad(episode, 3)}/beat_${pad(beatNum, 2)}/combined.png`;
}
