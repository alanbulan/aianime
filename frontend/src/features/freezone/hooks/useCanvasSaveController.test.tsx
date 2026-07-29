// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasSyncStatus } from "../application/canvasSyncStorage";
import type { ShotMetadata } from "../domain/shotMetadata";
import type { CanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";
import { useCanvasSaveController } from "./useCanvasSaveController";

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
    viewportBookmarks: [],
    userEditsSinceHydrate: 2,
    lastMutationSource: "user_edit",
    pendingClearIntent: false,
  },
  shot: { duration: 12 },
  canvasListener: null as null | ((state: any, previous: any) => void),
  shotListener: null as null | (() => void),
  subscribeCanvas: vi.fn(),
  subscribeShot: vi.fn(),
  unsubscribeCanvas: vi.fn(),
  unsubscribeShot: vi.fn(),
  scheduleCanvasSave: vi.fn(),
  saveCanvasBeforeUnload: vi.fn(),
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: {
    getState: () => mocks.canvasState,
    subscribe: mocks.subscribeCanvas,
  },
}));

vi.mock("../shotMetadataComposition", () => ({
  shotMetadataState: {
    getShot: () => mocks.shot,
    subscribe: mocks.subscribeShot,
  },
}));

vi.mock("../canvasSaveComposition", () => ({
  scheduleCanvasSave: mocks.scheduleCanvasSave,
}));

vi.mock("../canvasUnloadSaveComposition", () => ({
  saveCanvasBeforeUnload: mocks.saveCanvasBeforeUnload,
}));

function createDraftPersistence(): CanvasDraftPersistenceController {
  return {
    persistNow: vi.fn(() => true),
    scheduleWrite: vi.fn(),
    flushPendingWrite: vi.fn(),
    cancelPendingWrite: vi.fn(),
    clearAfterSave: vi.fn(),
    readStored: vi.fn(() => null),
    clearStored: vi.fn(),
    resetPersistedSignature: vi.fn(),
    markPersisted: vi.fn(),
    hasPendingWrite: vi.fn(() => false),
    lastPersistedSignature: vi.fn(() => "draft-signature-a"),
  };
}

function renderController() {
  const revisionRef = { current: 7 as number | null };
  const canvasEnvelopeRef = { current: { revision: 7 } };
  const hydratedRef = { current: true };
  const switchingRef = { current: false };
  const lastRemoteNodeCountRef = { current: 1 };
  const statusRef: { current: CanvasSyncStatus } = { current: "ready" };
  const lastSignatureRef = { current: null as string | null };
  const suppressNextCanvasAutosaveRef = { current: false };
  const lastSavedViewportRef = {
    current: null as null | { x: number; y: number; zoom: number },
  };
  const draftPersistence = createDraftPersistence();
  const buildPersistMetadata = vi.fn((shot: ShotMetadata) => ({
    shotMetadata: shot,
    viewportBookmarks: mocks.canvasState.viewportBookmarks,
  }));
  const setStatus = vi.fn();
  const setError = vi.fn();
  const publishBackupStatus = vi.fn();
  const publishRevision = vi.fn();
  const hook = renderHook(() =>
    useCanvasSaveController({
      project: "project-a",
      canvasId: "canvas-a",
      revisionRef,
      canvasEnvelopeRef,
      hydratedRef,
      switchingRef,
      lastRemoteNodeCountRef,
      statusRef,
      lastSignatureRef,
      suppressNextCanvasAutosaveRef,
      lastSavedViewportRef,
      draftPersistence,
      buildPersistMetadata,
      setStatus,
      setError,
      publishBackupStatus,
      publishRevision,
    }),
  );
  return {
    ...hook,
    revisionRef,
    canvasEnvelopeRef,
    hydratedRef,
    switchingRef,
    lastRemoteNodeCountRef,
    statusRef,
    lastSignatureRef,
    suppressNextCanvasAutosaveRef,
    lastSavedViewportRef,
    draftPersistence,
    buildPersistMetadata,
  };
}

