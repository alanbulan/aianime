// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  buildSeparatedVideoNodeData,
  buildVideoAnalysisStoryNodeData,
  buildVideoUpscaleNodeData,
  projectVideoNodeToolbar,
  type VideoNodeToolbarData,
} from "./videoNodeToolbarModel";

function data(
  patch: Partial<VideoNodeToolbarData> = {},
): VideoNodeToolbarData {
  return {
    videoUrl: "/source.mp4",
    aspectRatio: "16:9",
    ...patch,
  };
}

describe("videoNodeToolbarModel", () => {
  it("projects media availability, activity, viewer title, and source filename", () => {
    expect(
      projectVideoNodeToolbar(
        "video-a",
        data({
          sourceFileName: " source.mov ",
          displayName: "Preview",
          isAnalyzing: true,
          isSeparatingAv: true,
        }),
      ),
    ).toEqual({
      videoUrl: "/source.mp4",
      hasVideo: true,
      isAnalyzing: true,
      isSeparatingAudioVideo: true,
      downloadFilename: " source.mov ",
      viewerTitle: "Preview",
    });
  });

  it("falls back from a blank source filename to display name and node id", () => {
    expect(
      projectVideoNodeToolbar(
        "video-b",
        data({ sourceFileName: " ", displayName: " Preview " }),
      ).downloadFilename,
    ).toBe(" Preview .mp4");
    expect(
      projectVideoNodeToolbar(
        "video-c",
        data({ videoUrl: null, sourceFileName: null, displayName: "" }),
      ),
    ).toMatchObject({
      videoUrl: null,
      hasVideo: false,
      downloadFilename: "video-video-c.mp4",
    });
  });

  it("builds the loading story node for immediate downstream feedback", () => {
    expect(
      buildVideoAnalysisStoryNodeData("/source.mp4", 1234),
    ).toEqual({
      sourceVideoUrl: "/source.mp4",
      rows: [],
      rawResult: null,
      isAnalyzing: true,
      analysisStartedAt: 1234,
      analysisError: null,
    });
  });

  it("builds the existing 1080p upscale node projection", () => {
    expect(
      buildVideoUpscaleNodeData(
        data({ previewImageUrl: "/poster.jpg", aspectRatio: "4:3" }),
        "/source.mp4",
        "视频高清（1080P）",
      ),
    ).toEqual({
      displayName: "视频高清（1080P）",
      videoUrl: null,
      previewImageUrl: "/poster.jpg",
      aspectRatio: "4:3",
      isUpscaleNode: true,
      upscaleSourceUrl: "/source.mp4",
      upscaleResolution: "1080p",
      upscaleDenoise: "1x",
      isGenerating: false,
    });
  });

  it("projects separated media titles from the source basename", () => {
    expect(
      buildSeparatedVideoNodeData(
        data({ sourceFileName: "episode.final.mp4" }),
        "/audio.m4a",
        "/silent.mp4",
      ),
    ).toEqual({
      audio: {
        audioUrl: "/audio.m4a",
        sourceFileName: "episode.final_背景音",
        displayName: "episode.final_背景音",
      },
      silentVideo: {
        videoUrl: "/silent.mp4",
        sourceFileName: "episode.final_无声.mp4",
        displayName: "episode.final_无声",
      },
    });
  });
});
