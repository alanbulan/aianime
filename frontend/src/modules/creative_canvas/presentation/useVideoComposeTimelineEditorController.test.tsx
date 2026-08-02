// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AUDIO_TRACK_ID,
  VIDEO_TRACK_ID,
  type ComposeClip,
  type ComposeTimelineState,
  type ComposeTrack,
} from "../domain/videoComposeTimeline";

import {
  useVideoComposeTimelineEditorController,
  type UseVideoComposeTimelineEditorControllerOptions,
} from "./useVideoComposeTimelineEditorController";

function clip(id: string, patch: Partial<ComposeClip> = {}): ComposeClip {
  return {
    id,
    nodeId: null,
    kind: patch.kind ?? "video",
    sourceUrl: `/${id}.mp4`,
    displayName: null,
    thumbUrl: null,
    durationMs: 5000,
    timelineStartMs: patch.timelineStartMs ?? 0,
    trimStartMs: patch.trimStartMs ?? 0,
    trimEndMs: patch.trimEndMs ?? 4000,
    volume: patch.volume ?? 1,
    muted: patch.muted ?? false,
    speed: patch.speed ?? 1,
  };
}

function timeline(tracks: ComposeTrack[]): ComposeTimelineState {
  return { resolution: "1080p", tracks };
}

function sequence(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function setup(
  state: ComposeTimelineState,
  patch: Partial<UseVideoComposeTimelineEditorControllerOptions> = {},
  clipIds: string[] = ["copy-1", "copy-2"],
) {
  const applyTimelineEdit = vi.fn();
  const pushHistory = vi.fn();
  const selectOnly = vi.fn();
  const clearSelection = vi.fn();
  const removeFromSelection = vi.fn();
  const options: UseVideoComposeTimelineEditorControllerOptions = {
    timeline: state,
    timelineRef: { current: state },
    selected: null,
    selectedIds: new Set(),
    playheadMs: 0,
    videoTrack:
      state.tracks.find((track) => track.kind === "video") ?? null,
    audioTrack:
      state.tracks.find((track) => track.kind === "audio") ?? null,
    createClipId: sequence(...clipIds),
    createTrackId: () => "created-track",
    applyTimelineEdit,
    pushHistory,
    selectOnly,
    clearSelection,
    removeFromSelection,
    ...patch,
  };
  const rendered = renderHook(
    (props: UseVideoComposeTimelineEditorControllerOptions) =>
      useVideoComposeTimelineEditorController(props),
    { initialProps: options },
  );
  return {
    ...rendered,
    options,
    applyTimelineEdit,
    pushHistory,
    selectOnly,
    clearSelection,
    removeFromSelection,
  };
}

describe("useVideoComposeTimelineEditorController", () => {
  it("projects the selected clip and splits it with caller-provided ids", () => {
    const selectedClip = clip("clip-a");
    const state = timeline([
      { id: VIDEO_TRACK_ID, kind: "video", clips: [selectedClip] },
    ]);
    const { result, applyTimelineEdit, pushHistory, selectOnly } = setup(
      state,
      {
        selected: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
        playheadMs: 1000,
      },
      ["left", "right"],
    );

    expect(result.current.selectedClip?.sourceMsAtPlayhead).toBe(1000);
    expect(result.current.canSplitInside).toBe(true);
    expect(result.current.selectedSourceSpanMs).toBe(4000);
    act(() => result.current.splitSelected());

    expect(pushHistory).toHaveBeenCalledOnce();
    expect(applyTimelineEdit).toHaveBeenCalledWith({
      type: "splitClip",
      target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
      sourceMs: 1000,
      leftClipId: "left",
      rightClipId: "right",
    });
    expect(selectOnly).toHaveBeenCalledWith({
      trackId: VIDEO_TRACK_ID,
      clipId: "left",
    });
  });

  it("moves existing clips to a new track and removes selection on delete", () => {
    const state = timeline([
      { id: VIDEO_TRACK_ID, kind: "video", clips: [clip("clip-a")] },
    ]);
    const {
      result,
      applyTimelineEdit,
      pushHistory,
      selectOnly,
      removeFromSelection,
    } = setup(state);

    act(() => result.current.moveToNewTrack(VIDEO_TRACK_ID, "missing"));
    expect(pushHistory).not.toHaveBeenCalled();
    act(() => result.current.moveToNewTrack(VIDEO_TRACK_ID, "clip-a"));
    expect(applyTimelineEdit).toHaveBeenCalledWith({
      type: "moveClipToNewTrack",
      target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
      newTrackId: "created-track",
    });
    expect(selectOnly).toHaveBeenCalledWith({
      trackId: "created-track",
      clipId: "clip-a",
    });

    act(() => result.current.removeClip(VIDEO_TRACK_ID, "clip-a"));
    expect(applyTimelineEdit).toHaveBeenLastCalledWith({
      type: "removeClip",
      target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
    });
    expect(removeFromSelection).toHaveBeenCalledWith("clip-a");
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it("preserves history boundaries for trim, speed, volume, and mute edits", () => {
    const selectedClip = clip("clip-a", { volume: 0.8 });
    const state = timeline([
      { id: VIDEO_TRACK_ID, kind: "video", clips: [selectedClip] },
    ]);
    const { result, applyTimelineEdit, pushHistory } = setup(state, {
      selected: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
      playheadMs: 1000,
    });

    act(() => {
      result.current.trimSelectedToPlayhead("left");
      result.current.setSelectedSpeed(2);
      result.current.setSelectedVolume(0.5);
      result.current.toggleSelectedMute();
      result.current.setClipMuted(VIDEO_TRACK_ID, "clip-a", true);
    });

    expect(applyTimelineEdit.mock.calls.map(([edit]) => edit)).toEqual([
      {
        type: "trimClipToPlayhead",
        target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
        playheadMs: 1000,
        side: "left",
      },
      {
        type: "setClipSpeed",
        target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
        speed: 2,
      },
      {
        type: "setClipVolume",
        target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
        volume: 0.5,
      },
      {
        type: "toggleClipMute",
        target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
      },
      {
        type: "updateClip",
        target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
        patch: { muted: true },
      },
    ]);
    expect(pushHistory).toHaveBeenCalledTimes(4);
  });

  it("keeps a copied snapshot and pastes it after the current target-track selection", () => {
    const first = clip("first");
    const second = clip("second", { timelineStartMs: 4000 });
    const videoTrack = {
      id: VIDEO_TRACK_ID,
      kind: "video" as const,
      clips: [first, second],
    };
    const state = timeline([
      videoTrack,
      { id: AUDIO_TRACK_ID, kind: "audio", clips: [] },
    ]);
    const {
      result,
      rerender,
      options,
      applyTimelineEdit,
      pushHistory,
      selectOnly,
    } = setup(
      state,
      {
        selected: { trackId: VIDEO_TRACK_ID, clipId: "first" },
        playheadMs: 1000,
        videoTrack,
      },
      ["pasted", "duplicated"],
    );

    act(() => result.current.copySelected());
    rerender({
      ...options,
      selected: { trackId: VIDEO_TRACK_ID, clipId: "second" },
      playheadMs: 4500,
      videoTrack,
    });
    act(() => result.current.pasteClipboard());
    expect(applyTimelineEdit).toHaveBeenLastCalledWith({
      type: "insertClipCopy",
      sourceClip: { ...first },
      targetTrackId: VIDEO_TRACK_ID,
      afterClipId: "second",
      copyClipId: "pasted",
    });
    expect(selectOnly).toHaveBeenLastCalledWith({
      trackId: VIDEO_TRACK_ID,
      clipId: "pasted",
    });

    act(() => result.current.duplicateSelected());
    expect(applyTimelineEdit).toHaveBeenLastCalledWith({
      type: "insertClipCopy",
      sourceClip: second,
      targetTrackId: VIDEO_TRACK_ID,
      afterClipId: "second",
      copyClipId: "duplicated",
    });
    expect(pushHistory).toHaveBeenCalledTimes(2);
  });

  it("removes the complete selection once and then clears it", () => {
    const state = timeline([
      {
        id: VIDEO_TRACK_ID,
        kind: "video",
        clips: [clip("first"), clip("second")],
      },
    ]);
    const { result, applyTimelineEdit, pushHistory, clearSelection } = setup(
      state,
      {
        selected: { trackId: VIDEO_TRACK_ID, clipId: "second" },
        selectedIds: new Set(["first"]),
        playheadMs: 4500,
      },
    );

    act(() => result.current.removeSelected());
    const edit = applyTimelineEdit.mock.calls[0][0];
    expect(edit.type).toBe("removeClips");
    if (edit.type !== "removeClips") throw new Error("expected removeClips");
    expect([...edit.clipIds]).toEqual(["first", "second"]);
    expect(pushHistory).toHaveBeenCalledOnce();
    expect(clearSelection).toHaveBeenCalledOnce();
  });
});
