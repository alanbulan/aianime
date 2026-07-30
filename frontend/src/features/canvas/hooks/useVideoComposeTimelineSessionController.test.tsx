// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VIDEO_TRACK_ID,
  type ComposeClip,
  type ComposeTimelineState,
} from "@/features/canvas/domain/videoComposeTimeline";

import { useVideoComposeTimelineSessionController } from "./useVideoComposeTimelineSessionController";

const mocks = vi.hoisted(() => ({
  probeDuration: vi.fn(),
}));

vi.mock(
  "@/features/canvas/infrastructure/browserVideoComposeMediaRuntime",
  () => ({
    probeVideoComposeMediaDuration: mocks.probeDuration,
  }),
);

afterEach(() => {
  mocks.probeDuration.mockReset();
});

function clip(id: string, patch: Partial<ComposeClip> = {}): ComposeClip {
  return {
    id,
    nodeId: null,
    kind: "video",
    sourceUrl: `/${id}.mp4`,
    displayName: null,
    thumbUrl: null,
    durationMs: 5000,
    timelineStartMs: 0,
    trimStartMs: 0,
    trimEndMs: 1000,
    volume: 1,
    muted: false,
    speed: 1,
    ...patch,
  };
}

function timeline(clips: ComposeClip[]): ComposeTimelineState {
  return {
    resolution: "1080p",
    tracks: [{ id: VIDEO_TRACK_ID, kind: "video", clips }],
  };
}

function setup(
  initialTimeline: ComposeTimelineState,
  onPersistDraft?: (timeline: ComposeTimelineState) => void,
) {
  return renderHook(() =>
    useVideoComposeTimelineSessionController({
      initialTimeline,
      sourceNodes: [],
      seedNodeIds: [],
      onPersistDraft,
      createClipId: () => "created-clip",
    }),
  );
}

describe("useVideoComposeTimelineSessionController", () => {
  it("persists the latest reducer result when the session unmounts", () => {
    const onPersistDraft = vi.fn();
    const { result, unmount } = setup(
      timeline([clip("clip-a")]),
      onPersistDraft,
    );

    act(() =>
      result.current.applyTimelineEdit({
        type: "setClipSpeed",
        target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
        speed: 2,
      }),
    );
    expect(result.current.timeline.tracks[0].clips[0].speed).toBe(2);

    unmount();
    expect(onPersistDraft).toHaveBeenCalledOnce();
    expect(onPersistDraft.mock.calls[0][0].tracks[0].clips[0].speed).toBe(2);
  });

  it("keeps primary and additive selection synchronized", () => {
    const { result } = setup(timeline([clip("clip-a"), clip("clip-b")]));

    act(() =>
      result.current.selectOnly({
        trackId: VIDEO_TRACK_ID,
        clipId: "clip-a",
      }),
    );
    expect(result.current.selected?.clipId).toBe("clip-a");
    expect([...result.current.selectedIds]).toEqual(["clip-a"]);

    act(() =>
      result.current.toggleInSelection({
        trackId: VIDEO_TRACK_ID,
        clipId: "clip-b",
      }),
    );
    expect(result.current.selected?.clipId).toBe("clip-b");
    expect([...result.current.selectedIds]).toEqual(["clip-a", "clip-b"]);

    act(() =>
      result.current.toggleInSelection({
        trackId: VIDEO_TRACK_ID,
        clipId: "clip-b",
      }),
    );
    expect(result.current.selected).toBeNull();
    expect([...result.current.selectedIds]).toEqual(["clip-a"]);

    act(() => result.current.removeFromSelection("clip-a"));
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("tracks undo, redo, cover edits, and upstream reset in one history", () => {
    const original = timeline([clip("clip-a")]);
    const { result } = setup(original);

    act(() => {
      result.current.pushHistory();
      result.current.applyTimelineEdit({
        type: "setClipSpeed",
        target: { trackId: VIDEO_TRACK_ID, clipId: "clip-a" },
        speed: 2,
      });
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.timeline.tracks[0].clips[0].speed).toBe(2);

    act(() => result.current.undo());
    expect(result.current.timeline.tracks[0].clips[0].speed).toBe(1);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.timeline.tracks[0].clips[0].speed).toBe(2);

    act(() =>
      result.current.applyCover({
        source: "upload",
        frameMs: null,
        url: "/cover.jpg",
      }),
    );
    expect(result.current.timeline.cover?.url).toBe("/cover.jpg");

    act(() =>
      result.current.selectOnly({
        trackId: VIDEO_TRACK_ID,
        clipId: "clip-a",
      }),
    );
    act(() => result.current.resetToUpstream());
    expect(result.current.timeline.tracks).toEqual([
      { id: VIDEO_TRACK_ID, kind: "video", clips: [] },
    ]);
    expect(result.current.selected).toBeNull();
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("resolves missing media duration without adding history", async () => {
    mocks.probeDuration.mockResolvedValue(2400);
    const { result } = setup(
      timeline([clip("pending", { durationMs: null, trimEndMs: 2000 })]),
    );

    await waitFor(() =>
      expect(result.current.timeline.tracks[0].clips[0].durationMs).toBe(2400),
    );
    expect(mocks.probeDuration).toHaveBeenCalledWith(
      "/pending.mp4",
      "video",
      expect.any(Function),
    );
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
