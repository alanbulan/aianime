// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import type { ViewportBookmark } from "@/features/canvas/domain/viewportBookmarks";

import {
  useCanvasHistoryPersistence,
  useCanvasViewportPersistence,
} from "./useCanvasLocalPersistence";

const { writeHistory, writeViewport } = vi.hoisted(() => ({
  writeHistory: vi.fn(),
  writeViewport: vi.fn(),
}));

vi.mock("../canvasSyncComposition", () => ({
  canvasSyncStorageGateway: {
    writeHistory,
    writeViewport,
  },
}));

describe("canvas local persistence hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeHistory.mockReset();
    writeViewport.mockReset();
    useCanvasStore.getState().setCanvasData([], []);
    useCanvasStore.setState({
      history: { past: [], future: [] },
      userEditsSinceHydrate: 0,
      currentViewport: { x: 0, y: 0, zoom: 1 },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces edited history and flushes the latest state before unload", () => {
    const hydratedRef = { current: true };
    const switchingRef = { current: false };
    const hook = renderHook(() =>
      useCanvasHistoryPersistence({
        project: "project-a",
        canvasId: "canvas-a",
        hydratedRef,
        switchingRef,
      }),
    );
    const firstHistory = {
      past: [{ nodes: [], edges: [] }],
      future: [],
    };

    act(() => {
      useCanvasStore.setState({
        history: firstHistory,
        userEditsSinceHydrate: 1,
      });
      vi.advanceTimersByTime(399);
    });
    expect(writeHistory).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(writeHistory).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      expect.any(String),
      firstHistory,
    );

    writeHistory.mockClear();
    const latestHistory = {
      past: [...firstHistory.past, { nodes: [], edges: [] }],
      future: [],
    };
    act(() => {
      useCanvasStore.setState({ history: latestHistory });
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(writeHistory).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      expect.any(String),
      latestHistory,
    );

    hook.unmount();
  });

  it("does not persist history before hydrate or during a canvas switch", () => {
    const hydratedRef = { current: false };
    const switchingRef = { current: false };
    const hook = renderHook(() =>
      useCanvasHistoryPersistence({
        project: "project-a",
        canvasId: "canvas-a",
        hydratedRef,
        switchingRef,
      }),
    );

    act(() => {
      useCanvasStore.setState({
        history: { past: [{ nodes: [], edges: [] }], future: [] },
        userEditsSinceHydrate: 1,
      });
      vi.advanceTimersByTime(400);
    });
    expect(writeHistory).not.toHaveBeenCalled();

    hydratedRef.current = true;
    switchingRef.current = true;
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(writeHistory).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("persists changed ready-state viewports after the existing debounce", () => {
    const lastSavedViewportRef: { current: ViewportBookmark | null } = {
      current: { x: 0, y: 0, zoom: 1 },
    };
    const hook = renderHook(() =>
      useCanvasViewportPersistence({
        project: "project-a",
        canvasId: "canvas-a",
        status: "ready",
        lastSavedViewportRef,
      }),
    );
    const viewport = { x: 10, y: 20, zoom: 1.5 };

    act(() => {
      useCanvasStore.setState({ currentViewport: viewport });
      vi.advanceTimersByTime(299);
    });
    expect(writeViewport).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(writeViewport).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      viewport,
    );
    expect(lastSavedViewportRef.current).toBe(viewport);

    writeViewport.mockClear();
    act(() => {
      useCanvasStore.setState({ currentViewport: { ...viewport } });
      vi.advanceTimersByTime(300);
    });
    expect(writeViewport).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("does not subscribe to viewport persistence before sync is ready", () => {
    const hook = renderHook(() =>
      useCanvasViewportPersistence({
        project: "project-a",
        canvasId: "canvas-a",
        status: "loading",
        lastSavedViewportRef: { current: null },
      }),
    );

    act(() => {
      useCanvasStore.setState({
        currentViewport: { x: 10, y: 20, zoom: 1.5 },
      });
      vi.advanceTimersByTime(300);
    });
    expect(writeViewport).not.toHaveBeenCalled();

    hook.unmount();
  });
});
