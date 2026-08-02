// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useVideoComposePlaybackClock } from "./useVideoComposePlaybackClock";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useVideoComposePlaybackClock", () => {
  it("clamps seeks and follows a shortened duration", () => {
    const onFrame = vi.fn();
    const { result, rerender } = renderHook(
      ({ durationMs }) =>
        useVideoComposePlaybackClock(durationMs, onFrame),
      { initialProps: { durationMs: 1000 } },
    );

    act(() => result.current.seek(1500));
    expect(result.current.playheadMs).toBe(1000);
    expect(onFrame).toHaveBeenLastCalledWith(1000);

    rerender({ durationMs: 500 });
    expect(result.current.playheadMs).toBe(500);
    act(() => result.current.seek(-100));
    expect(result.current.playheadMs).toBe(0);
  });

  it("uses the media clock while playing and cancels the frame loop on pause", () => {
    const requestFrame = vi.fn((_callback: FrameRequestCallback) => {
      return 17;
    });
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const mediaClock = vi.fn(() => 750);
    const onFrame = vi.fn();
    const { result } = renderHook(() =>
      useVideoComposePlaybackClock(2000, onFrame, mediaClock),
    );

    act(() => result.current.play());
    expect(result.current.isPlaying).toBe(true);
    expect(requestFrame).toHaveBeenCalledOnce();
    const frame = requestFrame.mock.calls[0]?.[0];
    expect(frame).toBeTypeOf("function");
    act(() => frame?.(0));
    expect(mediaClock).toHaveBeenCalledOnce();
    expect(onFrame).toHaveBeenLastCalledWith(750);

    act(() => result.current.pause());
    expect(result.current.isPlaying).toBe(false);
    expect(cancelFrame).toHaveBeenCalledWith(17);
  });
});
