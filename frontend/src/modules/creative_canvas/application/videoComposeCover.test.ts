// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  AUDIO_TRACK_ID,
  VIDEO_TRACK_ID,
  type ComposeClip,
  type ComposeTimelineState,
} from "../domain/videoComposeTimeline";

import {
  coverFrameSourceAt,
  hasCoverableVideo,
} from "./videoComposeCover";

function clip(
  id: string,
  sourceUrl: string,
  patch: Partial<ComposeClip> = {},
): ComposeClip {
  return {
    id,
    nodeId: id,
    kind: "video",
    sourceUrl,
    displayName: null,
    thumbUrl: null,
    durationMs: 5000,
    timelineStartMs: 0,
    trimStartMs: 0,
    trimEndMs: 5000,
    volume: 1,
    muted: false,
    speed: 1,
    ...patch,
  };
}

describe("videoComposeCover", () => {
  it("projects the topmost active video frame into source time", () => {
    const timeline: ComposeTimelineState = {
      resolution: "1080p",
      tracks: [
        {
          id: VIDEO_TRACK_ID,
          kind: "video",
          clips: [clip("base", "/base.mp4")],
        },
        {
          id: "track_overlay",
          kind: "video",
          clips: [clip("overlay", "/overlay.mp4", {
            timelineStartMs: 1000,
            trimStartMs: 500,
            trimEndMs: 4500,
            speed: 2,
          })],
        },
      ],
    };

    expect(coverFrameSourceAt(timeline, 2000)).toEqual({
      sourceUrl: "/overlay.mp4",
      sourceMs: 2500,
    });
    expect(coverFrameSourceAt(timeline, 5000)).toBeNull();
  });

  it("requires at least one video clip", () => {
    const audioOnly: ComposeTimelineState = {
      resolution: "1080p",
      tracks: [{
        id: AUDIO_TRACK_ID,
        kind: "audio",
        clips: [clip("voice", "/voice.wav", { kind: "audio" })],
      }],
    };

    expect(hasCoverableVideo(audioOnly)).toBe(false);
    expect(hasCoverableVideo({
      ...audioOnly,
      tracks: [{
        id: VIDEO_TRACK_ID,
        kind: "video",
        clips: [clip("video", "/video.mp4")],
      }],
    })).toBe(true);
  });
});
