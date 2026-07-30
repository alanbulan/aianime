// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ComposeClip,
  ComposeTimelineState,
  ComposeTrack,
  ComposeTrackKind,
} from "@/features/canvas/domain/videoComposeTimeline";

import { useVideoComposePlaybackController } from "./useVideoComposePlaybackController";

const mocks = vi.hoisted(() => ({
  syncTrack: vi.fn(),
}));

vi.mock("./useVideoComposeTrackMediaSync", () => ({
  useVideoComposeTrackMediaSync: mocks.syncTrack,
}));

afterEach(() => {
  mocks.syncTrack.mockReset();
  vi.unstubAllGlobals();
});

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
    speed: 1,
  };
}

function track(
  id: string,
  kind: ComposeTrackKind,
  clips: ComposeClip[],
): ComposeTrack {
  return { id, kind, clips };
}

function timeline(): ComposeTimelineState {
  return {
    resolution: "1080p",
    tracks: [
      track("video-bottom", "video", [clip("bottom", { trimEndMs: 3000 })]),
      track("video-top", "video", [clip("top", { trimEndMs: 2000 })]),
      track("audio", "audio", [
        clip("music", { kind: "audio", trimEndMs: 4000 }),
      ]),
    ],
  };
}

describe("useVideoComposePlaybackController", () => {
  it("projects preview tracks, duration, source, and media synchronization", () => {
    const state = timeline();
    const { result } = renderHook(() =>
      useVideoComposePlaybackController(state, 80),
    );

    expect(result.current.durationMs).toBe(4000);
    expect(result.current.videoTrack?.id).toBe("video-top");
    expect(result.current.audioTrack?.id).toBe("audio");
    expect(result.current.videoSource).toBe("/top.mp4");
    expect(result.current.pxPerMs).toBe(0.08);
    expect(mocks.syncTrack).toHaveBeenCalledTimes(2);
    expect(mocks.syncTrack.mock.calls[0].slice(1)).toEqual([
      state.tracks[1],
      0,
      false,
      true,
    ]);
    expect(mocks.syncTrack.mock.calls[1].slice(1)).toEqual([
      state.tracks[2],
      0,
      false,
      false,
    ]);
  });

  it("positions the playhead and starts fullscreen playback from zero", () => {
    const requestFrame = vi.fn(() => 23);
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const requestFullscreen = vi.fn(() => Promise.resolve());
    const { result, unmount } = renderHook(() =>
      useVideoComposePlaybackController(timeline(), 80),
    );
    const playhead = document.createElement("div");
    result.current.playheadElRef.current = playhead;
    result.current.previewStageRef.current = {
      requestFullscreen,
    } as unknown as HTMLDivElement;

    act(() => result.current.seek(500));
    expect(result.current.playheadMs).toBe(500);
    expect(playhead.style.transform).toBe("translateX(40px)");
    act(() => result.current.handleFullscreenPlay());
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(result.current.playheadMs).toBe(0);
    expect(result.current.isPlaying).toBe(true);
    expect(requestFrame).toHaveBeenCalledOnce();

    unmount();
    expect(cancelFrame).toHaveBeenCalledWith(23);
  });
});
