// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";

import type {
  CanvasProjectionEdge,
  CanvasProjectionNode,
} from "../application/canvasProjectionGraph";
import type {
  CanvasHydrationEdge,
  CanvasHydrationNode,
} from "../application/canvasSyncHydration";
import type {
  CanvasSyncStatus,
  CanvasSyncViewport,
  ConflictSnapshot,
} from "../application/canvasSyncStorage";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "../domain/canvasStorage";
import type { ShotMetadata } from "../domain/shotMetadata";

import type {
  CanvasConflictController,
  CanvasConflictControllerOptions,
} from "./useCanvasConflictController";
import type {
  CanvasDraftPersistenceController,
  CanvasDraftPersistenceOptions,
  CanvasDraftPersistenceStore,
} from "./useCanvasDraftPersistenceController";
import type {
  CanvasHydrationLifecycleOptions,
  CanvasHydrationLifecycleStore,
} from "./useCanvasHydrationLifecycle";
import type {
  CanvasHistoryPersistenceOptions,
  CanvasLocalPersistenceStore,
  CanvasViewportPersistenceOptions,
} from "./useCanvasLocalPersistence";
import type {
  CanvasPresetRefreshController,
  CanvasPresetRefreshControllerOptions,
} from "./useCanvasPresetRefreshController";
import type {
  CanvasRuntimeBridgeOptions,
  CanvasRuntimeBridgeStore,
} from "./useCanvasRuntimeBridge";
import type {
  CanvasSaveController,
  CanvasSaveControllerOptions,
  CanvasSaveControllerStore,
} from "./useCanvasSaveController";

export interface CanvasSyncResult {
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
  /**
   * Force a save now (e.g. before navigating away). Returns false if saving
   * was blocked.
   */
  flush: () => Promise<boolean>;
  /** Re-run the initial hydrate after a load error, without a full reload. */
  retry: () => void;
  /** Save current local edits to a new canvas id after a revision conflict. */
  saveCopy: () => Promise<string>;
  /**
   * Rebuild the current mainline preset canvas from the latest project facts.
   */
  restoreMainlineDefault: (options?: {
    bestEffort?: boolean;
  }) => Promise<string>;
  /**
   * Read the conflict snapshot stashed by the 409 path. Returns `null` if no
   * snapshot exists for the current canvas. Used by the overlay's "下载本地
   * JSON" button.
   */
  readConflictSnapshot: () => ConflictSnapshot | null;
  /** Drop the conflict snapshot once the user has recovered / discarded it. */
  clearConflictSnapshot: () => void;
}

interface CanvasSyncViewportPort {
  setViewport(
    viewport: CanvasSyncViewport,
    options: { duration: number },
  ): unknown;
}

export interface CanvasSyncSelectionPort<
  TNode extends CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge,
> {
  useSetCanvasData(): CanvasHydrationLifecycleOptions<
    TNode,
    TEdge
  >["setCanvasData"];
  useApplyCanvasDataEdit(): CanvasRuntimeBridgeOptions<
    TNode & CanvasProjectionNode,
    TEdge & CanvasProjectionEdge
  >["applyCanvasDataEdit"];
  useHydrateCanvasDraft(): CanvasHydrationLifecycleOptions<
    TNode,
    TEdge
  >["hydrateCanvasDraft"];
  useRestoreHistory(): CanvasHydrationLifecycleOptions<
    TNode,
    TEdge
  >["restoreHistory"];
  useSetViewportState(): CanvasHydrationLifecycleOptions<
    TNode,
    TEdge
  >["setViewportState"];
  readUserEditsSinceHydrate(): number;
  readViewportBookmarks(): unknown;
}

export interface CanvasSyncHookDependencies<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
> {
  selection: CanvasSyncSelectionPort<TNode, TEdge>;
  localPersistenceStore: CanvasLocalPersistenceStore;
  draftPersistenceStore: CanvasDraftPersistenceStore<TNode, TEdge>;
  saveControllerStore: CanvasSaveControllerStore<TNode, TEdge>;
  hydrationLifecycleStore: CanvasHydrationLifecycleStore<TNode, TEdge>;
  runtimeBridgeStore: CanvasRuntimeBridgeStore<TNode, TEdge>;
  useViewportPort(): CanvasSyncViewportPort;
  useDraftPersistenceController(
    options: CanvasDraftPersistenceOptions<TNode, TEdge>,
  ): CanvasDraftPersistenceController<TNode, TEdge>;
  useRuntimeBridge(options: CanvasRuntimeBridgeOptions<TNode, TEdge>): void;
  useHydrationLifecycle(
    options: CanvasHydrationLifecycleOptions<TNode, TEdge>,
  ): void;
  useHistoryPersistence(options: CanvasHistoryPersistenceOptions): void;
  useSaveController(
    options: CanvasSaveControllerOptions<TNode, TEdge>,
  ): CanvasSaveController;
  useViewportPersistence(options: CanvasViewportPersistenceOptions): void;
  useConflictController(
    options: CanvasConflictControllerOptions,
  ): CanvasConflictController;
  usePresetRefreshController(
    options: CanvasPresetRefreshControllerOptions,
  ): CanvasPresetRefreshController;
  addBeforeUnload(listener: () => void): void;
  removeBeforeUnload(listener: () => void): void;
}

