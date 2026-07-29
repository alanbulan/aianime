// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useReactFlow, type Viewport } from "@xyflow/react";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "@/features/freezone/domain/canvasStorage";
import {
  type CanvasSyncStatus,
  type ConflictSnapshot,
} from "../application/canvasSyncStorage";
import type { ShotMetadata } from "../domain/shotMetadata";
import {
  useCanvasHistoryPersistence,
  useCanvasViewportPersistence,
} from "./useCanvasLocalPersistence";
import {
  useCanvasDraftPersistenceController,
} from "./useCanvasDraftPersistenceController";
import { useCanvasSaveController } from "./useCanvasSaveController";
import { useCanvasConflictController } from "./useCanvasConflictController";
import { useCanvasPresetRefreshController } from "./useCanvasPresetRefreshController";
import { useCanvasRuntimeBridge } from "./useCanvasRuntimeBridge";
import { useCanvasHydrationLifecycle } from "./useCanvasHydrationLifecycle";

interface CanvasSyncResult {
  status: CanvasSyncStatus;
  error: string | null;
  metadata: Record<string, unknown> | null;
  revision: number | null;
  hydratedCanvasId: string | null;
  /**
   * Reported by the backend on the last save. `null` means we have not
   * observed any backup info yet (fresh mount). `synced` / `disabled` are
   * silent in the UI; `pending` / `failed` light up the indicator.
   */
  backupStatus: CanvasBackupStatus | null;
  /** Force a save now (e.g. before navigating away). Returns false if saving was blocked. */
  flush: () => Promise<boolean>;
  /** Re-run the initial hydrate after a load error, without a full reload. */
  retry: () => void;
  /** Save current local edits to a new canvas id after a revision conflict. */
  saveCopy: () => Promise<string>;
  /** Rebuild the current mainline preset canvas from the latest project facts. */
  restoreMainlineDefault: (options?: { bestEffort?: boolean }) => Promise<string>;
  /**
   * Read the conflict snapshot stashed by the 409 path. Returns `null` if no
   * snapshot exists for the current canvas. Used by the overlay's "下载本地
   * JSON" button.
   */
  readConflictSnapshot: () => ConflictSnapshot | null;
  /** Drop the conflict snapshot once the user has recovered / discarded it. */
  clearConflictSnapshot: () => void;
}

/**
 * Bind a AI anime freezone canvas (project, canvasId) to the local
 * `useCanvasStore`. On mount the canvas is fetched and pushed into the
 * store; subsequent edits are debounced + PUT back. F4's freezoneAiGateway
 * generates new images that flow into the store the same way upstream did.
 */
