// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { resolveCanvasAudioSeparationOutputs } from "./audioSeparationResult";

describe("resolveCanvasAudioSeparationOutputs", () => {
  it("prefers canonical backend URL fields", () => {
    expect(
      resolveCanvasAudioSeparationOutputs({
        audio_url: "/static/projects/project-1/audio.m4a",
        audio_path: "/data/output/alice/demo/audio.m4a",
        mute_video_url: "https://cdn.example.test/mute.mp4",
        mute_video_path: "/data/output/alice/demo/mute.mp4",
      }),
    ).toEqual({
      audioUrl: "/static/projects/project-1/audio.m4a",
      silentVideoUrl: "https://cdn.example.test/mute.mp4",
    });
  });

  it("finds nested artifacts and only rewrites a raw output path as fallback", () => {
    expect(
      resolveCanvasAudioSeparationOutputs({
        artifacts: [
          { audio_path: "/data/output/alice/demo/audio.m4a" },
          { mute: "/static/projects/project-1/mute.mp4" },
        ],
      }),
    ).toEqual({
      audioUrl: "/static/alice/demo/audio.m4a",
      silentVideoUrl: "/static/projects/project-1/mute.mp4",
    });
  });

  it("returns empty outputs when no media artifact exists", () => {
    expect(resolveCanvasAudioSeparationOutputs(null)).toEqual({
      audioUrl: null,
      silentVideoUrl: null,
    });
    expect(
      resolveCanvasAudioSeparationOutputs({ status: "completed" }),
    ).toEqual({
      audioUrl: null,
      silentVideoUrl: null,
    });
  });
});
