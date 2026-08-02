// Copyright (c) 2026 AI anime
import { useEffect, useRef } from "react";

import type { CanvasSaveArgs } from "../application/canvasSave";
import type { CanvasUnloadSaveArgs } from "../application/canvasUnloadSave";
import type { CanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";
import type {
  CanvasHydrationEdge,
  CanvasHydrationNode,
} from "../application/canvasSyncHydration";
import type {
  CanvasSyncStatus,
  CanvasSyncViewport,
} from "../application/canvasSyncStorage";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "../domain/canvasStorage";
import type { CanvasMutationSource } from "../domain/canvasMutation";
import type { ShotMetadata } from "../domain/shotMetadata";

const SAVE_DEBOUNCE_MS = 800;

interface ValueRef<T> {
  current: T;
}

export interface CanvasSaveControllerState<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
  currentViewport: CanvasSyncViewport;
  viewportBookmarks: unknown;
  userEditsSinceHydrate: number;
  lastMutationSource: CanvasMutationSource | null;
  pendingClearIntent: boolean;
}

export interface CanvasSaveControllerStore<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  read(): CanvasSaveControllerState<TNode, TEdge>;
  subscribe(
    listener: (
      state: CanvasSaveControllerState<TNode, TEdge>,
      previous: CanvasSaveControllerState<TNode, TEdge>,
    ) => void,
  ): () => void;
  acknowledgePendingClear(): void;
}

interface CanvasSaveControllerDependencies<
  TNode extends CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge,
> {
  store: CanvasSaveControllerStore<TNode, TEdge>;
  scheduleCanvasSave(args: CanvasSaveArgs): Promise<boolean>;
  saveCanvasBeforeUnload(args: CanvasUnloadSaveArgs): boolean;
  contentSignature(nodes: TNode[], edges: TEdge[]): string;
  readShotMetadata(): ShotMetadata;
  subscribeShotMetadata(listener: () => void): () => void;
  schedule(callback: () => void, delayMs: number): unknown;
  cancelScheduled(handle: unknown): void;
}

export interface CanvasSaveControllerOptions<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  project: string;
  canvasId: string;
  revisionRef: ValueRef<number | null>;
  canvasEnvelopeRef: ValueRef<Partial<FreezoneCanvasPayload>>;
  hydratedRef: ValueRef<boolean>;
  switchingRef: ValueRef<boolean>;
  lastRemoteNodeCountRef: ValueRef<number>;
  statusRef: ValueRef<CanvasSyncStatus>;
  lastSignatureRef: ValueRef<string | null>;
  suppressNextCanvasAutosaveRef: ValueRef<boolean>;
  lastSavedViewportRef: ValueRef<CanvasSyncViewport | null>;
  draftPersistence: CanvasDraftPersistenceController<TNode, TEdge>;
  buildPersistMetadata(shot: ShotMetadata): Record<string, unknown>;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
  publishBackupStatus(status: CanvasBackupStatus | null): void;
  publishRevision(revision: number | null): void;
}

export interface CanvasSaveController {
  saveCurrent(): Promise<boolean>;
  flush(): Promise<boolean>;
  cancelPendingSave(): void;
  resetIdentity(): void;
  saveBeforeUnload(): void;
}

export function createUseCanvasSaveController<
  TNode extends CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge,
