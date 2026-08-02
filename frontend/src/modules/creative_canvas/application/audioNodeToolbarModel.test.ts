// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  projectAudioNodeToolbar,
  resolveAudioNodeDownloadFilename,
  type AudioNodeToolbarSource,
} from "./audioNodeToolbarModel";

function data(
  patch: Partial<AudioNodeToolbarSource> = {},
): AudioNodeToolbarSource {
  return { audioUrl: "/source.m4a", ...patch };
}

describe("audioNodeToolbarModel", () => {
  it("projects media availability and restores the active conversion", () => {
    expect(
      projectAudioNodeToolbar(
        "audio-a",
        data({
          sourceFileName: " episode.final.M4A ",
          convertingAudioFormat: "wav",
        }),
      ),
    ).toEqual({
      audioUrl: "/source.m4a",
      hasAudio: true,
      baseFilename: "episode.final",
      convertingFormat: "wav",
      isConverting: true,
    });
  });

  it("uses a trimmed display name for extensionless separated audio", () => {
    expect(
      projectAudioNodeToolbar(
        "audio-b",
        data({ sourceFileName: " ", displayName: " episode_背景音 " }),
      ).baseFilename,
    ).toBe("episode_背景音");
  });

  it("falls back to the node id when no usable name or media exists", () => {
    expect(
      projectAudioNodeToolbar(
        "audio-c",
        data({
          audioUrl: null,
          sourceFileName: null,
          displayName: "",
          convertingAudioFormat: null,
        }),
      ),
    ).toEqual({
      audioUrl: null,
      hasAudio: false,
      baseFilename: "audio-audio-c",
      convertingFormat: null,
      isConverting: false,
    });
  });

  it("appends the selected target format", () => {
    expect(resolveAudioNodeDownloadFilename("episode_背景音", "mp3")).toBe(
      "episode_背景音.mp3",
    );
  });
});