export function useCanvasSync(
  project: string,
  canvasId: string,
): CanvasSyncResult {
  const [status, setStatus] = useState<CanvasSyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [hydratedCanvasId, setHydratedCanvasId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Surfaced backup status from the most recent save. The hook always
  // overwrites this on success; on legacy responses without the field, we
  // store `null` (treated as "no signal" by the UI).
  const [backupStatus, setBackupStatus] = useState<CanvasBackupStatus | null>(
    null,
  );
  // Fingerprint of the canvas content we last observed. A store change only
  // schedules a save when the new content fingerprint differs from this, which
  // is how we ignore pure view-state churn. Seeded on hydrate so the initial
  // measure/select pass after load doesn't fire a redundant save.
  const lastSignatureRef = useRef<string | null>(null);
  const suppressNextCanvasAutosaveRef = useRef(false);
  const revisionRef = useRef<number | null>(null);
  const statusRef = useRef<CanvasSyncStatus>("loading");
  const metadataRef = useRef<Record<string, unknown> | null>(null);
  const canvasEnvelopeRef = useRef<Partial<FreezoneCanvasPayload>>({});
  // True only after the initial GET hydrate has populated the store. Until
  // then, every store mutation we observe is part of the hydrate, not a user
  // edit, and must not produce a PUT.
  const hydratedRef = useRef(false);
  // True between "canvasId / project changed" and "next hydrate completes".
  // Blocks autosave the same way `!hydrated` does, but is set synchronously
  // at the start of the hydrate effect so saves cannot leak through during
  // the cleanup window of the previous canvas.
  const switchingRef = useRef(false);
  // Node count of the last server-known state. Used by `decideSaveAction` to
  // detect the "remote had nodes, local is suddenly empty" pattern that
  // signals a Zustand reset / HMR accident.
  const lastRemoteNodeCountRef = useRef(0);
  // Last viewport we persisted. Pan/zoom alone never triggers a full PUT (that
  // would re-send the entire canvas blob on every gesture), so we track it here
  // and flush it on tab close, which is enough to restore position on refresh.
  const lastSavedViewportRef = useRef<Viewport | null>(null);
  const setCanvasData = useCanvasStore((s) => s.setCanvasData);
  const applyCanvasDataEdit = useCanvasStore((s) => s.applyCanvasDataEdit);
  const hydrateCanvasDraft = useCanvasStore((s) => s.hydrateCanvasDraft);
  const restoreHistory = useCanvasStore((s) => s.restoreHistory);
  const setViewportState = useCanvasStore((s) => s.setViewportState);
  const reactFlow = useReactFlow();

  const setSyncStatus = (next: CanvasSyncStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  // Single source of truth for the persisted metadata blob so every save site
  // (draft write, debounced PUT, flush, beforeunload) carries shotMetadata AND
  // viewportBookmarks. Omitting bookmarks at any PUT site would overwrite the
  // backend copy with nothing — hence: route ALL save sites through here.
  const buildPersistMetadata = (shot: ShotMetadata) => ({
    ...(metadataRef.current ?? {}),
    shotMetadata: shot,
    viewportBookmarks: useCanvasStore.getState().viewportBookmarks,
  });
  const draftPersistence = useCanvasDraftPersistenceController({
    project,
    canvasId,
    hydratedRef,
    switchingRef,
    revisionRef,
    buildPersistMetadata,
  });

  // Publish the backend's `backup_status` to React state so FreezoneShell
  // can render the pending / failed indicator.
  const publishBackupStatus = (next: CanvasBackupStatus | null) => {
    setBackupStatus(next);
  };

  useCanvasRuntimeBridge({
    project,
    canvasId,
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
    setStatus: setSyncStatus,
    setError,
  });

  useCanvasHydrationLifecycle({
    project,
    canvasId,
    reloadKey,
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
    viewportPort: reactFlow,
    setRevision,
    setMetadata,
    setHydratedCanvasId,
    setBackupStatus,
    setStatus: setSyncStatus,
    setError,
  });

  useCanvasHistoryPersistence({
    project,
    canvasId,
    hydratedRef,
    switchingRef,
  });

  const saveController = useCanvasSaveController({
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
    setStatus: setSyncStatus,
    setError,
    publishBackupStatus,
    publishRevision: setRevision,
  });
  const flush = saveController.flush;

  useCanvasViewportPersistence({
    project,
    canvasId,
    status,
    lastSavedViewportRef,
  });

  // Persist the final camera position on tab close. When a debounced content
  // edit is also pending, the application service writes the recovery draft
  // and delegates one best-effort PUT to the keepalive transport.
  useEffect(() => {
    const handler = () => saveController.saveBeforeUnload();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [project, canvasId, metadata]);

  const conflictController = useCanvasConflictController({
    project,
    canvasId,
    canvasEnvelopeRef,
    revisionRef,
    saveController,
    reload: () => setReloadKey((key) => key + 1),
    setRevision,
    setBackupStatus,
    setStatus: setSyncStatus,
    setError,
  });

  const presetRefreshController = useCanvasPresetRefreshController({
    project,
    canvasId,
    metadata,
    revision,
    hydratedCanvasId,
    revisionRef,
    flush,
    reload: () => setReloadKey((key) => key + 1),
    setStatus: setSyncStatus,
    setError,
  });

  return {
    status,
    error,
    metadata,
    revision,
    hydratedCanvasId,
    backupStatus,
    flush,
    retry: conflictController.retry,
    saveCopy: conflictController.saveCopy,
    restoreMainlineDefault: presetRefreshController.restoreMainlineDefault,
    readConflictSnapshot: conflictController.readConflictSnapshot,
    clearConflictSnapshot: conflictController.clearConflictSnapshot,
  };
}