describe("canvas save controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.canvasListener = null;
    mocks.shotListener = null;
    mocks.unsubscribeCanvas.mockReset();
    mocks.unsubscribeShot.mockReset();
    mocks.subscribeCanvas.mockReset().mockImplementation((listener) => {
      mocks.canvasListener = listener;
      return mocks.unsubscribeCanvas;
    });
    mocks.subscribeShot.mockReset().mockImplementation((listener) => {
      mocks.shotListener = listener;
      return mocks.unsubscribeShot;
    });
    mocks.scheduleCanvasSave.mockReset().mockResolvedValue(true);
    mocks.saveCanvasBeforeUnload.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces persisted canvas changes for 800 ms", async () => {
    const hook = renderController();
    const previous = { ...mocks.canvasState, nodes: [] };

    act(() => {
      mocks.canvasListener?.(mocks.canvasState, previous);
      vi.advanceTimersByTime(799);
    });
    expect(hook.draftPersistence.scheduleWrite).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleCanvasSave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(mocks.scheduleCanvasSave).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleCanvasSave).toHaveBeenCalledWith(
      expect.objectContaining({
        project: "project-a",
        canvasId: "canvas-a",
        nodes: mocks.canvasState.nodes,
        edges: mocks.canvasState.edges,
        viewport: mocks.canvasState.currentViewport,
        revisionRef: hook.revisionRef,
        canvasEnvelopeRef: hook.canvasEnvelopeRef,
        hydratedRef: hook.hydratedRef,
        switchingRef: hook.switchingRef,
        lastRemoteNodeCountRef: hook.lastRemoteNodeCountRef,
        clearDraftAfterSave: hook.draftPersistence.clearAfterSave,
        markDraftPersisted: hook.draftPersistence.markPersisted,
      }),
    );
    expect(hook.lastSavedViewportRef.current).toBe(
      mocks.canvasState.currentViewport,
    );

    hook.unmount();
  });

  it("consumes a programmatic-save suppression without scheduling a draft", () => {
    const hook = renderController();
    hook.suppressNextCanvasAutosaveRef.current = true;

    act(() => {
      mocks.canvasListener?.(mocks.canvasState, {
        ...mocks.canvasState,
        nodes: [],
      });
      vi.advanceTimersByTime(800);
    });
    expect(hook.suppressNextCanvasAutosaveRef.current).toBe(false);
    expect(hook.lastSignatureRef.current).not.toBeNull();
    expect(hook.draftPersistence.scheduleWrite).not.toHaveBeenCalled();
    expect(mocks.scheduleCanvasSave).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("persists a recovery draft but blocks remote saves in conflict state", () => {
    const hook = renderController();
    hook.statusRef.current = "conflict";

    act(() => {
      mocks.shotListener?.();
      vi.advanceTimersByTime(800);
    });
    expect(hook.draftPersistence.scheduleWrite).toHaveBeenCalledTimes(1);
    expect(mocks.scheduleCanvasSave).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("flushes immediately and cancels the pending debounced save", async () => {
    const hook = renderController();

    act(() => {
      mocks.shotListener?.();
    });
    await act(async () => {
      await hook.result.current.flush();
      vi.advanceTimersByTime(800);
    });
    expect(mocks.scheduleCanvasSave).toHaveBeenCalledTimes(1);

    hook.unmount();
  });

  it("provides unload state and keeps save identity private", () => {
    const hook = renderController();

    act(() => {
      mocks.shotListener?.();
      hook.result.current.saveBeforeUnload();
    });
    expect(mocks.saveCanvasBeforeUnload).toHaveBeenCalledTimes(1);
    const unloadArgs = mocks.saveCanvasBeforeUnload.mock.calls[0][0];
    expect(unloadArgs).toMatchObject({
      project: "project-a",
      canvasId: "canvas-a",
      revision: 7,
      hydrated: true,
      switching: false,
      hasUnsettledContentSave: true,
      hasPendingContentSave: true,
      lastPersistedDraftSignature: "draft-signature-a",
    });
    expect(unloadArgs.cancelPendingDraft).toBe(
      hook.draftPersistence.cancelPendingWrite,
    );
    expect(unloadArgs.persistDraft).toBe(hook.draftPersistence.persistNow);

    unloadArgs.pendingClientSaveIdRef.current = "save-a";
    unloadArgs.pendingClientSaveIdSignatureRef.current = "signature-a";
    hook.result.current.resetIdentity();
    expect(unloadArgs.pendingClientSaveIdRef.current).toBeNull();
    expect(unloadArgs.pendingClientSaveIdSignatureRef.current).toBeNull();

    act(() => {
      unloadArgs.cancelPendingContentSave();
      vi.advanceTimersByTime(800);
    });
    expect(mocks.scheduleCanvasSave).not.toHaveBeenCalled();

    hook.unmount();
    expect(hook.draftPersistence.flushPendingWrite).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribeCanvas).toHaveBeenCalledTimes(1);
    expect(mocks.unsubscribeShot).toHaveBeenCalledTimes(1);
  });
});
