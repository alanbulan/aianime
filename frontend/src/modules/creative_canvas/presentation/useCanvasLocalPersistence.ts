// Copyright (c) 2026 AI anime
import { useEffect } from "react";

import type {
  CanvasHydrationEdge,
  CanvasHydrationNode,
} from "../application/canvasSyncHydration";
import type {
  CanvasSyncHistoryState,
  CanvasSyncStatus,
  CanvasSyncStorageGateway,
  CanvasSyncViewport,
} from "../application/canvasSyncStorage";

interface ValueRef<T> {
  current: T;
}

export interface CanvasLocalPersistenceState {
  nodes: CanvasHydrationNode[];
  edges: CanvasHydrationEdge[];
  history: CanvasSyncHistoryState<CanvasHydrationNode, CanvasHydrationEdge>;
  userEditsSinceHydrate: number;
  currentViewport: CanvasSyncViewport;
}

export interface CanvasLocalPersistenceStore {
  read(): CanvasLocalPersistenceState;
  subscribe(
    listener: (
      state: CanvasLocalPersistenceState,
      previous: CanvasLocalPersistenceState,
    ) => void,
  ): () => void;
}

interface CanvasLocalPersistenceDependencies {
  storage: Pick<CanvasSyncStorageGateway, "writeHistory" | "writeViewport">;
  contentSignature(
    nodes: CanvasHydrationNode[],
    edges: CanvasHydrationEdge[],
  ): string;
  schedule(callback: () => void, delayMs: number): unknown;
  cancelScheduled(handle: unknown): void;
  addBeforeUnload(listener: () => void): void;
  removeBeforeUnload(listener: () => void): void;
}

export interface CanvasHistoryPersistenceOptions {
  project: string;
  canvasId: string;
  hydratedRef: ValueRef<boolean>;
  switchingRef: ValueRef<boolean>;
  store: CanvasLocalPersistenceStore;
}

export interface CanvasViewportPersistenceOptions {
  project: string;
  canvasId: string;
  status: CanvasSyncStatus;
  lastSavedViewportRef: ValueRef<CanvasSyncViewport | null>;
  store: CanvasLocalPersistenceStore;
}

function viewportsEqual(
  left: CanvasSyncViewport,
  right: CanvasSyncViewport,
): boolean {
  return (
    left.x === right.x && left.y === right.y && left.zoom === right.zoom
  );
}

export function createCanvasLocalPersistenceHooks(
  dependencies: CanvasLocalPersistenceDependencies,
) {
  function useCanvasHistoryPersistence({
    project,
    canvasId,
    hydratedRef,
    switchingRef,
    store,
  }: CanvasHistoryPersistenceOptions): void {
    useEffect(() => {
      let timer: unknown | null = null;
      const writeNow = () => {
        if (!hydratedRef.current || switchingRef.current) return;
        const state = store.read();
        if (state.userEditsSinceHydrate <= 0) return;
        dependencies.storage.writeHistory(
          project,
          canvasId,
          dependencies.contentSignature(state.nodes, state.edges),
          state.history,
        );
      };
      const unsubscribe = store.subscribe((state, previous) => {
        if (state.history === previous.history) return;
        if (timer != null) dependencies.cancelScheduled(timer);
        timer = dependencies.schedule(writeNow, 400);
      });
      const handleUnload = () => writeNow();
      dependencies.addBeforeUnload(handleUnload);
      return () => {
        unsubscribe();
        dependencies.removeBeforeUnload(handleUnload);
        if (timer != null) dependencies.cancelScheduled(timer);
      };
    }, [canvasId, hydratedRef, project, store, switchingRef]);
  }

  function useCanvasViewportPersistence({
    project,
    canvasId,
    status,
    lastSavedViewportRef,
    store,
  }: CanvasViewportPersistenceOptions): void {
    useEffect(() => {
      if (status !== "ready") return;
      let timer: unknown | null = null;
      const unsubscribe = store.subscribe((state) => {
        const viewport = state.currentViewport;
        if (
          lastSavedViewportRef.current != null &&
          viewportsEqual(lastSavedViewportRef.current, viewport)
        ) {
          return;
        }
        if (timer != null) dependencies.cancelScheduled(timer);
        timer = dependencies.schedule(() => {
          lastSavedViewportRef.current = viewport;
          dependencies.storage.writeViewport(project, canvasId, viewport);
        }, 300);
      });
      return () => {
        unsubscribe();
        if (timer != null) dependencies.cancelScheduled(timer);
      };
    }, [canvasId, lastSavedViewportRef, project, status, store]);
  }

  return {
    useCanvasHistoryPersistence,
    useCanvasViewportPersistence,
  };
}
