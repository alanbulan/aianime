// Copyright (c) 2026 AI anime
import { useEffect, useRef } from "react";
import type { Viewport } from "@xyflow/react";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "@/features/freezone/domain/canvasStorage";

import { canvasContentSignature } from "../application/canvasSyncHydration";
import type { CanvasSyncStatus } from "../application/canvasSyncStorage";
import { scheduleCanvasSave } from "../canvasSaveComposition";
import { saveCanvasBeforeUnload } from "../canvasUnloadSaveComposition";
import type { ShotMetadata } from "../domain/shotMetadata";
import { shotMetadataState } from "../shotMetadataComposition";
import type { CanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";

const SAVE_DEBOUNCE_MS = 800;

interface ValueRef<T> {
  current: T;
}

export interface CanvasSaveControllerOptions {
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
  lastSavedViewportRef: ValueRef<Viewport | null>;
  draftPersistence: CanvasDraftPersistenceController;
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

export function useCanvasSaveController({
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
}: CanvasSaveControllerOptions): CanvasSaveController {
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendingClientSaveIdRef = useRef<string | null>(null);
  const pendingClientSaveIdSignatureRef = useRef<string | null>(null);

  const cancelPendingSave = () => {
    if (timerRef.current == null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const resetIdentity = () => {
    pendingClientSaveIdRef.current = null;
    pendingClientSaveIdSignatureRef.current = null;
  };

  const saveCurrent = async (): Promise<boolean> => {
    const canvasState = useCanvasStore.getState();
    const shot = shotMetadataState.getShot();
    lastSavedViewportRef.current = canvasState.currentViewport;
    return await scheduleCanvasSave({
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
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        void saveCurrent();
      }, SAVE_DEBOUNCE_MS);
    };
    const unsubscribeCanvas = useCanvasStore.subscribe((state, previous) => {
      if (state.viewportBookmarks !== previous.viewportBookmarks) {
        triggerSave();
      }
      if (state.nodes === previous.nodes && state.edges === previous.edges) {
        suppressNextCanvasAutosaveRef.current = false;
        return;
      }
      const nextSignature = canvasContentSignature(state.nodes, state.edges);
      if (suppressNextCanvasAutosaveRef.current) {
        suppressNextCanvasAutosaveRef.current = false;
        lastSignatureRef.current = nextSignature;
        return;
      }
      if (nextSignature === lastSignatureRef.current) return;
      lastSignatureRef.current = nextSignature;
      triggerSave();
    });
    const unsubscribeShot = shotMetadataState.subscribe(triggerSave);
    return () => {
      unsubscribeCanvas();
      unsubscribeShot();
      draftPersistence.flushPendingWrite();
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [project, canvasId]);

  const saveBeforeUnload = () => {
    const canvasState = useCanvasStore.getState();
    const shot = shotMetadataState.getShot();
    lastSavedViewportRef.current = canvasState.currentViewport;
    saveCanvasBeforeUnload({
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
}
