// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasSyncStatus } from "../application/canvasSyncStorage";
import type { CanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";
import type { CanvasSaveController } from "./useCanvasSaveController";
import { useCanvasRuntimeBridge } from "./useCanvasRuntimeBridge";

const mocks = vi.hoisted(() => ({
  canvasState: {
    nodes: [
      {
        id: "local-node",
        type: "uploadNode",
        position: { x: 10, y: 20 },
        data: { imageUrl: "/static/local.png" },
      },
    ],
    edges: [],
    hydrateViewportBookmarks: vi.fn(),
  },
  handlers: null as null | {
    apply: (remote: any, merge?: (...args: any[]) => any) => void;
    flush: () => Promise<boolean>;
    applyProjection: (projection: any) => boolean;
    removeProjection: (projectionKey: string) => boolean;
  },
  registerRuntime: vi.fn(),
  unregisterRuntime: vi.fn(),
  setFreezoneCanvasMetadata: vi.fn(),
  mergeProjectedCanvas: vi.fn(),
  mergeProjectionMetadata: vi.fn(),
  removeProjectionFromCanvas: vi.fn(),
  removeProjectionMetadata: vi.fn(),
  hydrateShotMetadata: vi.fn(),
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: {
    getState: () => mocks.canvasState,
  },
}));

vi.mock("../canvasSyncRuntime", () => ({
  registerFreezoneCanvasRuntime: mocks.registerRuntime,
}));

vi.mock("../canvasMetadataContext", () => ({
  setFreezoneCanvasMetadata: mocks.setFreezoneCanvasMetadata,
}));

vi.mock("../application/canvasProjectionGraph", () => ({
  mergeProjectedCanvasWithLocalCanvas: mocks.mergeProjectedCanvas,
  removeProjectionFromLocalCanvas: mocks.removeProjectionFromCanvas,
}));

vi.mock("../domain/canvasProjectionMetadata", () => ({
  mergeProjectionMetadata: mocks.mergeProjectionMetadata,
  removeProjectionMetadata: mocks.removeProjectionMetadata,
}));

vi.mock("../shotMetadataStore", () => ({
  EMPTY_SHOT_METADATA: {},
  useShotMetadataStore: {
    getState: () => ({ hydrate: mocks.hydrateShotMetadata }),
  },
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
    lastPersistedSignature: vi.fn(() => null),
  };
}

function createSaveController(): CanvasSaveController {
  return {
    saveCurrent: vi.fn(async () => true),
    flush: vi.fn(async () => true),
    cancelPendingSave: vi.fn(),
    resetIdentity: vi.fn(),
    saveBeforeUnload: vi.fn(),
  };
}

function renderBridge() {
  const revisionRef = { current: 7 as number | null };
  const canvasEnvelopeRef = { current: {} };
  const lastSignatureRef = { current: null as string | null };
  const lastRemoteNodeCountRef = { current: 0 };
  const metadataRef = { current: null as Record<string, unknown> | null };
  const hydratedRef = { current: true };
  const switchingRef = { current: false };
  const statusRef: { current: CanvasSyncStatus } = { current: "ready" };
  const suppressNextCanvasAutosaveRef = { current: false };
  const draftPersistence = createDraftPersistence();
  const saveController = createSaveController();
  const setCanvasData = vi.fn();
  const applyCanvasDataEdit = vi.fn();
  const setRevision = vi.fn();
  const setMetadata = vi.fn();
  const setHydratedCanvasId = vi.fn();
  const setStatus = vi.fn((status: CanvasSyncStatus) => {
    statusRef.current = status;
  });
  const setError = vi.fn();
  const hook = renderHook(() =>
    useCanvasRuntimeBridge({
      project: "project-a",
      canvasId: "canvas-a",
      revisionRef,
      canvasEnvelopeRef,
      lastSignatureRef,
      lastRemoteNodeCountRef,
      metadataRef,
      hydratedRef,
      switchingRef,
      statusRef,
      suppressNextCanvasAutosaveRef,
      draftPersistence,
      readSaveController: () => saveController,
      setCanvasData,
      applyCanvasDataEdit,
      setRevision,
      setMetadata,
      setHydratedCanvasId,
      setStatus,
      setError,
    }),
  );
  return {
    ...hook,
    revisionRef,
    canvasEnvelopeRef,
    lastSignatureRef,
    lastRemoteNodeCountRef,
    metadataRef,
    hydratedRef,
    switchingRef,
    statusRef,
    suppressNextCanvasAutosaveRef,
    draftPersistence,
    saveController,
    setCanvasData,
    applyCanvasDataEdit,
    setRevision,
    setMetadata,
    setHydratedCanvasId,
    setStatus,
    setError,
  };
}

describe("canvas runtime bridge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.handlers = null;
    mocks.unregisterRuntime.mockReset();
    mocks.registerRuntime.mockReset().mockImplementation(
      (_project, _canvasId, apply, flush, applyProjection, removeProjection) => {
        mocks.handlers = {
          apply,
          flush,
          applyProjection,
          removeProjection,
        };
        return mocks.unregisterRuntime;
      },
    );
    mocks.setFreezoneCanvasMetadata.mockReset();
    mocks.mergeProjectedCanvas.mockReset().mockReturnValue({
      nodes: [{ id: "projected-node" }],
      edges: [],
    });
    mocks.mergeProjectionMetadata.mockReset().mockReturnValue({
      projections: { "beat:1:4": { projection_key: "beat:1:4" } },
    });
    mocks.removeProjectionFromCanvas.mockReset().mockReturnValue({
      nodes: [],
      edges: [],
    });
    mocks.removeProjectionMetadata.mockReset().mockReturnValue({
      projections: {},
    });
    mocks.hydrateShotMetadata.mockReset();
    mocks.canvasState.hydrateViewportBookmarks.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers one runtime with flush and unregisters on cleanup", async () => {
    const hook = renderBridge();

    expect(mocks.registerRuntime).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
    await expect(mocks.handlers?.flush()).resolves.toBe(true);
    expect(hook.saveController.flush).toHaveBeenCalledTimes(1);

    hook.unmount();
    expect(mocks.unregisterRuntime).toHaveBeenCalledTimes(1);
  });

  it("applies a remote replacement and resets save baselines", () => {
    const hook = renderBridge();
    const remoteNode = {
      id: "remote-node",
      type: "uploadNode",
      position: { x: 30, y: 40 },
      data: { imageUrl: "/static/remote.png" },
    };
    const metadata = {
      shotMetadata: { duration: 8 },
      viewportBookmarks: [{ id: "bookmark-a", x: 1, y: 2, zoom: 1 }],
    };

    act(() => {
      mocks.handlers?.apply({
        nodes: [remoteNode],
        edges: [],
        revision: 9,
        metadata,
      });
    });
    expect(hook.saveController.cancelPendingSave).toHaveBeenCalledTimes(1);
    expect(hook.saveController.resetIdentity).toHaveBeenCalledTimes(1);
    expect(hook.draftPersistence.clearStored).toHaveBeenCalledTimes(1);
    expect(hook.revisionRef.current).toBe(9);
    expect(hook.lastRemoteNodeCountRef.current).toBe(1);
    expect(hook.metadataRef.current).toBe(metadata);
    expect(hook.setCanvasData).toHaveBeenCalledWith([remoteNode], []);
    expect(hook.setRevision).toHaveBeenCalledWith(9);
    expect(hook.setMetadata).toHaveBeenCalledWith(metadata);
    expect(mocks.setFreezoneCanvasMetadata).toHaveBeenCalledWith(metadata);
    expect(mocks.canvasState.hydrateViewportBookmarks).toHaveBeenCalledWith(
      metadata.viewportBookmarks,
    );
    expect(mocks.hydrateShotMetadata).toHaveBeenCalledWith(
      metadata.shotMetadata,
    );
    expect(hook.setStatus).toHaveBeenCalledWith("ready");
    expect(hook.setError).toHaveBeenCalledWith(null);
    expect(hook.hydratedRef.current).toBe(true);
    expect(hook.switchingRef.current).toBe(false);
    expect(hook.setHydratedCanvasId).toHaveBeenCalledWith("canvas-a");
    expect(hook.saveController.saveCurrent).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("saves merged local work immediately after a remote refresh", async () => {
    const hook = renderBridge();
    const remoteNode = {
      id: "remote-node",
      type: "uploadNode",
      position: { x: 0, y: 0 },
      data: {},
    };
    const mergedNode = { ...remoteNode, id: "merged-node" };

    act(() => {
      mocks.handlers?.apply(
        { nodes: [remoteNode], edges: [], revision: 9 },
        () => ({ nodes: [mergedNode], edges: [] }),
      );
    });
    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(hook.setCanvasData).toHaveBeenCalledWith([mergedNode], []);
    expect(hook.saveController.saveCurrent).toHaveBeenCalledTimes(1);

    hook.unmount();
  });

  it("applies and immediately persists a local projection", async () => {
    const hook = renderBridge();
    const projection = {
      projectionKey: "beat:1:4",
      nodes: [{ id: "projection-node" }],
      edges: [],
      metadata: { projections: {} },
    };

    expect(mocks.handlers?.applyProjection(projection)).toBe(true);
    expect(hook.suppressNextCanvasAutosaveRef.current).toBe(true);
    expect(hook.applyCanvasDataEdit).toHaveBeenCalledWith(
      [{ id: "projected-node" }],
      [],
    );
    expect(hook.setMetadata).toHaveBeenCalledWith({
      projections: { "beat:1:4": { projection_key: "beat:1:4" } },
    });

    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(hook.draftPersistence.persistNow).toHaveBeenCalledTimes(1);
    expect(hook.saveController.saveCurrent).toHaveBeenCalledTimes(1);

    hook.unmount();
  });

  it("persists projection removal as a local edit but blocks it while switching", async () => {
    const hook = renderBridge();

    expect(mocks.handlers?.removeProjection("beat:1:4")).toBe(true);
    expect(hook.applyCanvasDataEdit).toHaveBeenCalledWith([], []);
    expect(hook.setMetadata).toHaveBeenCalledWith({ projections: {} });

    await act(async () => {
      vi.advanceTimersByTime(0);
      await Promise.resolve();
    });
    expect(hook.draftPersistence.persistNow).toHaveBeenCalledTimes(1);
    expect(hook.saveController.saveCurrent).toHaveBeenCalledTimes(1);

    hook.switchingRef.current = true;
    expect(mocks.handlers?.removeProjection("beat:1:4")).toBe(false);
    expect(hook.applyCanvasDataEdit).toHaveBeenCalledTimes(1);

    hook.unmount();
  });
});
