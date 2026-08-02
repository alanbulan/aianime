// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CanvasDraftPersistenceState,
  CanvasDraftPersistenceStore,
} from "./useCanvasDraftPersistenceController";
import { createUseCanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";

const mocks = {
  canvasState: {
    nodes: [
      {
        id: "node-a",
        type: "uploadNode",
        position: { x: 10, y: 20 },
        data: { imageUrl: "/static/node-a.png" },
      },
    ],
    edges: [],
    currentViewport: { x: 1, y: 2, zoom: 1.25 },
    history: { past: [], future: [] },
    userEditsSinceHydrate: 2,
    lastMutationSource: "user_edit" as const,
    pendingClearIntent: false,
  } satisfies CanvasDraftPersistenceState,
  shot: { shot_type: "medium" },
  readDraft: vi.fn(),
  writeDraft: vi.fn(),
  clearDraft: vi.fn(),
};

const store: CanvasDraftPersistenceStore = {
  read: () => mocks.canvasState,
};

const useCanvasDraftPersistenceController =
  createUseCanvasDraftPersistenceController({
    storage: {
      readDraft: (project, canvasId) => mocks.readDraft(project, canvasId),
      writeDraft: (project, canvasId, input) =>
        mocks.writeDraft(project, canvasId, input),
      clearDraft: (project, canvasId) =>
        mocks.clearDraft(project, canvasId),
    },
    readShotMetadata: () => mocks.shot,
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
    cancelScheduled: (handle) => window.clearTimeout(handle as number),
    now: () => Date.now(),
  });

function renderController(overrides?: {
  hydrated?: boolean;
  switching?: boolean;
}) {
  const hydratedRef = { current: overrides?.hydrated ?? true };
  const switchingRef = { current: overrides?.switching ?? false };
  const revisionRef = { current: 7 };
  const buildPersistMetadata = vi.fn((shot: typeof mocks.shot) => ({
    existing: "metadata",
    shotMetadata: shot,
    viewportBookmarks: [{ id: "bookmark-a", x: 3, y: 4, zoom: 1 }],
  }));
  const hook = renderHook(() =>
    useCanvasDraftPersistenceController({
      project: "project-a",
      canvasId: "canvas-a",
      hydratedRef,
      switchingRef,
      revisionRef,
      store,
      buildPersistMetadata,
    }),
  );
  return {
    ...hook,
    hydratedRef,
    switchingRef,
    buildPersistMetadata,
  };
}

describe("canvas draft persistence controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T08:00:00.000Z"));
    mocks.readDraft.mockReset();
    mocks.writeDraft.mockReset().mockReturnValue(true);
    mocks.clearDraft.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks draft writes before hydrate and during canvas switching", () => {
    const hook = renderController({ hydrated: false });

    expect(hook.result.current.persistNow()).toBe(false);
    hook.hydratedRef.current = true;
    hook.switchingRef.current = true;
    expect(hook.result.current.persistNow()).toBe(false);
    expect(mocks.writeDraft).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("debounces writes for 300 ms and persists the complete recovery payload", () => {
    const hook = renderController();

    act(() => {
      hook.result.current.scheduleWrite();
      vi.advanceTimersByTime(200);
      hook.result.current.scheduleWrite();
      vi.advanceTimersByTime(299);
    });
    expect(mocks.writeDraft).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(mocks.writeDraft).toHaveBeenCalledTimes(1);
    expect(mocks.writeDraft).toHaveBeenCalledWith("project-a", "canvas-a", {
      baseRevision: 7,
      nodes: mocks.canvasState.nodes,
      edges: mocks.canvasState.edges,
      viewport: mocks.canvasState.currentViewport,
      metadata: {
        existing: "metadata",
        shotMetadata: mocks.shot,
        viewportBookmarks: [{ id: "bookmark-a", x: 3, y: 4, zoom: 1 }],
      },
      history: mocks.canvasState.history,
      mutation: {
        userEditsSinceHydrate: 2,
        lastMutationSource: "user_edit",
        pendingClearIntent: false,
      },
      updatedAt: Date.now(),
    });
    expect(hook.buildPersistMetadata).toHaveBeenCalledWith(mocks.shot);
    expect(hook.result.current.hasPendingWrite()).toBe(false);

    hook.unmount();
  });

  it("flushes a pending write once", () => {
    const hook = renderController();

    act(() => {
      hook.result.current.scheduleWrite();
    });
    expect(hook.result.current.hasPendingWrite()).toBe(true);

    act(() => {
      hook.result.current.flushPendingWrite();
      vi.advanceTimersByTime(300);
    });
    expect(mocks.writeDraft).toHaveBeenCalledTimes(1);
    expect(hook.result.current.hasPendingWrite()).toBe(false);

    hook.unmount();
  });

  it("owns stored-draft cleanup and the last persisted signature", () => {
    const storedDraft = { canvasId: "canvas-a" };
    mocks.readDraft.mockReturnValue(storedDraft);
    const hook = renderController();

    expect(hook.result.current.readStored()).toBe(storedDraft);
    hook.result.current.markPersisted("signature-a");
    expect(hook.result.current.lastPersistedSignature()).toBe("signature-a");

    act(() => {
      hook.result.current.scheduleWrite();
      hook.result.current.clearAfterSave();
      vi.advanceTimersByTime(300);
    });
    expect(mocks.clearDraft).toHaveBeenCalledWith("project-a", "canvas-a");
    expect(mocks.writeDraft).not.toHaveBeenCalled();

    hook.result.current.resetPersistedSignature();
    expect(hook.result.current.lastPersistedSignature()).toBeNull();

    hook.result.current.clearStored();
    expect(mocks.clearDraft).toHaveBeenCalledTimes(2);

    hook.unmount();
  });
});