/**
 * Bind a AI anime freezone canvas (project, canvasId) to the local
 * `useCanvasStore`. On mount the canvas is fetched and pushed into the
 * store; subsequent edits are debounced + PUT back. F4's freezoneAiGateway
 * generates new images that flow into the store the same way upstream did.
 */
export function createUseCanvasSync<
  TNode extends CanvasProjectionNode & CanvasHydrationNode,
  TEdge extends CanvasProjectionEdge & CanvasHydrationEdge,
>(dependencies: CanvasSyncHookDependencies<TNode, TEdge>) {
  return function useCanvasSync(
    project: string,
    canvasId: string,
  ): CanvasSyncResult {
    const [status, setStatus] = useState<CanvasSyncStatus>("loading");
    const [error, setError] = useState<string | null>(null);
    const [metadata, setMetadata] = useState<Record<string, unknown> | null>(
      null,
    );
    const [revision, setRevision] = useState<number | null>(null);
    const [hydratedCanvasId, setHydratedCanvasId] = useState<string | null>(
      null,
    );
    const [reloadKey, setReloadKey] = useState(0);
    // Surfaced backup status from the most recent save. The hook always
    // overwrites this on success; on legacy responses without the field, we
    // store `null` (treated as "no signal" by the UI).
    const [backupStatus, setBackupStatus] = useState<CanvasBackupStatus | null>(
      null,
    );
    // Fingerprint of the canvas content we last observed. A store change only
    // schedules a save when the new content fingerprint differs from this,
    // which is how we ignore pure view-state churn. Seeded on hydrate so the
    // initial measure/select pass after load doesn't fire a redundant save.
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
    // Last viewport we persisted. Pan/zoom alone never triggers a full PUT
    // (that would re-send the entire canvas blob on every gesture), so we track
    // it here and flush it on tab close, which is enough to restore position on
    // refresh.
    const lastSavedViewportRef = useRef<CanvasSyncViewport | null>(null);
    const setCanvasData = dependencies.selection.useSetCanvasData();
    const applyCanvasDataEdit = dependencies.selection.useApplyCanvasDataEdit();
    const hydrateCanvasDraft = dependencies.selection.useHydrateCanvasDraft();
    const restoreHistory = dependencies.selection.useRestoreHistory();
    const setViewportState = dependencies.selection.useSetViewportState();
    const viewportPort = dependencies.useViewportPort();

    const setSyncStatus = (next: CanvasSyncStatus) => {
      statusRef.current = next;
      setStatus(next);
    };

    // Single source of truth for the persisted metadata blob so every save site
    // (draft write, debounced PUT, flush, beforeunload) carries shotMetadata
    // AND viewportBookmarks. Omitting bookmarks at any PUT site would overwrite
    // the backend copy with nothing — hence: route ALL save sites through here.
    const buildPersistMetadata = (shot: ShotMetadata) => ({
      ...(metadataRef.current ?? {}),
      shotMetadata: shot,
      viewportBookmarks: dependencies.selection.readViewportBookmarks(),
    });
    const draftPersistence = dependencies.useDraftPersistenceController({
      project,
      canvasId,
      hydratedRef,
      switchingRef,
      revisionRef,
      store: dependencies.draftPersistenceStore,
      buildPersistMetadata,
    });

    // Publish the backend's `backup_status` to React state so FreezoneShell
    // can render the pending / failed indicator.
    const publishBackupStatus = (next: CanvasBackupStatus | null) => {
      setBackupStatus(next);
    };

    dependencies.useRuntimeBridge({
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

    dependencies.useHydrationLifecycle({
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
      viewportPort,
      setRevision,
      setMetadata,
      setHydratedCanvasId,
      setBackupStatus,
      setStatus: setSyncStatus,
      setError,
    });

    dependencies.useHistoryPersistence({
      project,
      canvasId,
      hydratedRef,
      switchingRef,
      store: dependencies.localPersistenceStore,
    });

    const saveController = dependencies.useSaveController({
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

    dependencies.useViewportPersistence({
      project,
      canvasId,
      status,
      lastSavedViewportRef,
      store: dependencies.localPersistenceStore,
    });

    // Persist the final camera position on tab close. When a debounced content
    // edit is also pending, the application service writes the recovery draft
    // and delegates one best-effort PUT to the keepalive transport.
    useEffect(() => {
      const handler = () => saveController.saveBeforeUnload();
      dependencies.addBeforeUnload(handler);
      return () => dependencies.removeBeforeUnload(handler);
    }, [project, canvasId, metadata]);

    const conflictController = dependencies.useConflictController({
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

    const presetRefreshController = dependencies.usePresetRefreshController({
      project,
      canvasId,
      metadata,
      revision,
      hydratedCanvasId,
      revisionRef,
      readUserEditsSinceHydrate:
        dependencies.selection.readUserEditsSinceHydrate,
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
  };
}
