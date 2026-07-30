// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  createVideoComposeClipDragSession,
  createVideoComposeTrimDragSession,
  projectVideoComposeClipDrag,
  projectVideoComposeTrimDrag,
  snapVideoComposeClipStart,
  snapVideoComposePlayhead,
} from "./videoComposeTimelineGestures";
import {
  AUDIO_TRACK_ID,
  VIDEO_TRACK_ID,
  type ComposeClip,
  type ComposeTimelineState,
  type ComposeTrack,
  type ComposeTrackKind,
} from "./videoComposeTimeline";

function clip(id: string, patch: Partial<ComposeClip> = {}): ComposeClip {
  return {
    id,
    nodeId: null,
    kind: patch.kind ?? "video",
    sourceUrl: patch.sourceUrl ?? `/${id}.mp4`,
    displayName: patch.displayName ?? null,
    thumbUrl: patch.thumbUrl ?? null,
    durationMs: patch.durationMs === undefined ? 5000 : patch.durationMs,
    timelineStartMs: patch.timelineStartMs ?? 0,
    trimStartMs: patch.trimStartMs ?? 0,
    trimEndMs: patch.trimEndMs ?? 1000,
    volume: patch.volume ?? 1,
    muted: patch.muted ?? false,
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

describe("videoComposeTimelineGestures", () => {
  it("snaps clip edges and the playhead to timeline boundaries only within 8px", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [clip("moving")]),
      track("extra", "video", [clip("fixed", { timelineStartMs: 3000 })]),
    ]);

    expect(
      snapVideoComposeClipStart({
        state,
        clipId: "moving",
        startMs: 1950,
        lengthMs: 1000,
        pxPerMs: 0.1,
        enabled: true,
      }),
    ).toBe(2000);
    expect(
      snapVideoComposeClipStart({
        state,
        clipId: "moving",
        startMs: -100,
        lengthMs: 1000,
        pxPerMs: 0.1,
        enabled: false,
      }),
    ).toBe(0);
    expect(
      snapVideoComposePlayhead({
        state,
        playheadMs: 3030,
        pxPerMs: 0.1,
        enabled: true,
      }),
    ).toBe(3000);
    expect(
      snapVideoComposePlayhead({
        state,
        playheadMs: 2500,
        pxPerMs: 0.1,
        enabled: true,
      }),
    ).toBe(2500);
  });

  it("reorders and packs the main video track while removing an abandoned auto track", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [clip("main", { trimEndMs: 2000 })]),
      track("auto", "video", [clip("moving", { timelineStartMs: 3000 })]),
      track(AUDIO_TRACK_ID, "audio", []),
    ]);
    const session = createVideoComposeClipDragSession(state, {
      trackId: "auto",
      clipId: "moving",
    });
    expect(session).not.toBeNull();

    const projected = projectVideoComposeClipDrag({
      state,
      session: session!,
      destinationTrackId: VIDEO_TRACK_ID,
      createdTrackId: null,
      previousAutoCreatedTrackId: "auto",
      deltaMs: -4000,
      pxPerMs: 0.1,
      snapEnabled: true,
    });

    expect(projected).toMatchObject({
      status: "applied",
      targetTrackId: VIDEO_TRACK_ID,
      autoCreatedTrackId: null,
      magnetic: true,
    });
    if (projected?.status !== "applied") throw new Error("expected applied drag");
    expect(projected.timeline.tracks.map((entry) => entry.id)).toEqual([
      VIDEO_TRACK_ID,
      AUDIO_TRACK_ID,
    ]);
    expect(
      projected.timeline.tracks[0].clips.map((entry) => [
        entry.id,
        entry.timelineStartMs,
      ]),
    ).toEqual([
      ["moving", 0],
      ["main", 1000],
    ]);
  });

  it("creates a free-position audio track with the caller-provided id", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", []),
      track(AUDIO_TRACK_ID, "audio", [
        clip("music", { kind: "audio", trimEndMs: 2000 }),
      ]),
    ]);
    const session = createVideoComposeClipDragSession(state, {
      trackId: AUDIO_TRACK_ID,
      clipId: "music",
    });
    expect(session).not.toBeNull();

    const projected = projectVideoComposeClipDrag({
      state,
      session: session!,
      destinationTrackId: "audio-extra",
      createdTrackId: "audio-extra",
      previousAutoCreatedTrackId: null,
      deltaMs: 2500,
      pxPerMs: 0.1,
      snapEnabled: false,
    });

    expect(projected).toMatchObject({
      status: "applied",
      targetTrackId: "audio-extra",
      autoCreatedTrackId: "audio-extra",
      magnetic: false,
    });
    if (projected?.status !== "applied") throw new Error("expected applied drag");
    expect(projected.timeline.tracks).toMatchObject([
      { id: VIDEO_TRACK_ID, clips: [] },
      { id: AUDIO_TRACK_ID, clips: [] },
      {
        id: "audio-extra",
        kind: "audio",
        clips: [{ id: "music", timelineStartMs: 2500 }],
      },
    ]);
  });

  it("snaps free clips into valid gaps and rejects gaps that are too narrow", () => {
    const state = timeline([
      track(AUDIO_TRACK_ID, "audio", [
        clip("moving", { kind: "audio" }),
        clip("fixed", { kind: "audio", timelineStartMs: 3000 }),
      ]),
    ]);
    const session = createVideoComposeClipDragSession(state, {
      trackId: AUDIO_TRACK_ID,
      clipId: "moving",
    });
    const snapped = projectVideoComposeClipDrag({
      state,
      session: session!,
      destinationTrackId: AUDIO_TRACK_ID,
      createdTrackId: null,
      previousAutoCreatedTrackId: null,
      deltaMs: 1950,
      pxPerMs: 0.1,
      snapEnabled: true,
    });
    if (snapped?.status !== "applied") throw new Error("expected applied drag");
    expect(
      snapped.timeline.tracks[0].clips.find(
        (entry) => entry.id === "moving",
      )?.timelineStartMs,
    ).toBe(2000);

    const crowded = timeline([
      track(AUDIO_TRACK_ID, "audio", [
        clip("left", { kind: "audio", trimEndMs: 3000 }),
        clip("right", {
          kind: "audio",
          timelineStartMs: 4000,
          trimEndMs: 3000,
        }),
        clip("wide", {
          kind: "audio",
          timelineStartMs: 8000,
          trimEndMs: 2000,
        }),
      ]),
    ]);
    const crowdedSession = createVideoComposeClipDragSession(crowded, {
      trackId: AUDIO_TRACK_ID,
      clipId: "wide",
    });
    expect(
      projectVideoComposeClipDrag({
        state: crowded,
        session: crowdedSession!,
        destinationTrackId: AUDIO_TRACK_ID,
        createdTrackId: null,
        previousAutoCreatedTrackId: null,
        deltaMs: -4500,
        pxPerMs: 0.1,
        snapEnabled: false,
      }),
    ).toEqual({ status: "blocked", magnetic: false });
  });

  it("rejects stale drag targets without changing the timeline", () => {
    const state = timeline([
      track(AUDIO_TRACK_ID, "audio", [clip("music", { kind: "audio" })]),
    ]);
    const session = createVideoComposeClipDragSession(state, {
      trackId: AUDIO_TRACK_ID,
      clipId: "music",
    });
    expect(
      projectVideoComposeClipDrag({
        state,
        session: session!,
        destinationTrackId: "missing",
        createdTrackId: null,
        previousAutoCreatedTrackId: null,
        deltaMs: 1000,
        pxPerMs: 0.1,
        snapEnabled: true,
      }),
    ).toBeNull();
  });

  it("projects trim movement with speed, grid, minimum length, and video-neighbor bounds", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [
        clip("moving", {
          durationMs: 10000,
          trimEndMs: 5000,
          speed: 2,
        }),
      ]),
      track("extra", "video", [
        clip("neighbor", { timelineStartMs: 3000 }),
      ]),
    ]);
    const session = createVideoComposeTrimDragSession(state, {
      trackId: VIDEO_TRACK_ID,
      clipId: "moving",
    });
    expect(session).toMatchObject({ speed: 2, maxTrimEndMs: 6000 });
    expect(
      projectVideoComposeTrimDrag(session!, {
        edge: "end",
        deltaTimelineMs: 2000,
        snapEnabled: false,
      }),
    ).toEqual({ trimEndMs: 6000 });
    expect(
      projectVideoComposeTrimDrag(session!, {
        edge: "start",
        deltaTimelineMs: 760,
        snapEnabled: true,
      }),
    ).toEqual({ trimStartMs: 1500, timelineStartMs: 750 });
    expect(
      projectVideoComposeTrimDrag(session!, {
        edge: "start",
        deltaTimelineMs: 10000,
        snapEnabled: false,
      }),
    ).toEqual({ trimStartMs: 4800, timelineStartMs: 2400 });
  });

  it("uses the 5s fallback as the trim end bound when duration is unknown", () => {
    const state = timeline([
      track(AUDIO_TRACK_ID, "audio", [
        clip("music", {
          kind: "audio",
          durationMs: null,
          trimEndMs: 2000,
        }),
      ]),
    ]);
    const session = createVideoComposeTrimDragSession(state, {
      trackId: AUDIO_TRACK_ID,
      clipId: "music",
    });
    expect(session?.maxTrimEndMs).toBe(5000);
    expect(
      projectVideoComposeTrimDrag(session!, {
        edge: "end",
        deltaTimelineMs: 10000,
        snapEnabled: false,
      }),
    ).toEqual({ trimEndMs: 5000 });
  });
});
