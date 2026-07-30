// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  applyVideoComposeTimelineEdit,
  resolveVideoComposeClipSelection,
} from "./videoComposeTimelineEdits";
import {
  AUDIO_TRACK_ID,
  FALLBACK_CLIP_MS,
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
    trimEndMs: patch.trimEndMs ?? 5000,
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

describe("videoComposeTimelineEdits", () => {
  it("projects the selected clip and its splittable source position", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [
        clip("a", {
          timelineStartMs: 2000,
          trimStartMs: 1000,
          trimEndMs: 5000,
          speed: 2,
        }),
      ]),
    ]);
    const target = { trackId: VIDEO_TRACK_ID, clipId: "a" };

    expect(resolveVideoComposeClipSelection(state, target, 3000)).toMatchObject({
      clip: { id: "a" },
      laid: { timelineStartMs: 2000, timelineEndMs: 4000 },
      sourceMsAtPlayhead: 3000,
      canSplitAtPlayhead: true,
    });
    expect(
      resolveVideoComposeClipSelection(state, target, 2100),
    ).toMatchObject({
      sourceMsAtPlayhead: 1200,
      canSplitAtPlayhead: false,
    });
    expect(
      resolveVideoComposeClipSelection(state, target, 2000),
    ).toMatchObject({
      sourceMsAtPlayhead: null,
      canSplitAtPlayhead: false,
    });
    expect(
      resolveVideoComposeClipSelection(state, null, 3000),
    ).toBeNull();
  });

  it("updates clips and resolves probed duration against the latest trim", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [
        clip("fallback", {
          durationMs: null,
          trimEndMs: FALLBACK_CLIP_MS,
        }),
        clip("trimmed", { durationMs: null, trimEndMs: 2500 }),
      ]),
    ]);
    const resolvedFallback = applyVideoComposeTimelineEdit(state, {
      type: "resolveClipDuration",
      target: { trackId: VIDEO_TRACK_ID, clipId: "fallback" },
      durationMs: 7000,
    });
    const resolvedTrimmed = applyVideoComposeTimelineEdit(resolvedFallback, {
      type: "resolveClipDuration",
      target: { trackId: VIDEO_TRACK_ID, clipId: "trimmed" },
      durationMs: 7000,
    });
    const updated = applyVideoComposeTimelineEdit(resolvedTrimmed, {
      type: "updateClip",
      target: { trackId: VIDEO_TRACK_ID, clipId: "trimmed" },
      patch: { displayName: "renamed" },
    });

    expect(updated.tracks[0].clips[0]).toMatchObject({
      durationMs: 7000,
      trimEndMs: 7000,
    });
    expect(updated.tracks[0].clips[1]).toMatchObject({
      durationMs: 7000,
      trimEndMs: 2500,
      displayName: "renamed",
    });
  });

  it("moves a clip into one new same-kind track and removes the emptied extra track", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", []),
      track("extra", "video", [clip("a", { timelineStartMs: 3500 })]),
      track(AUDIO_TRACK_ID, "audio", []),
    ]);

    const updated = applyVideoComposeTimelineEdit(state, {
      type: "moveClipToNewTrack",
      target: { trackId: "extra", clipId: "a" },
      newTrackId: "new-track",
    });

    expect(updated.tracks.map((entry) => entry.id)).toEqual([
      VIDEO_TRACK_ID,
      "new-track",
      AUDIO_TRACK_ID,
    ]);
    expect(updated.tracks[1]).toMatchObject({
      kind: "video",
      clips: [{ id: "a", timelineStartMs: 3500 }],
    });
  });

  it("splits a clip with injected ids and rejects a boundary split", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [
        clip("a", {
          timelineStartMs: 600,
          trimStartMs: 1000,
          trimEndMs: 5000,
          speed: 2,
        }),
      ]),
    ]);
    const target = { trackId: VIDEO_TRACK_ID, clipId: "a" };
    const updated = applyVideoComposeTimelineEdit(state, {
      type: "splitClip",
      target,
      sourceMs: 3000,
      leftClipId: "left",
      rightClipId: "right",
    });

    expect(updated.tracks[0].clips).toMatchObject([
      { id: "left", trimStartMs: 1000, trimEndMs: 3000 },
      {
        id: "right",
        trimStartMs: 3000,
        trimEndMs: 5000,
        timelineStartMs: 1600,
      },
    ]);
    expect(
      applyVideoComposeTimelineEdit(state, {
        type: "splitClip",
        target,
        sourceMs: 1200,
        leftClipId: "unused-left",
        rightClipId: "unused-right",
      }),
    ).toBe(state);
  });

  it("trims at the playhead and ripple-packs only the main video track", () => {
    const main = timeline([
      track(VIDEO_TRACK_ID, "video", [
        clip("a", { trimEndMs: 4000 }),
        clip("b", { timelineStartMs: 5000, trimEndMs: 2000 }),
      ]),
    ]);
    const trimmedMain = applyVideoComposeTimelineEdit(main, {
      type: "trimClipToPlayhead",
      target: { trackId: VIDEO_TRACK_ID, clipId: "a" },
      playheadMs: 1000,
      side: "right",
    });
    expect(trimmedMain.tracks[0].clips).toMatchObject([
      { id: "a", trimEndMs: 1000, timelineStartMs: 0 },
      { id: "b", timelineStartMs: 1000 },
    ]);

    const extra = timeline([
      track("extra", "video", [
        clip("x", {
          timelineStartMs: 4000,
          trimStartMs: 1000,
          trimEndMs: 5000,
          speed: 2,
        }),
      ]),
    ]);
    const trimmedExtra = applyVideoComposeTimelineEdit(extra, {
      type: "trimClipToPlayhead",
      target: { trackId: "extra", clipId: "x" },
      playheadMs: 5000,
      side: "left",
    });
    expect(trimmedExtra.tracks[0].clips[0]).toMatchObject({
      trimStartMs: 3000,
      timelineStartMs: 5000,
    });
  });

  it("clamps speed and volume while preserving their ripple and mute rules", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [
        clip("a", { trimEndMs: 4000, muted: true }),
        clip("b", { timelineStartMs: 6000, trimEndMs: 1000 }),
      ]),
    ]);
    const spedUp = applyVideoComposeTimelineEdit(state, {
      type: "setClipSpeed",
      target: { trackId: VIDEO_TRACK_ID, clipId: "a" },
      speed: 20,
    });
    expect(spedUp.tracks[0].clips).toMatchObject([
      { id: "a", speed: 4, timelineStartMs: 0 },
      { id: "b", timelineStartMs: 1000 },
    ]);

    const audible = applyVideoComposeTimelineEdit(spedUp, {
      type: "setClipVolume",
      target: { trackId: VIDEO_TRACK_ID, clipId: "a" },
      volume: 2,
    });
    expect(audible.tracks[0].clips[0]).toMatchObject({
      volume: 1,
      muted: false,
    });
    const silent = applyVideoComposeTimelineEdit(audible, {
      type: "setClipVolume",
      target: { trackId: VIDEO_TRACK_ID, clipId: "a" },
      volume: -1,
    });
    expect(silent.tracks[0].clips[0]).toMatchObject({
      volume: 0,
      muted: true,
    });
    const unmuted = applyVideoComposeTimelineEdit(silent, {
      type: "toggleClipMute",
      target: { trackId: VIDEO_TRACK_ID, clipId: "a" },
    });
    expect(unmuted.tracks[0].clips[0].muted).toBe(false);
  });

  it("inserts video copies after the target and appends audio copies at track end", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [
        clip("b", { timelineStartMs: 4000, trimEndMs: 1000 }),
        clip("a", { timelineStartMs: 0, trimEndMs: 2000 }),
      ]),
      track(AUDIO_TRACK_ID, "audio", [
        clip("music", {
          kind: "audio",
          timelineStartMs: 3000,
          trimEndMs: 2000,
        }),
      ]),
    ]);
    const withVideoCopy = applyVideoComposeTimelineEdit(state, {
      type: "insertClipCopy",
      sourceClip: state.tracks[0].clips[1],
      targetTrackId: VIDEO_TRACK_ID,
      afterClipId: "a",
      copyClipId: "a-copy",
    });
    expect(
      withVideoCopy.tracks[0].clips.map((entry) => [
        entry.id,
        entry.timelineStartMs,
      ]),
    ).toEqual([
      ["a", 0],
      ["a-copy", 2000],
      ["b", 4000],
    ]);

    const withAudioCopy = applyVideoComposeTimelineEdit(withVideoCopy, {
      type: "insertClipCopy",
      sourceClip: state.tracks[1].clips[0],
      targetTrackId: AUDIO_TRACK_ID,
      afterClipId: null,
      copyClipId: "music-copy",
    });
    expect(withAudioCopy.tracks[1].clips[1]).toMatchObject({
      id: "music-copy",
      timelineStartMs: 5000,
    });
  });

  it("removes clips, cleans empty extra tracks, and keeps empty default tracks", () => {
    const state = timeline([
      track(VIDEO_TRACK_ID, "video", [
        clip("a", { trimEndMs: 1000 }),
        clip("b", { timelineStartMs: 3000, trimEndMs: 1000 }),
      ]),
      track("extra", "video", [clip("x", { trimEndMs: 1000 })]),
      track(AUDIO_TRACK_ID, "audio", [
        clip("music", { kind: "audio", trimEndMs: 1000 }),
      ]),
    ]);
    const withoutA = applyVideoComposeTimelineEdit(state, {
      type: "removeClip",
      target: { trackId: VIDEO_TRACK_ID, clipId: "a" },
    });
    expect(withoutA.tracks[0].clips[0]).toMatchObject({
      id: "b",
      timelineStartMs: 0,
    });

    const emptied = applyVideoComposeTimelineEdit(withoutA, {
      type: "removeClips",
      clipIds: new Set(["b", "x", "music"]),
    });
    expect(emptied.tracks).toEqual([
      { id: VIDEO_TRACK_ID, kind: "video", clips: [] },
      { id: AUDIO_TRACK_ID, kind: "audio", clips: [] },
    ]);

    const withEmptyExtra = timeline([
      ...emptied.tracks,
      track("empty-extra", "video", []),
    ]);
    const cleaned = applyVideoComposeTimelineEdit(withEmptyExtra, {
      type: "cleanupEmptyTracks",
    });
    expect(cleaned.tracks).toEqual(emptied.tracks);
    expect(
      applyVideoComposeTimelineEdit(cleaned, { type: "cleanupEmptyTracks" }),
    ).toBe(cleaned);
  });
});
