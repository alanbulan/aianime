// Copyright (c) 2026 AI anime
import { useRef } from "react";

import { useCanvasStore } from "@/features/canvas/canvasStore";

import type { StoredCanvasDraft } from "../application/canvasDraft";
import { canvasDraftStorageGateway } from "../canvasDraftComposition";
import {
  useShotMetadataStore,
  type ShotMetadata,
} from "../shotMetadataStore";

const DRAFT_DEBOUNCE_MS = 300;

interface ValueRef<T> {
  current: T;
}

export interface CanvasDraftPersistenceOptions {
  project: string;
  canvasId: string;
  hydratedRef: ValueRef<boolean>;
  switchingRef: ValueRef<boolean>;
  revisionRef: ValueRef<number | null>;
  buildPersistMetadata(shot: ShotMetadata): Record<string, unknown>;
}

export interface CanvasDraftPersistenceController {
  persistNow(): boolean;
  scheduleWrite(): void;
  flushPendingWrite(): void;
  cancelPendingWrite(): void;
  clearAfterSave(): void;
  readStored(): StoredCanvasDraft | null;
  clearStored(): void;
  resetPersistedSignature(): void;
  markPersisted(signature: string): void;
  hasPendingWrite(): boolean;
  lastPersistedSignature(): string | null;
}

export function useCanvasDraftPersistenceController({
  project,
  canvasId,
  hydratedRef,
  switchingRef,
  revisionRef,
  buildPersistMetadata,
}: CanvasDraftPersistenceOptions): CanvasDraftPersistenceController {
  const timerRef = useRef<number | null>(null);
  const persistedSignatureRef = useRef<string | null>(null);

  const persistNow = () => {
    if (!hydratedRef.current || switchingRef.current) {
      return false;
    }
    const canvasState = useCanvasStore.getState();
    const shot = useShotMetadataStore.getState().shot;
    return canvasDraftStorageGateway.writeDraft(project, canvasId, {
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
      updatedAt: Date.now(),
    });
  };

  const cancelPendingWrite = () => {
    if (timerRef.current == null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const scheduleWrite = () => {
    cancelPendingWrite();
    timerRef.current = window.setTimeout(() => {
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
    canvasDraftStorageGateway.clearDraft(project, canvasId);
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
    readStored: () => canvasDraftStorageGateway.readDraft(project, canvasId),
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
}
