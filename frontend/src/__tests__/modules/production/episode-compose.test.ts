// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  episodeResolutionFor,
  episodeResolutionLabel,
  episodeResolutionOptions,
  episodeResolutionTier,
  formatEpisodeDuration,
  resolveEpisodeResolution,
} from "@/modules/production/domain/episode-compose";

describe("episode compose domain", () => {
  it("derives orientation-specific resolution choices", () => {
    expect(episodeResolutionOptions("portrait")).toEqual([
      "720x1280",
      "1080x1920",
    ]);
    expect(episodeResolutionOptions("landscape")).toEqual([
      "1280x720",
      "1920x1080",
    ]);
    expect(episodeResolutionFor("1080", "landscape")).toBe("1920x1080");
    expect(episodeResolutionOptions()).toEqual([
      "720x1280", "1080x1920", "1280x720", "1920x1080",
    ]);
  });

  it("normalizes saved resolution tiers and labels", () => {
    expect(episodeResolutionTier("1920x1080")).toBe("1080");
    expect(episodeResolutionTier("invalid")).toBe("720");
    expect(episodeResolutionLabel("1080x1920")).toBe("1080p · 9:16 (1080×1920)");
    expect(episodeResolutionLabel("1280x720")).toBe("720p · 16:9 (1280×720)");
    expect(resolveEpisodeResolution("1080x1920", "landscape")).toBe("1080x1920");
    expect(resolveEpisodeResolution("1080p", "landscape")).toBe("1920x1080");
    expect(resolveEpisodeResolution(undefined, "portrait")).toBe("720x1280");
  });

  it("formats positive durations and hides empty durations", () => {
    expect(formatEpisodeDuration(0)).toBeNull();
    expect(formatEpisodeDuration(65.4)).toBe("1:05");
  });
});
