// Copyright (c) 2026 AI anime
import { useRef } from "react";

import type {
  CanvasDraftHistoryState,
  CanvasDraftStorageGateway,
  StoredCanvasDraft,
} from "../application/canvasDraft";
import type {
  CanvasHydrationEdge,
  CanvasHydrationNode,
} from "../application/canvasSyncHydration";
import type { CanvasSyncViewport } from "../application/canvasSyncStorage";
import type { CanvasMutationSource } from "../domain/canvasMutation";
import type { ShotMetadata } from "../domain/shotMetadata";

const DRAFT_DEBOUNCE_MS = 300;

interface ValueRef<T> {
  current: T;
}

export interface CanvasDraftPersistenceState<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
  currentViewport: CanvasSyncViewport;
  history: CanvasDraftHistoryState<TNode, TEdge>;
  userEditsSinceHydrate: number;
  lastMutationSource: CanvasMutationSource | null;
  pendingClearIntent: boolean;
}

export interface CanvasDraftPersistenceStore<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  read(): CanvasDraftPersistenceState<TNode, TEdge>;
}

interface CanvasDraftPersistenceDependencies {
  storage: CanvasDraftStorageGateway;
  readShotMetadata(): ShotMetadata;
  schedule(callback: () => void, delayMs: number): unknown;
  cancelScheduled(handle: unknown): void;
  now(): number;
}

export interface CanvasDraftPersistenceOptions<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  project: string;
  canvasId: string;
  hydratedRef: ValueRef<boolean>;
  switchingRef: ValueRef<boolean>;
  revisionRef: ValueRef<number | null>;
  store: CanvasDraftPersistenceStore<TNode, TEdge>;
  buildPersistMetadata(shot: ShotMetadata): Record<string, unknown>;
}

export interface CanvasDraftPersistenceController<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  persistNow(): boolean;
  scheduleWrite(): void;
  flushPendingWrite(): void;
  cancelPendingWrite(): void;
  clearAfterSave(): void;
  readStored(): StoredCanvasDraft<TNode, TEdge> | null;
  clearStored(): void;
  resetPersistedSignature(): void;
  markPersisted(signature: string): void;
  hasPendingWrite(): boolean;
  lastPersistedSignature(): string | null;
}

export function createUseCanvasDraftPersistenceController(
  dependencies: CanvasDraftPersistenceDependencies,
) {
  return function useCanvasDraftPersistenceController<
    TNode extends CanvasHydrationNode = CanvasHydrationNode,
    TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
  >({
    project,
    canvasId,
    hydratedRef,
    switchingRef,
    revisionRef,
    store,
    buildPersistMetadata,
  }: CanvasDraftPersistenceOptions<TNode, TEdge>): CanvasDraftPersistenceController<
    TNode,
    TEdge
  > {
    const timerRef = useRef<unknown | null>(null);
    const persistedSignatureRef = useRef<string | null>(null);

    const persistNow = () => {
      if (!hydratedRef.current || switchingRef.current) {
        return false;
      }
      const canvasState = store.read();
      const shot = dependencies.readShotMetadata();
      return dependencies.storage.writeDraft(project, canvasId, {
        baseRevision: revisionRef.current,
        nodes: canvasState.nodes,
        edges: canvasState.edges,
        viewport: canvasState.currentViewport,
        metadata: buildPersistMetadata(shot),
        history: canvasState.history,
        mutation: {
          userEditsSinceHydrate: canvasState.userEditsSinceHydrate,
          lastMutationSource: canvasState.lastMutationSource,
          pendingClearIntent: canvasState.pendingClearIntent,
        },
        updatedAt: dependencies.now(),
      });
    };

    const cancelPendingWrite = () => {
      if (timerRef.current == null) return;
      dependencies.cancelScheduled(timerRef.current);
      timerRef.current = null;
    };

    const scheduleWrite = () => {
      cancelPendingWrite();
      timerRef.current = dependencies.schedule(() => {
        timerRef.current = null;
        persistNow();
      }, DRAFT_DEBOUNCE_MS);
    };

    const flushPendingWrite = () => {
      if (timerRef.current == null) return;
      cancelPendingWrite();
      persistNow();
    };

    const clearStored = () => {
      dependencies.storage.clearDraft(project, canvasId);
    };

    const clearAfterSave = () => {
      cancelPendingWrite();
      clearStored();
    };

    return {
      persistNow,
      scheduleWrite,
      flushPendingWrite,
      cancelPendingWrite,
      clearAfterSave,
      readStored: () =>
        dependencies.storage.readDraft<TNode, TEdge>(
          project,
          canvasId,
        ),
      clearStored,
      resetPersistedSignature: () => {
        persistedSignatureRef.current = null;
      },
      markPersisted: (signature) => {
        persistedSignatureRef.current = signature;
      },
      hasPendingWrite: () => timerRef.current != null,
      lastPersistedSignature: () => persistedSignatureRef.current,
    };
  };
}
