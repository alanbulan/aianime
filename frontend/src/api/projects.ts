// Copyright (c) 2026 AI anime

// ---------- Static URL helpers ---------- //

// AI anime serves user assets at `/static/<user>/<project>/...`. The backend
// embeds `<user>/<project>` in URLs it returns (frame_url, video_url, identity
// image_url, portrait_url). For assets the backend doesn't directly expose
// (sketch, director-render combined.png), we derive a URL by rewriting the
// path segment after the `/static/<u>/<p>/` prefix of an already-known asset.
// If no anchor URL is available (no frames yet), the asset can't be derived
// and ImportPanel skips it.
//
// F5 sprint may add a dedicated `/freezone/list-assets` endpoint, which would
// remove the need for these helpers.

function pad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

const STATIC_PREFIX_RE = /^(\/static\/[^/]+\/[^/]+\/)/;

export function staticPrefixOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = STATIC_PREFIX_RE.exec(url);
  return m ? m[1] : null;
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
