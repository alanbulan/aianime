// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useReactFlow, type Viewport } from "@xyflow/react";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "@/features/freezone/domain/canvasStorage";
import { canvasEnvelopeFromRemote } from "../application/canvasSyncCore";
import {
  canvasContentSignature,
  decideHydrateDraft,
} from "../application/canvasSyncHydration";
import {
  isCanvasSyncViewport,
  type CanvasSyncStatus,
  type ConflictSnapshot,
} from "../application/canvasSyncStorage";
import { canvasSyncStorageGateway } from "../canvasSyncComposition";
import {
  EMPTY_SHOT_METADATA,
  useShotMetadataStore,
  type ShotMetadata,
} from "../shotMetadataStore";
import { setFreezoneCanvasMetadata } from "../canvasMetadataContext";
import { consumeQueuedLocalFreezoneProjections } from "../canvasSyncRuntime";
import { canvasDraftSignature } from "../application/canvasDraft";
import { scheduleCanvasDraftPruneOnce } from "../canvasDraftComposition";
import { canvasHydrateFlightCoordinator } from "../canvasHydrationComposition";
import { canvasConflictRecovery } from "../canvasConflictRecoveryComposition";
import { refreshCanvasPreset } from "../canvasPresetRefreshComposition";
import {
  useCanvasHistoryPersistence,
  useCanvasViewportPersistence,
} from "./useCanvasLocalPersistence";
import {
  useCanvasDraftPersistenceController,
} from "./useCanvasDraftPersistenceController";
import { useCanvasSaveController } from "./useCanvasSaveController";
import { useCanvasRuntimeBridge } from "./useCanvasRuntimeBridge";

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

  // ---- 1. Hydrate ---- //
  useEffect(() => {
    let cancelled = false;
    // 清理旧草稿要遍历并解析整个 localStorage（草稿动辄几 MB），放在挂载的关键路径上
    // 会直接卡住切页那一帧；挪到空闲期做，它跟本次 hydrate 没有先后依赖。整页只跑一次，
    // 且不随卸载取消 —— 否则「进画布不到两秒就切走」这种最常见的路径永远清理不到。
    scheduleCanvasDraftPruneOnce();
    const hydrateFlight = canvasHydrateFlightCoordinator.acquire(
      project,
      canvasId,
      reloadKey,
    );
    setSyncStatus("loading");
    setError(null);
    lastSignatureRef.current = null;
    revisionRef.current = null;
    metadataRef.current = null;
    setRevision(null);
    setHydratedCanvasId(null);
    canvasEnvelopeRef.current = {};
    draftPersistence.resetPersistedSignature();
    hydratedRef.current = false;
    switchingRef.current = true;
    lastRemoteNodeCountRef.current = 0;
    saveController.resetIdentity();
    setBackupStatus(null);

    (async () => {
      try {
        const remote = await hydrateFlight.promise;
        if (cancelled) return;
        const remoteRevision =
          typeof remote.revision === "number" ? remote.revision : null;
        revisionRef.current = remoteRevision;
        setRevision(remoteRevision);
        canvasEnvelopeRef.current = canvasEnvelopeFromRemote(remote);
        const nodes = (remote.nodes ?? []) as Parameters<typeof setCanvasData>[0];
        const edges = (remote.edges ?? []) as Parameters<typeof setCanvasData>[1];
        const meta = (remote.metadata ?? null) as
          | (Record<string, unknown> & { shotMetadata?: ShotMetadata })
          | null;
        const remoteSignature = canvasDraftSignature(nodes, edges, meta);
        draftPersistence.markPersisted(remoteSignature);
        const draft = draftPersistence.readStored();
        const draftDecision = decideHydrateDraft(
          draft,
          remoteRevision,
          remoteSignature,
          nodes,
          edges,
          meta,
        );
        lastRemoteNodeCountRef.current = nodes.length;
        if (draftDecision.kind === "draft") {
          const draftMeta = draftDecision.draft.metadata as
            | (Record<string, unknown> & { shotMetadata?: ShotMetadata })
            | null;
          metadataRef.current = draftMeta;
          setMetadata(draftMeta);
          setFreezoneCanvasMetadata(draftMeta);
          useShotMetadataStore
            .getState()
            .hydrate(draftMeta?.shotMetadata ?? EMPTY_SHOT_METADATA);
          // Seed from the remote state so the atomic draft hydrate is observed
          // as dirty local content and flows through the normal debounced save.
          lastSignatureRef.current = canvasContentSignature(nodes, edges);
          hydratedRef.current = true;
          switchingRef.current = false;
          hydrateCanvasDraft({
            nodes: draftDecision.draft.nodes,
            edges: draftDecision.draft.edges,
            history: draftDecision.draft.history,
            mutation: draftDecision.draft.mutation,
          });
          useCanvasStore
            .getState()
            .hydrateViewportBookmarks(draftMeta?.viewportBookmarks);
          const draftViewport = isCanvasSyncViewport(draftDecision.draft.viewport)
            ? draftDecision.draft.viewport
            : canvasSyncStorageGateway.readViewport(project, canvasId) ??
              (isCanvasSyncViewport(remote.viewport) ? remote.viewport : null);
          if (draftViewport) {
            lastSavedViewportRef.current = draftViewport;
            setViewportState(draftViewport);
            requestAnimationFrame(() => {
              if (cancelled) return;
              reactFlow.setViewport(draftViewport, { duration: 0 });
            });
          }
          // The draft carries its own undo history (hydrateCanvasDraft above),
          // so the separate mirror is redundant here — drop it read-once like
          // the remote branch. The edit-gated write effect re-creates it.
          canvasSyncStorageGateway.clearHistory(project, canvasId);
          setHydratedCanvasId(canvasId);
          setSyncStatus("ready");
          return;
        }

        if (draftDecision.kind === "conflict") {
          canvasConflictRecovery.capture({
            canvasId,
            nodes: draftDecision.draft.nodes,
            edges: draftDecision.draft.edges,
            viewport: draftDecision.draft.viewport ?? null,
            metadata: draftDecision.draft.metadata ?? null,
            timestamp: new Date(draftDecision.draft.updatedAt).toISOString(),
          });
        } else if (draft) {
          draftPersistence.clearStored();
        }

        setCanvasData(nodes, edges);
        // Seed the fingerprint from the normalized store state so the first
        // post-hydrate emission (measure/select) is recognized as a no-op.
        const hydrated = useCanvasStore.getState();
        lastSignatureRef.current = canvasContentSignature(
          hydrated.nodes,
          hydrated.edges,
        );
        // Restore the cross-refresh undo/redo stacks, but only when the loaded
        // canvas still matches the content the history was captured against —
        // otherwise (edited on another device, backend newer) we'd let the user
        // undo into a state that never existed here.
        const storedHistory = canvasSyncStorageGateway.readHistory(
          project,
          canvasId,
        );
        if (storedHistory && storedHistory.signature === lastSignatureRef.current) {
          restoreHistory({ past: storedHistory.past, future: storedHistory.future });
        }
        // Read-once: the mirror only exists to bridge this refresh. Drop it now
        // that it's been consumed (or is stale) so undo stacks don't accumulate
        // per canvas. The write effect re-persists it once the user edits again.
        canvasSyncStorageGateway.clearHistory(project, canvasId);
        // Restore the saved camera position so a refresh lands where the user
        // left off. Prefer the client-side localStorage copy: it's updated on
        // every pan/zoom (debounced + a synchronous beforeunload write), so it
        // always reflects the *last* position. The backend `viewport` only
        // rides along with content (nodes/edges) PUTs, so after a pure pan/zoom
        // it's stale — using it first would yank the camera back to wherever it
        // was during the last content edit. Fall back to the backend value only
        // when there's no local copy (fresh browser / cross-device). Seed both
        // the store (drives `currentViewport`) and the live ReactFlow instance;
        // rAF ensures it applies after nodes first render.
        const savedViewport =
          canvasSyncStorageGateway.readViewport(project, canvasId) ??
          (isCanvasSyncViewport(remote.viewport) ? remote.viewport : null);
        if (savedViewport) {
          lastSavedViewportRef.current = savedViewport;
          setViewportState(savedViewport);
          requestAnimationFrame(() => {
            if (cancelled) return;
            reactFlow.setViewport(savedViewport, { duration: 0 });
          });
        }
        // Hydrate freezone-specific sidecar metadata.
        metadataRef.current = meta;
        setMetadata(meta);
        setFreezoneCanvasMetadata(meta);
        useCanvasStore.getState().hydrateViewportBookmarks(meta?.viewportBookmarks);
        const hydrate = useShotMetadataStore.getState().hydrate;
        hydrate(meta?.shotMetadata ?? EMPTY_SHOT_METADATA);
        // Order matters: only flip `hydrated → true` after the store is fully
        // seeded, then drop the `switching` gate. Inverting these would let
        // the first signature-change subscription fire while the dangerous-
        // empty guard still thought we were mid-switch.
        hydratedRef.current = true;
        switchingRef.current = false;
        setHydratedCanvasId(canvasId);
        if (draftDecision.kind === "conflict") {
          setError(draftDecision.message);
          setSyncStatus("conflict");
        } else {
          setSyncStatus("ready");
          consumeQueuedLocalFreezoneProjections(project, canvasId);
        }
      } catch (err) {
        if (cancelled) return;
        // Stay non-hydrated on failure so an autosave triggered by a stray
        // store mutation in the error overlay does not slip through.
        hydratedRef.current = false;
        switchingRef.current = false;
        setRevision(null);
        setHydratedCanvasId(null);
        setError(err instanceof Error ? err.message : String(err));
        setSyncStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      hydrateFlight.release();
      setFreezoneCanvasMetadata(null);
    };
    // setCanvasData is a stable Zustand setter; project/canvasId (or a manual
    // retry bumping reloadKey) trigger a fresh hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, canvasId, reloadKey]);

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

  const retry = () => {
    // The user picked "refresh" on the conflict overlay — discard the local
    // snapshot so a future 409 starts fresh. If they wanted to keep it, they
    // would have clicked the "下载本地 JSON" button first.
    canvasConflictRecovery.discard(project, canvasId);
    setReloadKey((k) => k + 1);
  };
  const saveCopy = async () => {
    const shot = useShotMetadataStore.getState().shot;
    const result = await canvasConflictRecovery.saveCopy({
      project,
      sourceCanvasId: canvasId,
      envelope: canvasEnvelopeRef.current,
      shotMetadata: shot,
    });
    revisionRef.current = result.revision;
    setRevision(revisionRef.current);
    setBackupStatus(result.backupStatus);
    // Conflict copy is its own fresh save attempt; clear any stale pending id.
    saveController.resetIdentity();
    setSyncStatus("ready");
    setError(null);
    return result.canvasId;
  };

  const restoreMainlineDefault = async (options?: { bestEffort?: boolean }) => {
    return await refreshCanvasPreset({
      project,
      canvasId,
      preset: metadata?.preset,
      revision,
      hydratedCanvasId,
      userEditsSinceHydrate:
        useCanvasStore.getState().userEditsSinceHydrate,
      bestEffort: options?.bestEffort,
      readRevision: () => revisionRef.current,
      flush,
      reload: () => setReloadKey((key) => key + 1),
      setStatus: setSyncStatus,
      setError,
    });
  };

  return {
    status,
    error,
    metadata,
    revision,
    hydratedCanvasId,
    backupStatus,
    flush,
    retry,
    saveCopy,
    restoreMainlineDefault,
    readConflictSnapshot: () =>
      canvasConflictRecovery.readSnapshot(canvasId),
    clearConflictSnapshot: () =>
      canvasConflictRecovery.clearSnapshot(canvasId),
  };
}
