// Copyright (c) 2026 AI anime
export function directorSourceIdentityUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const withoutHash = trimmed.split("#", 1)[0] ?? "";
  return withoutHash.split("?", 1)[0] ?? "";
}
