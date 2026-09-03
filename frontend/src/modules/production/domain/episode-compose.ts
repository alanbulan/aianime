// Copyright (c) 2026 AI anime

export interface ComposeEpisodeCommand {
  addSubtitles?: boolean;
  addBgm?: boolean;
  resolution?: string;
}

export interface FinalVideoData {
  exists: boolean;
  filename: string;
  video_url?: string;
}

export type EpisodeExportKind = "video" | "srt" | "zip";
export type EpisodeOrientation = "portrait" | "landscape";
export type EpisodeResolution =
  | "720x1280"
  | "1080x1920"
  | "1280x720"
  | "1920x1080";
export type EpisodeResolutionTier = "720" | "1080";

export function formatEpisodeDuration(totalSeconds: number): string | null {
  if (!totalSeconds || totalSeconds <= 0) return null;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function episodeResolutionTier(
  value: string | null | undefined,
): EpisodeResolutionTier {
  return value === "1080x1920" || value === "1920x1080" || value === "1080p"
    ? "1080"
    : "720";
}

export function episodeResolutionFor(
  tier: EpisodeResolutionTier,
  orientation: EpisodeOrientation,
): EpisodeResolution {
  if (orientation === "landscape") {
    return tier === "1080" ? "1920x1080" : "1280x720";
  }
  return tier === "1080" ? "1080x1920" : "720x1280";
}

export function episodeResolutionLabel(
  resolution: EpisodeResolution,
): string {
  const [width, height] = resolution.split("x").map(Number);
  const ratio = width < height ? "9:16" : "16:9";
  return `${episodeResolutionTier(resolution)}p · ${ratio} (${resolution.replace("x", "×")})`;
}

export function episodeResolutionOptions(
  orientation?: EpisodeOrientation,
): EpisodeResolution[] {
  if (!orientation) {
    return [
      ...episodeResolutionOptions("portrait"),
      ...episodeResolutionOptions("landscape"),
    ];
  }
  return [
    episodeResolutionFor("720", orientation),
    episodeResolutionFor("1080", orientation),
  ];
}

export function resolveEpisodeResolution(
  value: string | null | undefined,
  fallbackOrientation: EpisodeOrientation,
): EpisodeResolution {
  return episodeResolutionOptions().find((resolution) => resolution === value)
    ?? episodeResolutionFor(episodeResolutionTier(value), fallbackOrientation);
}
