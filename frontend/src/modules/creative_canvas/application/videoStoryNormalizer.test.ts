// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { normalizeVideoStoryRows } from "./videoStoryNormalizer";

describe("normalizeVideoStoryRows", () => {
  it("normalizes the preferred video-story envelope and chronological keyframe", () => {
    const raw = { shot: 1, visual_description: "Opening", keyframes: [2] };

    expect(
      normalizeVideoStoryRows({
        frame_urls: ["/frames/scene_1041.png", "/frames/scene_423.png"],
        analyses: [{ shot: 9, visual_description: "Mirror" }],
        video_story: { shots: [raw] },
      }),
    ).toEqual([
      expect.objectContaining({
        shotNumber: 1,
        visualDescription: "Opening",
        keyframeUrl: "/frames/scene_1041.png",
        raw,
      }),
    ]);
  });

  it("supports legacy aliases and ignores non-object rows", () => {
    expect(
      normalizeVideoStoryRows({
        rows: [
          null,
          "invalid",
          {
            shot_number: "2",
            start_time: 1.5,
            narration: "Legacy",
            frame_url: "/frames/direct.png",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        shotNumber: 2,
        startTime: "1.5",
        narrative: "Legacy",
        keyframeUrl: "/frames/direct.png",
      }),
    ]);
  });

  it("returns an empty projection when the response has no row collection", () => {
    expect(normalizeVideoStoryRows({ status: "completed" })).toEqual([]);
    expect(normalizeVideoStoryRows(null)).toEqual([]);
  });
});
