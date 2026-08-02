// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredCanvasDraft } from "../application/canvasDraft";
import {
  canvasContentSignature,
  type CanvasHydrationEdge,
  type CanvasHydrationNode,
} from "../application/canvasSyncHydration";
import type {
  CanvasSyncStatus,
  PersistedCanvasHistory,
} from "../application/canvasSyncStorage";
import type { CanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";
import type { CanvasSaveController } from "./useCanvasSaveController";
import { createUseCanvasHydrationLifecycle } from "./useCanvasHydrationLifecycle";

interface TestNode extends CanvasHydrationNode {
  id: string;
}

interface TestEdge extends CanvasHydrationEdge {
  id: string;
  source: string;
  target: string;
}

const mocks = {
  canvasState: {
    nodes: [] as TestNode[],
    edges: [] as TestEdge[],
    userEditsSinceHydrate: 0,
    hydrateViewportBookmarks: vi.fn(),
  },
  acquireHydrateFlight: vi.fn(),
  releaseHydrateFlight: vi.fn(),
  captureConflict: vi.fn(),
  scheduleDraftPrune: vi.fn(),
  setFreezoneCanvasMetadata: vi.fn(),
  readHistory: vi.fn(),
  clearHistory: vi.fn(),
  readViewport: vi.fn(),
  consumeQueuedProjections: vi.fn(),
  hydrateShotMetadata: vi.fn(),
  scheduleFrame: vi.fn((callback: () => void) => {
    callback();
    return 1;
  }),
};

const useCanvasHydrationLifecycle = createUseCanvasHydrationLifecycle<
  TestNode,
  TestEdge
>({
  store: { read: () => mocks.canvasState },
  hydrateFlights: {
    acquire: (project, canvasId, reloadKey) =>
      mocks.acquireHydrateFlight(project, canvasId, reloadKey),
  },
  syncStorage: {
    readHistory: <TNode, TEdge>(project: string, canvasId: string) =>
      mocks.readHistory(project, canvasId) as PersistedCanvasHistory<
        TNode,
        TEdge
      > | null,
    clearHistory: (project, canvasId) =>
      mocks.clearHistory(project, canvasId),
    readViewport: (project, canvasId) =>
      mocks.readViewport(project, canvasId),
  },
  conflictRecovery: {
    capture: (args) => mocks.captureConflict(args),
  },
  scheduleDraftPrune: mocks.scheduleDraftPrune,
  publishCanvasMetadata: mocks.setFreezoneCanvasMetadata,
  shotMetadataState: {
    hydrate: mocks.hydrateShotMetadata,
  },
  consumeQueuedProjections: mocks.consumeQueuedProjections,
  scheduleFrame: mocks.scheduleFrame,
});

function storedDraft(
  overrides: Partial<StoredCanvasDraft<TestNode, TestEdge>> = {},
): StoredCanvasDraft<TestNode, TestEdge> {
  return {
    version: 1,
    project: "project-a",
    canvasId: "canvas-a",
    baseRevision: 7,
    nodes: [{ id: "draft-node" }],
    edges: [],
    viewport: null,
    metadata: null,
    history: null,
    mutation: {
      userEditsSinceHydrate: 1,
      lastMutationSource: "user_edit",
      pendingClearIntent: false,
    },
    updatedAt: Date.parse("2026-07-28T08:00:00.000Z"),
    signature: "draft-signature",
    ...overrides,
  };
}

function createDraftPersistence(): CanvasDraftPersistenceController<
  TestNode,
  TestEdge
> {
  return {
    persistNow: vi.fn(() => true),
    scheduleWrite: vi.fn(),
    flushPendingWrite: vi.fn(),
    cancelPendingWrite: vi.fn(),
    clearAfterSave: vi.fn(),
    readStored: vi.fn<() => StoredCanvasDraft<TestNode, TestEdge> | null>(
      () => null,
    ),
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

function renderLifecycle() {
  const revisionRef = { current: 7 as number | null };
  const canvasEnvelopeRef = { current: {} };
  const lastSignatureRef = { current: "previous" as string | null };
  const lastRemoteNodeCountRef = { current: 3 };
  const metadataRef = {
    current: { previous: true } as Record<string, unknown> | null,
  };
  const hydratedRef = { current: true };
  const switchingRef = { current: false };
  const lastSavedViewportRef = {
    current: null as null | { x: number; y: number; zoom: number },
  };
  const draftPersistence = createDraftPersistence();
  const saveController = createSaveController();
  const setCanvasData = vi.fn((nodes: TestNode[], edges: TestEdge[]) => {
    mocks.canvasState.nodes = nodes;
    mocks.canvasState.edges = edges;
  });
  const hydrateCanvasDraft = vi.fn();
  const restoreHistory = vi.fn();
  const setViewportState = vi.fn();
  const viewportPort = { setViewport: vi.fn() };
  const setRevision = vi.fn();
  const setMetadata = vi.fn();
  const setHydratedCanvasId = vi.fn();
  const setBackupStatus = vi.fn();
  const statusRef: { current: CanvasSyncStatus } = { current: "ready" };
  const setStatus = vi.fn((status: CanvasSyncStatus) => {
    statusRef.current = status;
  });
  const setError = vi.fn();
  const hook = renderHook(() =>
    useCanvasHydrationLifecycle({
      project: "project-a",
      canvasId: "canvas-a",
      reloadKey: 2,
      revisionRef,
      canvasEnvelopeRef,
      lastSignatureRef,
      lastRemoteNodeCountRef,
      metadataRef,
      hydratedRef,
      switchingRef,
      lastSavedViewportRef,
      draftPersistence,
      readSaveController: () => saveController,
      setCanvasData,
      hydrateCanvasDraft,
      restoreHistory,
      setViewportState,
      viewportPort,
      setRevision,
      setMetadata,
      setHydratedCanvasId,
      setBackupStatus,
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
    lastSavedViewportRef,
    draftPersistence,
    saveController,
    setCanvasData,
    hydrateCanvasDraft,
    restoreHistory,
    setViewportState,
    viewportPort,
    setRevision,
    setMetadata,
    setHydratedCanvasId,
    setBackupStatus,
    statusRef,
    setStatus,
    setError,
  };
}

async function settleHydration(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("canvas hydration lifecycle", () => {
  beforeEach(() => {
    mocks.canvasState.nodes = [];
    mocks.canvasState.edges = [];
    mocks.canvasState.userEditsSinceHydrate = 0;
    mocks.canvasState.hydrateViewportBookmarks.mockReset();
    mocks.acquireHydrateFlight.mockReset();
    mocks.releaseHydrateFlight.mockReset();
    mocks.captureConflict.mockReset();
    mocks.scheduleDraftPrune.mockReset();
    mocks.setFreezoneCanvasMetadata.mockReset();
    mocks.readHistory.mockReset().mockReturnValue(null);
    mocks.clearHistory.mockReset();
    mocks.readViewport.mockReset().mockReturnValue(null);
    mocks.consumeQueuedProjections.mockReset();
    mocks.hydrateShotMetadata.mockReset();
    mocks.scheduleFrame.mockClear();
  });

  it("hydrates remote canvas state, matching history, viewport, and metadata", async () => {
    const remoteNode: TestNode = {
      id: "remote-node",
      type: "uploadNode",
      position: { x: 10, y: 20 },
      data: { imageUrl: "/static/remote.png" },
    };
    const metadata = {
      shotMetadata: { angle: "low angle" },
      viewportBookmarks: [{ id: "bookmark-a", x: 1, y: 2, zoom: 1 }],
    };
    const viewport = { x: 30, y: 40, zoom: 1.5 };
    mocks.readHistory.mockReturnValue({
      signature: canvasContentSignature([remoteNode], []),
      past: [{ nodes: [], edges: [] }],
      future: [],
    });
    mocks.readViewport.mockReturnValue(viewport);
    mocks.acquireHydrateFlight.mockReturnValue({
      promise: Promise.resolve({
        nodes: [remoteNode],
        edges: [],
        revision: 9,
        metadata,
      }),
      release: mocks.releaseHydrateFlight,
    });

    const hook = renderLifecycle();
    expect(mocks.scheduleDraftPrune).toHaveBeenCalledTimes(1);
    expect(mocks.acquireHydrateFlight).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
      2,
    );
    expect(hook.setStatus).toHaveBeenCalledWith("loading");
    expect(hook.draftPersistence.resetPersistedSignature).toHaveBeenCalled();
    expect(hook.saveController.resetIdentity).toHaveBeenCalled();

    await settleHydration();
    expect(hook.setCanvasData).toHaveBeenCalledWith([remoteNode], []);
    expect(hook.revisionRef.current).toBe(9);
    expect(hook.canvasEnvelopeRef.current).toMatchObject({ revision: 9 });
    expect(hook.lastRemoteNodeCountRef.current).toBe(1);
    expect(hook.draftPersistence.markPersisted).toHaveBeenCalledOnce();
    expect(hook.restoreHistory).toHaveBeenCalledWith({
      past: [{ nodes: [], edges: [] }],
      future: [],
    });
    expect(mocks.clearHistory).toHaveBeenCalledWith("project-a", "canvas-a");
    expect(hook.setViewportState).toHaveBeenCalledWith(viewport);
    expect(hook.viewportPort.setViewport).toHaveBeenCalledWith(viewport, {
      duration: 0,
    });
    expect(hook.setMetadata).toHaveBeenCalledWith(metadata);
    expect(mocks.hydrateShotMetadata).toHaveBeenCalledWith(
      metadata.shotMetadata,
    );
    expect(hook.hydratedRef.current).toBe(true);
    expect(hook.switchingRef.current).toBe(false);
    expect(hook.setHydratedCanvasId).toHaveBeenCalledWith("canvas-a");
    expect(hook.statusRef.current).toBe("ready");
    expect(mocks.consumeQueuedProjections).toHaveBeenCalledWith(
      "project-a",
      "canvas-a",
    );

    hook.unmount();
    expect(mocks.releaseHydrateFlight).toHaveBeenCalledTimes(1);
    expect(mocks.setFreezoneCanvasMetadata).toHaveBeenLastCalledWith(null);
  });

  it("restores a same-revision draft with its own history and viewport", async () => {
    const draftViewport = { x: 5, y: 6, zoom: 1.2 };
    const draft = storedDraft({
      viewport: draftViewport,
      metadata: { shotMetadata: { angle: "high angle" } },
      history: { past: [{ nodes: [], edges: [] }], future: [] },
    });
    mocks.acquireHydrateFlight.mockReturnValue({
      promise: Promise.resolve({ nodes: [], edges: [], revision: 7 }),
      release: mocks.releaseHydrateFlight,
    });

    const hook = renderLifecycle();
    vi.mocked(hook.draftPersistence.readStored).mockReturnValue(draft);
    await settleHydration();
    expect(hook.hydrateCanvasDraft).toHaveBeenCalledWith({
      nodes: draft.nodes,
      edges: draft.edges,
      history: draft.history,
      mutation: draft.mutation,
    });
    expect(hook.setCanvasData).not.toHaveBeenCalled();
    expect(hook.setViewportState).toHaveBeenCalledWith(draftViewport);
    expect(mocks.clearHistory).toHaveBeenCalledWith("project-a", "canvas-a");
    expect(hook.statusRef.current).toBe("ready");
    expect(mocks.consumeQueuedProjections).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("captures a conflicting draft and exposes conflict status", async () => {
    const draft = storedDraft({ baseRevision: 7 });
    mocks.acquireHydrateFlight.mockReturnValue({
      promise: Promise.resolve({ nodes: [], edges: [], revision: 9 }),
      release: mocks.releaseHydrateFlight,
    });

    const hook = renderLifecycle();
    vi.mocked(hook.draftPersistence.readStored).mockReturnValue(draft);
    await settleHydration();
    expect(mocks.captureConflict).toHaveBeenCalledWith({
      canvasId: "canvas-a",
      nodes: draft.nodes,
      edges: draft.edges,
      viewport: null,
      metadata: null,
      timestamp: "2026-07-28T08:00:00.000Z",
    });
    expect(hook.setError).toHaveBeenCalledWith(
      "本地有未同步的画布草稿，但服务器版本已经变化。请保存副本或丢弃本地草稿后继续。",
    );
    expect(hook.statusRef.current).toBe("conflict");
    expect(mocks.consumeQueuedProjections).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("keeps the canvas non-hydrated when the remote flight fails", async () => {
    mocks.acquireHydrateFlight.mockReturnValue({
      promise: Promise.reject(new Error("hydrate failed")),
      release: mocks.releaseHydrateFlight,
    });

    const hook = renderLifecycle();
    await settleHydration();
    expect(hook.hydratedRef.current).toBe(false);
    expect(hook.switchingRef.current).toBe(false);
    expect(hook.setRevision).toHaveBeenLastCalledWith(null);
    expect(hook.setHydratedCanvasId).toHaveBeenLastCalledWith(null);
    expect(hook.setError).toHaveBeenCalledWith("hydrate failed");
    expect(hook.statusRef.current).toBe("error");

    hook.unmount();
  });
});
