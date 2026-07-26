// Copyright (c) 2026 AI anime
export interface AudioReferenceDisplaySource {
  readonly displayName?: string | null;
  readonly audioUrl: string;
}

export function resolveAudioReferenceDisplayName(
  source: AudioReferenceDisplaySource,
  baseUrl: string,
): string | null {
  const displayName = source.displayName?.trim();
  if (displayName) return displayName;

  try {
    const pathname = new URL(source.audioUrl, baseUrl).pathname;
    const fileName = decodeURIComponent(
      pathname.split("/").filter(Boolean).pop() ?? "",
    );
    return fileName || null;
  } catch {
    return null;
  }
}
