// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  activeClipAt,
  type ComposeClip,
  type ComposeTimelineState,
  type ComposeTrack,
  type ComposeTrackKind,
} from "../domain/videoComposeTimeline";

import {
  projectVideoComposeActiveMediaClock,
  resolveVideoComposeMediaClockMs,
  resolveVideoComposePreviewTrack,
} from "./videoComposePreview";

function clip(id: string, patch: Partial<ComposeClip> = {}): ComposeClip {
  return {
    id,
    nodeId: null,
    kind: patch.kind ?? "video",
    sourceUrl: patch.sourceUrl ?? `/${id}.mp4`,
    displayName: null,
    thumbUrl: null,
    durationMs: 5000,
    timelineStartMs: patch.timelineStartMs ?? 0,
    trimStartMs: patch.trimStartMs ?? 0,
    trimEndMs: patch.trimEndMs ?? 1000,
    volume: 1,
    muted: false,
    speed: patch.speed ?? 1,
  };
}

function track(
  id: string,
  kind: ComposeTrackKind,
  clips: ComposeClip[],
): ComposeTrack {
  return { id, kind, clips };
}

function timeline(tracks: ComposeTrack[]): ComposeTimelineState {
  return { resolution: "1080p", tracks };
}

describe("videoComposePreview", () => {
  it("selects the topmost active track and falls back to the first kind track", () => {
    const state = timeline([
      track("video-bottom", "video", [clip("bottom", { trimEndMs: 5000 })]),
      track("audio", "audio", [clip("music", { kind: "audio" })]),
      track("video-top", "video", [
        clip("top", { timelineStartMs: 1000, trimEndMs: 1000 }),
      ]),
    ]);

    expect(resolveVideoComposePreviewTrack(state, "video", 1500)?.id).toBe(
      "video-top",
    );
    expect(resolveVideoComposePreviewTrack(state, "video", 6000)?.id).toBe(
      "video-bottom",
    );
    expect(resolveVideoComposePreviewTrack(state, "audio", 0)?.id).toBe(
      "audio",
    );
    expect(
      resolveVideoComposePreviewTrack(timeline([]), "video", 0),
    ).toBeNull();
  });

  it("projects an active clip into the normalized media clock contract", () => {
    const video = track("video", "video", [
      clip("fast", {
        timelineStartMs: 2000,
        trimStartMs: 1000,
        trimEndMs: 5000,
        speed: 2,
      }),
    ]);

    expect(
      projectVideoComposeActiveMediaClock(activeClipAt(video, 2500)),
    ).toEqual({
      clipId: "fast",
      timelineStartMs: 2000,
      timelineEndMs: 4000,
      trimStartMs: 1000,
      speed: 2,
    });
    expect(projectVideoComposeActiveMediaClock(null)).toBeNull();
  });

  it("maps loaded media time back to the output timeline", () => {
    expect(
      resolveVideoComposeMediaClockMs(
        {
          clipId: "fast",
          timelineStartMs: 2000,
          timelineEndMs: 4000,
          trimStartMs: 1000,
          speed: 2,
        },
        {
          loadedClipId: "fast",
          currentTimeSeconds: 2,
          paused: false,
          seeking: false,
          readyState: 3,
        },
      ),
    ).toBe(2500);
  });

  it("rejects unavailable, stale, and out-of-range media clock samples", () => {
    const active = {
      clipId: "clip-a",
      timelineStartMs: 1000,
      timelineEndMs: 2000,
      trimStartMs: 0,
      speed: 1,
    };
    const sample = {
      loadedClipId: "clip-a",
      currentTimeSeconds: 0.5,
      paused: false,
      seeking: false,
      readyState: 3,
    };

    expect(resolveVideoComposeMediaClockMs(null, sample)).toBeNull();
    expect(
      resolveVideoComposeMediaClockMs(active, { ...sample, paused: true }),
    ).toBeNull();
    expect(
      resolveVideoComposeMediaClockMs(active, { ...sample, seeking: true }),
    ).toBeNull();
    expect(
      resolveVideoComposeMediaClockMs(active, { ...sample, readyState: 1 }),
    ).toBeNull();
    expect(
      resolveVideoComposeMediaClockMs(active, {
        ...sample,
        loadedClipId: "stale",
      }),
    ).toBeNull();
    expect(
      resolveVideoComposeMediaClockMs(active, {
        ...sample,
        currentTimeSeconds: 5,
      }),
    ).toBeNull();
  });
});
