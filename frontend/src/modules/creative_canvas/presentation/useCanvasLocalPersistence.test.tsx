// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasLocalPersistenceState } from "./useCanvasLocalPersistence";
import { createCanvasLocalPersistenceHooks } from "./useCanvasLocalPersistence";

function createStore(initial: CanvasLocalPersistenceState) {
  let state = initial;
  const listeners = new Set<
    (
      state: CanvasLocalPersistenceState,
      previous: CanvasLocalPersistenceState,
    ) => void
  >();

  return {
    port: {
      read: () => state,
      subscribe: (
        listener: (
          state: CanvasLocalPersistenceState,
          previous: CanvasLocalPersistenceState,
        ) => void,
      ) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    update(patch: Partial<CanvasLocalPersistenceState>) {
      const previous = state;
      state = { ...state, ...patch };
      for (const listener of listeners) listener(state, previous);
    },
  };
}

describe("canvas local persistence hooks", () => {
  const writeHistory = vi.fn();
  const writeViewport = vi.fn();
  let store: ReturnType<typeof createStore>;
  let hooks: ReturnType<typeof createCanvasLocalPersistenceHooks>;

  beforeEach(() => {
    vi.useFakeTimers();
    writeHistory.mockReset();
    writeViewport.mockReset();
    store = createStore({
      nodes: [{ id: "node-a" }],
      edges: [],
      history: { past: [], future: [] },
      userEditsSinceHydrate: 0,
      currentViewport: { x: 0, y: 0, zoom: 1 },
    });
    hooks = createCanvasLocalPersistenceHooks({
      storage: { writeHistory, writeViewport },
      contentSignature: () => "canvas-signature",
      schedule: (callback, delayMs) =>
        window.setTimeout(callback, delayMs),
      cancelScheduled: (handle) => window.clearTimeout(handle as number),
      addBeforeUnload: (listener) =>
        window.addEventListener("beforeunload", listener),
      removeBeforeUnload: (listener) =>
        window.removeEventListener("beforeunload", listener),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces edited history and flushes the latest state before unload", () => {
    const hydratedRef = { current: true };
    const switchingRef = { current: false };
    const hook = renderHook(() =>
      hooks.useCanvasHistoryPersistence({
        project: "project-a",
        canvasId: "canvas-a",
        hydratedRef,
        switchingRef,
        store: store.port,
      }),
    );
    const firstHistory = {
      past: [{ nodes: [], edges: [] }],
      future: [],
    };

    act(() => {
      store.update({
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
      "canvas-signature",
      firstHistory,
    );

    writeHistory.mockClear();
    const latestHistory = {
      past: [...firstHistory.past, { nodes: [], edges: [] }],
      future: [],
    };
    act(() => {
      store.update({ history: latestHistory });
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(writeHistory).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      "canvas-signature",
      latestHistory,
    );

    hook.unmount();
  });

  it("does not persist history before hydrate or during a canvas switch", () => {
    const hydratedRef = { current: false };
    const switchingRef = { current: false };
    const hook = renderHook(() =>
      hooks.useCanvasHistoryPersistence({
        project: "project-a",
        canvasId: "canvas-a",
        hydratedRef,
        switchingRef,
        store: store.port,
      }),
    );

    act(() => {
      store.update({
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
    const lastSavedViewportRef = {
      current: { x: 0, y: 0, zoom: 1 },
    };
    const hook = renderHook(() =>
      hooks.useCanvasViewportPersistence({
        project: "project-a",
        canvasId: "canvas-a",
        status: "ready",
        lastSavedViewportRef,
        store: store.port,
      }),
    );
    const viewport = { x: 10, y: 20, zoom: 1.5 };

    act(() => {
      store.update({ currentViewport: viewport });
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
      store.update({ currentViewport: { ...viewport } });
      vi.advanceTimersByTime(300);
    });
    expect(writeViewport).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("does not subscribe to viewport persistence before sync is ready", () => {
    const hook = renderHook(() =>
      hooks.useCanvasViewportPersistence({
        project: "project-a",
        canvasId: "canvas-a",
        status: "loading",
        lastSavedViewportRef: { current: null },
        store: store.port,
      }),
    );

    act(() => {
      store.update({ currentViewport: { x: 10, y: 20, zoom: 1.5 } });
      vi.advanceTimersByTime(300);
    });
    expect(writeViewport).not.toHaveBeenCalled();

    hook.unmount();
  });
});
