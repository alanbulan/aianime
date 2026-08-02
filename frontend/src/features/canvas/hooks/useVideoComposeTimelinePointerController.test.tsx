// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VIDEO_TRACK_ID,
  type ComposeClip,
  type ComposeTimelineState,
  type ComposeTrack,
  type ComposeTrackKind,
  type VideoComposeTimelineEdit,
} from "@/modules/creative_canvas/public";

import { useVideoComposeTimelinePointerController } from "./useVideoComposeTimelinePointerController";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
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

function timeline(tracks: ComposeTrack[]): ComposeTimelineState {
  return { resolution: "1080p", tracks };
}

function pointerDown(
  currentTarget: HTMLElement,
  patch: Partial<ReactPointerEvent> = {},
): ReactPointerEvent {
  return {
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...patch,
  } as unknown as ReactPointerEvent;
}

function pointerEvent(
  type: "pointermove" | "pointerup" | "pointercancel",
  clientX: number,
  clientY = 0,
): MouseEvent {
  return new MouseEvent(type, { bubbles: true, clientX, clientY });
}

function appendTrackRow(
  trackId: string,
  kind: ComposeTrackKind,
  top: number,
  bottom: number,
): void {
  const row = document.createElement("div");
  row.dataset.composeTrackId = trackId;
  row.dataset.composeTrackKind = kind;
  row.getBoundingClientRect = () =>
    ({
      x: 0,
      y: top,
      left: 0,
      right: 500,
      top,
      bottom,
      width: 500,
      height: bottom - top,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(row);
}

function setup(state: ComposeTimelineState) {
  const timelineRef = { current: state } as RefObject<ComposeTimelineState>;
  const pxPerMsRef = { current: 1 } as RefObject<number>;
  const snapEnabledRef = { current: false } as RefObject<boolean>;
  const trackScrollRef = {
    current: null,
  } as RefObject<HTMLDivElement | null>;
  const updateTimelineTracks = vi.fn((tracks: ComposeTrack[]) => {
    timelineRef.current = { ...timelineRef.current, tracks };
  });
  const applyTimelineEdit = vi.fn<(edit: VideoComposeTimelineEdit) => void>();
  const pushHistory = vi.fn();
  const selectOnly = vi.fn();
  const toggleInSelection = vi.fn();
  const seek = vi.fn();
  const rendered = renderHook(() =>
    useVideoComposeTimelinePointerController({
      timelineRef,
      pxPerMsRef,
      snapEnabledRef,
      trackScrollRef,
      createTrackId: () => "created-track",
      updateTimelineTracks,
      applyTimelineEdit,
      pushHistory,
      selectOnly,
      toggleInSelection,
      seek,
    }),
  );
  return {
    ...rendered,
    timelineRef,
    pxPerMsRef,
    trackScrollRef,
    updateTimelineTracks,
    applyTimelineEdit,
    pushHistory,
    selectOnly,
    toggleInSelection,
    seek,
  };
}

describe("useVideoComposeTimelinePointerController", () => {
  it("uses modifier clicks only to update additive selection", () => {
    const moving = clip("moving");
    const main = track(VIDEO_TRACK_ID, "video", [moving]);
    const { result, toggleInSelection, selectOnly, pushHistory } = setup(
      timeline([main]),
    );
    const event = pointerDown(document.createElement("div"), {
      shiftKey: true,
    });

    act(() => result.current.startClipMove(event, main, moving));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(toggleInSelection).toHaveBeenCalledWith({
      trackId: VIDEO_TRACK_ID,
      clipId: "moving",
    });
    expect(selectOnly).not.toHaveBeenCalled();
    expect(pushHistory).not.toHaveBeenCalled();
  });

  it("starts history after the movement threshold and projects into the hit track", () => {
    let nextFrame: FrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 7;
    });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const moving = clip("moving");
    const main = track(VIDEO_TRACK_ID, "video", [moving]);
    const extra = track("video-extra", "video", []);
    appendTrackRow(VIDEO_TRACK_ID, "video", 0, 30);
    appendTrackRow("video-extra", "video", 40, 70);
    const {
      result,
      updateTimelineTracks,
      applyTimelineEdit,
      pushHistory,
      selectOnly,
    } = setup(timeline([main, extra]));

    act(() =>
      result.current.startClipMove(
        pointerDown(document.createElement("div"), {
          clientX: 0,
          clientY: 10,
        }),
        main,
        moving,
      ),
    );
    act(() => window.dispatchEvent(pointerEvent("pointermove", 2, 10)));
    expect(pushHistory).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(pointerEvent("pointermove", 500, 50)));
    expect(pushHistory).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(nextFrame).toBeTypeOf("function");
    act(() => nextFrame?.(0));

    expect(updateTimelineTracks).toHaveBeenCalledOnce();
    const projectedTracks = updateTimelineTracks.mock.calls[0][0];
    expect(
      projectedTracks
        .find((entry) => entry.id === "video-extra")
        ?.clips.map((entry) => [entry.id, entry.timelineStartMs]),
    ).toEqual([["moving", 500]]);

    act(() => window.dispatchEvent(pointerEvent("pointerup", 500, 50)));
    expect(applyTimelineEdit).toHaveBeenLastCalledWith({
      type: "cleanupEmptyTracks",
    });
    expect(selectOnly).toHaveBeenLastCalledWith({
      trackId: "video-extra",
      clipId: "moving",
    });
    expect(result.current.dragGhost).toBeNull();
  });

  it("tracks trim feedback and compacts the main video track on cancellation", () => {
    const moving = clip("moving", { trimEndMs: 3000 });
    const main = track(VIDEO_TRACK_ID, "video", [moving]);
    const { result, applyTimelineEdit, pushHistory, selectOnly } = setup(
      timeline([main]),
    );

    act(() =>
      result.current.startTrim(
        pointerDown(document.createElement("div"), { clientX: 100 }),
        main,
        moving,
        "end",
      ),
    );
    expect(result.current.trimEdit).toEqual({
      clipId: "moving",
      edge: "end",
    });
    expect(pushHistory).toHaveBeenCalledOnce();
    expect(selectOnly).toHaveBeenCalledWith({
      trackId: VIDEO_TRACK_ID,
      clipId: "moving",
    });

    act(() => window.dispatchEvent(pointerEvent("pointermove", 200)));
    expect(applyTimelineEdit).toHaveBeenCalledWith({
      type: "updateClip",
      target: { trackId: VIDEO_TRACK_ID, clipId: "moving" },
      patch: { trimEndMs: 3100 },
    });
    act(() => window.dispatchEvent(pointerEvent("pointercancel", 200)));
    expect(result.current.trimEdit).toBeNull();
    expect(applyTimelineEdit).toHaveBeenLastCalledWith({
      type: "compactMainVideoTrack",
    });
  });

  it("coalesces scrub moves and releases pointer capture at the exact last position", () => {
    const requestFrame = vi.fn((_callback: FrameRequestCallback) => 11);
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { result, trackScrollRef, pxPerMsRef, seek } = setup(timeline([]));
    pxPerMsRef.current = 0.5;
    const container = document.createElement("div");
    container.scrollLeft = 30;
    container.getBoundingClientRect = () =>
      ({ left: 20, top: 0, right: 520, bottom: 100 }) as DOMRect;
    trackScrollRef.current = container;
    const scrubTarget = document.createElement("div");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(scrubTarget, { setPointerCapture, releasePointerCapture });

    act(() =>
      result.current.startScrub(
        pointerDown(scrubTarget, { clientX: 70, pointerId: 4 }),
      ),
    );
    expect(seek).toHaveBeenLastCalledWith(160);
    act(() => {
      scrubTarget.dispatchEvent(pointerEvent("pointermove", 90));
      scrubTarget.dispatchEvent(pointerEvent("pointermove", 110));
    });
    expect(requestFrame).toHaveBeenCalledOnce();
    act(() => requestFrame.mock.calls[0][0](0));
    expect(seek).toHaveBeenLastCalledWith(240);

    act(() => scrubTarget.dispatchEvent(pointerEvent("pointerup", 110)));
    expect(seek.mock.calls.map(([value]) => value)).toEqual([160, 240, 240]);
    expect(setPointerCapture).toHaveBeenCalledWith(4);
    expect(releasePointerCapture).toHaveBeenCalledWith(4);
    act(() => scrubTarget.dispatchEvent(pointerEvent("pointermove", 200)));
    expect(seek).toHaveBeenCalledTimes(3);
  });
});
