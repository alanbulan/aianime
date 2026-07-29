// Copyright (c) 2026 AI anime
export function personalCanvasIdForUsername(username: string): string {
  const trimmed = username.trim();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36) || "u";
  const hash = stableCanvasIdHash(trimmed || "user");
  return `user_${slug}_${hash}`.slice(0, 64).replace(/_+$/g, "");
}

export function canvasIdForFreezoneEntry({
  explicitCanvasId,
  username,
}: {
  explicitCanvasId: string | null | undefined;
  username: string | null | undefined;
}): string {
  const explicit = explicitCanvasId?.trim();
  if (explicit) return explicit;
  return personalCanvasIdForUsername(username?.trim() || "user");
}

function stableCanvasIdHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