>(dependencies: CanvasSaveControllerDependencies<TNode, TEdge>) {
  return function useCanvasSaveController({
    project,
    canvasId,
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
  }: CanvasSaveControllerOptions<TNode, TEdge>): CanvasSaveController {
    const inFlightRef = useRef<Promise<boolean> | null>(null);
    const timerRef = useRef<unknown | null>(null);
    const pendingClientSaveIdRef = useRef<string | null>(null);
    const pendingClientSaveIdSignatureRef = useRef<string | null>(null);

    const cancelPendingSave = () => {
      if (timerRef.current == null) return;
      dependencies.cancelScheduled(timerRef.current);
      timerRef.current = null;
    };

    const resetIdentity = () => {
      pendingClientSaveIdRef.current = null;
      pendingClientSaveIdSignatureRef.current = null;
    };

    const saveCurrent = async (): Promise<boolean> => {
      const canvasState = dependencies.store.read();
      const shot = dependencies.readShotMetadata();
      lastSavedViewportRef.current = canvasState.currentViewport;
      return await dependencies.scheduleCanvasSave({
        project,
        canvasId,
        nodes: canvasState.nodes,
        edges: canvasState.edges,
        viewport: canvasState.currentViewport,
        metadata: buildPersistMetadata(shot),
        revisionRef,
        canvasEnvelopeRef,
        pendingClientSaveIdRef,
        pendingClientSaveIdSignatureRef,
        hydratedRef,
        switchingRef,
        lastRemoteNodeCountRef,
        setStatus,
        setError,
        inFlightRef,
        publishBackupStatus,
        publishRevision,
        clearDraftAfterSave: draftPersistence.clearAfterSave,
        markDraftPersisted: draftPersistence.markPersisted,
      });
    };

    const flush = async (): Promise<boolean> => {
      cancelPendingSave();
      return await saveCurrent();
    };

    useEffect(() => {
      const triggerSave = () => {
        if (!hydratedRef.current || switchingRef.current) return;
        draftPersistence.scheduleWrite();
        if (statusRef.current === "conflict" || statusRef.current === "error") {
          return;
        }
        if (timerRef.current != null) {
          dependencies.cancelScheduled(timerRef.current);
        }
        timerRef.current = dependencies.schedule(() => {
          void saveCurrent();
        }, SAVE_DEBOUNCE_MS);
      };
      const unsubscribeCanvas = dependencies.store.subscribe(
        (state, previous) => {
          if (state.viewportBookmarks !== previous.viewportBookmarks) {
            triggerSave();
          }
          if (state.nodes === previous.nodes && state.edges === previous.edges) {
            suppressNextCanvasAutosaveRef.current = false;
            return;
          }
          const nextSignature = dependencies.contentSignature(
            state.nodes,
            state.edges,
          );
          if (suppressNextCanvasAutosaveRef.current) {
            suppressNextCanvasAutosaveRef.current = false;
            lastSignatureRef.current = nextSignature;
            return;
          }
          if (nextSignature === lastSignatureRef.current) return;
          lastSignatureRef.current = nextSignature;
          triggerSave();
        },
      );
      const unsubscribeShot = dependencies.subscribeShotMetadata(triggerSave);
      return () => {
        unsubscribeCanvas();
        unsubscribeShot();
        draftPersistence.flushPendingWrite();
        if (timerRef.current != null) {
          dependencies.cancelScheduled(timerRef.current);
        }
      };
    }, [project, canvasId]);

    const saveBeforeUnload = () => {
      const canvasState = dependencies.store.read();
      const shot = dependencies.readShotMetadata();
      lastSavedViewportRef.current = canvasState.currentViewport;
      dependencies.saveCanvasBeforeUnload({
        project,
        canvasId,
        nodes: canvasState.nodes,
        edges: canvasState.edges,
        viewport: canvasState.currentViewport,
        metadata: buildPersistMetadata(shot),
        revision: revisionRef.current,
        envelope: canvasEnvelopeRef.current,
        hydrated: hydratedRef.current,
        switching: switchingRef.current,
        lastRemoteNodeCount: lastRemoteNodeCountRef.current,
        mutationState: {
          userEditsSinceHydrate: canvasState.userEditsSinceHydrate,
          lastMutationSource: canvasState.lastMutationSource,
          pendingClearIntent: canvasState.pendingClearIntent,
        },
        pendingClientSaveIdRef,
        pendingClientSaveIdSignatureRef,
        hasUnsettledContentSave:
          draftPersistence.hasPendingWrite() ||
          timerRef.current != null ||
          inFlightRef.current != null ||
          statusRef.current === "saving",
        hasPendingContentSave: timerRef.current != null,
        lastPersistedDraftSignature:
          draftPersistence.lastPersistedSignature(),
        cancelPendingDraft: draftPersistence.cancelPendingWrite,
        persistDraft: draftPersistence.persistNow,
        cancelPendingContentSave: cancelPendingSave,
      });
    };

    return {
      saveCurrent,
      flush,
      cancelPendingSave,
      resetIdentity,
      saveBeforeUnload,
    };
  };
}
