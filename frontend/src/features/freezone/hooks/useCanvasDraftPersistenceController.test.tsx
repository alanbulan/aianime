// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredCanvasDraft } from "../application/canvasDraft";
import type { ShotMetadata } from "../shotMetadataStore";
import { useCanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";

const mocks = vi.hoisted(() => ({
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
    viewportBookmarks: [{ id: "bookmark-a", x: 3, y: 4, zoom: 1 }],
    history: { past: [], future: [] },
    userEditsSinceHydrate: 2,
    lastMutationSource: "user_edit",
    pendingClearIntent: false,
  },
  shot: { duration: 12 },
  readDraft: vi.fn(),
  writeDraft: vi.fn(),
  clearDraft: vi.fn(),
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: {
    getState: () => mocks.canvasState,
  },
}));

vi.mock("../shotMetadataStore", () => ({
  useShotMetadataStore: {
    getState: () => ({ shot: mocks.shot }),
  },
}));

vi.mock("../canvasDraftComposition", () => ({
  canvasDraftStorageGateway: {
    readDraft: mocks.readDraft,
    writeDraft: mocks.writeDraft,
    clearDraft: mocks.clearDraft,
  },
}));

function renderController(overrides?: {
  hydrated?: boolean;
  switching?: boolean;
}) {
  const hydratedRef = { current: overrides?.hydrated ?? true };
  const switchingRef = { current: overrides?.switching ?? false };
  const revisionRef = { current: 7 };
  const buildPersistMetadata = vi.fn((shot: ShotMetadata) => ({
    existing: "metadata",
    shotMetadata: shot,
    viewportBookmarks: mocks.canvasState.viewportBookmarks,
  }));
  const hook = renderHook(() =>
    useCanvasDraftPersistenceController({
      project: "project-a",
      canvasId: "canvas-a",
      hydratedRef,
      switchingRef,
      revisionRef,
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
        viewportBookmarks: mocks.canvasState.viewportBookmarks,
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

  it("flushes a pending write once during effect cleanup", () => {
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
    const storedDraft = { canvasId: "canvas-a" } as StoredCanvasDraft;
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
