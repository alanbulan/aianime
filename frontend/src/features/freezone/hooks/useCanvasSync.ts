// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useReactFlow, type Viewport } from "@xyflow/react";
import {
  useCanvasStore,
  type CanvasEdge,
  type CanvasNode,
} from "@/features/canvas/canvasStore";
import { createCanvasFromPreset } from "@/features/canvas/composition";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "@/features/freezone/domain/canvasStorage";
import {
  canvasEnvelopeFromRemote,
  saveErrorStatusAndBody,
} from "../application/canvasSyncCore";
import {
  canvasContentSignature,
  decideHydrateDraft,
  shouldAbortBestEffortPresetRefresh,
  shouldDeferPresetRefreshUntilReady,
  shouldFlushBeforePresetRefresh,
} from "../application/canvasSyncHydration";
import { presetRequestFromMetadata } from "../application/canvasPreset";
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
import {
  consumeQueuedLocalFreezoneProjections,
  registerFreezoneCanvasRuntime,
} from "../canvasSyncRuntime";
import {
  mergeProjectedCanvasWithLocalCanvas,
  mergeProjectionMetadata,
  removeProjectionFromLocalCanvas,
  removeProjectionMetadata,
} from "../projections";
import {
  canvasDraftSignature,
} from "../application/canvasDraft";
import {
  canvasDraftStorageGateway,
  scheduleCanvasDraftPruneOnce,
} from "../canvasDraftComposition";
import { canvasHydrateFlightCoordinator } from "../canvasHydrationComposition";
import { scheduleCanvasSave } from "../canvasSaveComposition";
import { saveCanvasBeforeUnload } from "../canvasUnloadSaveComposition";
import { canvasConflictRecovery } from "../canvasConflictRecoveryComposition";

const DEBOUNCE_MS = 800;
const DRAFT_DEBOUNCE_MS = 300;
function viewportsEqual(a: Viewport, b: Viewport): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom;
}

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
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const draftTimerRef = useRef<number | null>(null);
  const suppressNextCanvasAutosaveRef = useRef(false);
  const revisionRef = useRef<number | null>(null);
  const lastPersistedDraftSignatureRef = useRef<string | null>(null);
  const statusRef = useRef<CanvasSyncStatus>("loading");
  const metadataRef = useRef<Record<string, unknown> | null>(null);
  const canvasEnvelopeRef = useRef<Partial<FreezoneCanvasPayload>>({});
  // The idempotency token for the currently pending save attempt. We keep it
  // stable across in-flight retries (network blip, 503 canvas_lock_busy) so the
  // backend can dedupe. A new value is minted when fresh local content needs to
  // be sent (next debounce after a successful save / new edits after failure).
  const pendingClientSaveIdRef = useRef<string | null>(null);
  const pendingClientSaveIdSignatureRef = useRef<string | null>(null);
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

  const writeDraftNow = () => {
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
  // Single source of truth for the persisted metadata blob so every save site
  // (draft write, debounced PUT, flush, beforeunload) carries shotMetadata AND
  // viewportBookmarks. Omitting bookmarks at any PUT site would overwrite the
  // backend copy with nothing — hence: route ALL save sites through here.
  const buildPersistMetadata = (shot: ShotMetadata) => ({
    ...(metadataRef.current ?? {}),
    shotMetadata: shot,
    viewportBookmarks: useCanvasStore.getState().viewportBookmarks,
  });
  const scheduleDraftWrite = () => {
    if (draftTimerRef.current != null) {
      window.clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null;
      writeDraftNow();
    }, DRAFT_DEBOUNCE_MS);
  };
  const clearDraftTimerAndDraft = () => {
    if (draftTimerRef.current != null) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    canvasDraftStorageGateway.clearDraft(project, canvasId);
  };

  // Publish the backend's `backup_status` to React state so FreezoneShell
  // can render the pending / failed indicator.
  const publishBackupStatus = (next: CanvasBackupStatus | null) => {
    setBackupStatus(next);
  };

  // ---- 0. External-trigger remote canvas refresh ---- //
  // canvasSyncRuntime lets other features (beat-context preset refresh,
  // mainline rebuild) hand us a fresh server payload to apply in place.
  // We mirror the hydrate path: stop any pending debounce, re-anchor the
  // signature/revision/envelope so the next local edit doesn't immediately
  // re-PUT with stale baseline, then push the new content into the store.
  useEffect(() => {
    const saveProjectionEditNow = () => {
      window.setTimeout(() => {
        if (!hydratedRef.current || switchingRef.current) return;
        writeDraftNow();
        if (statusRef.current === "conflict" || statusRef.current === "error") {
          return;
        }
        const canvasState = useCanvasStore.getState();
        const shot = useShotMetadataStore.getState().shot;
        lastSavedViewportRef.current = canvasState.currentViewport;
        void scheduleCanvasSave({
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
          setStatus: setSyncStatus,
          setError,
          inFlightRef,
          publishBackupStatus,
          publishRevision: setRevision,
          clearDraftAfterSave: clearDraftTimerAndDraft,
          markDraftPersisted: (signature) => {
            lastPersistedDraftSignatureRef.current = signature;
          },
        });
      }, 0);
    };

    return registerFreezoneCanvasRuntime(project, canvasId, (remote, merge) => {
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      // Treat this as a brief "switching" window — the same guard the hydrate
      // path uses to suppress in-flight save callbacks from clobbering the
      // freshly-applied remote content.
      switchingRef.current = true;
      const local = useCanvasStore.getState();
      const remoteNodes = (remote.nodes ?? []) as CanvasNode[];
      const remoteEdges = (remote.edges ?? []) as CanvasEdge[];
      const next = merge
        ? merge(remoteNodes, remoteEdges, local.nodes, local.edges)
        : { nodes: remoteNodes, edges: remoteEdges };
      const remoteSignature = canvasContentSignature(remoteNodes, remoteEdges);
      const nextSignature = canvasContentSignature(next.nodes, next.edges);
      const mergedLocalWork = Boolean(merge) && nextSignature !== remoteSignature;
      const remoteRevision =
        typeof remote.revision === "number" ? remote.revision : null;
      revisionRef.current = remoteRevision;
      setRevision(remoteRevision);
      canvasEnvelopeRef.current = canvasEnvelopeFromRemote(remote);
      lastSignatureRef.current = nextSignature;
      lastRemoteNodeCountRef.current = remoteNodes.length;
      pendingClientSaveIdRef.current = null;
      pendingClientSaveIdSignatureRef.current = null;
      canvasDraftStorageGateway.clearDraft(project, canvasId);
      const meta = (remote.metadata ?? null) as
        | (Record<string, unknown> & { shotMetadata?: ShotMetadata })
        | null;
      metadataRef.current = meta;
      setMetadata(meta);
      setFreezoneCanvasMetadata(meta);
      useCanvasStore.getState().hydrateViewportBookmarks(meta?.viewportBookmarks);
      useShotMetadataStore
        .getState()
        .hydrate(meta?.shotMetadata ?? EMPTY_SHOT_METADATA);
      setCanvasData(next.nodes, next.edges);
      setSyncStatus("ready");
      setError(null);
      hydratedRef.current = true;
      switchingRef.current = false;
      setHydratedCanvasId(canvasId);
      if (mergedLocalWork) {
        window.setTimeout(() => {
          if (!hydratedRef.current || switchingRef.current) return;
          const canvasState = useCanvasStore.getState();
          const shot = useShotMetadataStore.getState().shot;
          lastSavedViewportRef.current = canvasState.currentViewport;
          void scheduleCanvasSave({
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
            setStatus: setSyncStatus,
            setError,
            inFlightRef,
            publishBackupStatus,
            publishRevision: setRevision,
            clearDraftAfterSave: clearDraftTimerAndDraft,
            markDraftPersisted: (signature) => {
              lastPersistedDraftSignatureRef.current = signature;
            },
          });
        }, 0);
      }
    }, flush, (projection) => {
      if (!hydratedRef.current || switchingRef.current) {
        return false;
      }
      const local = useCanvasStore.getState();
      const next = mergeProjectedCanvasWithLocalCanvas(
        projection.nodes,
        projection.edges,
        local.nodes,
        local.edges,
        projection.projectionKey,
      );
      metadataRef.current = mergeProjectionMetadata(
        metadataRef.current,
        projection.metadata,
        projection.projectionKey,
      );
      setMetadata(metadataRef.current);
      setFreezoneCanvasMetadata(metadataRef.current);
      suppressNextCanvasAutosaveRef.current = true;
      applyCanvasDataEdit(next.nodes, next.edges);
      saveProjectionEditNow();
      return true;
    }, (projectionKey) => {
      if (!hydratedRef.current || switchingRef.current) {
        return false;
      }
      const local = useCanvasStore.getState();
      const next = removeProjectionFromLocalCanvas(
        local.nodes,
        local.edges,
        projectionKey,
      );
      metadataRef.current = removeProjectionMetadata(metadataRef.current, projectionKey);
      setMetadata(metadataRef.current);
      setFreezoneCanvasMetadata(metadataRef.current);
      suppressNextCanvasAutosaveRef.current = true;
      applyCanvasDataEdit(next.nodes, next.edges);
      saveProjectionEditNow();
      return true;
    });
  }, [applyCanvasDataEdit, project, canvasId, setCanvasData]);

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
    lastPersistedDraftSignatureRef.current = null;
    hydratedRef.current = false;
    switchingRef.current = true;
    lastRemoteNodeCountRef.current = 0;
    pendingClientSaveIdRef.current = null;
    pendingClientSaveIdSignatureRef.current = null;
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
        lastPersistedDraftSignatureRef.current = remoteSignature;
        const draft = canvasDraftStorageGateway.readDraft(project, canvasId);
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
          canvasDraftStorageGateway.clearDraft(project, canvasId);
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

  // ---- 1b. Mirror the undo/redo history to localStorage ---- //
  // The in-memory history stacks vanish on refresh; mirror them (per canvas)
  // on a short debounce plus a synchronous beforeunload write, the same as the
  // viewport. The hydrate effect above restores them when the loaded content
  // still matches. Only `history` changes are mirrored; writes are gated to
  // post-hydrate so a switch/hydrate never persists a half-loaded state, and
  // to `userEditsSinceHydrate > 0` so a pure hydrate-restore (which re-sets the
  // history) does not immediately re-persist the mirror we just cleared — only
  // a real edit since load re-creates it.
  useEffect(() => {
    let timer: number | null = null;
    const writeNow = () => {
      if (!hydratedRef.current || switchingRef.current) {
        return;
      }
      const state = useCanvasStore.getState();
      if (state.userEditsSinceHydrate <= 0) {
        return;
      }
      canvasSyncStorageGateway.writeHistory(
        project,
        canvasId,
        canvasContentSignature(state.nodes, state.edges),
        state.history,
      );
    };
    const unsubscribe = useCanvasStore.subscribe((state, prev) => {
      if (state.history === prev.history) {
        return;
      }
      if (timer != null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(writeNow, 400);
    });
    const handleUnload = () => writeNow();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", handleUnload);
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [project, canvasId]);

  // ---- 2. Debounced save on content changes ---- //
  // Save fires when the persisted canvas shape (nodes/edges) or the
  // shotMetadata changes — never on pure view-state churn.
  useEffect(() => {
    const triggerSave = () => {
      if (!hydratedRef.current || switchingRef.current) return;
      scheduleDraftWrite();
      if (statusRef.current === "conflict" || statusRef.current === "error") {
        return;
      }
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(() => {
        const canvasState = useCanvasStore.getState();
        const shot = useShotMetadataStore.getState().shot;
        lastSavedViewportRef.current = canvasState.currentViewport;
        void scheduleCanvasSave({
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
          setStatus: setSyncStatus,
          setError,
          inFlightRef,
          publishBackupStatus,
          publishRevision: setRevision,
          clearDraftAfterSave: clearDraftTimerAndDraft,
          markDraftPersisted: (signature) => {
            lastPersistedDraftSignatureRef.current = signature;
          },
        });
      }, DEBOUNCE_MS);
    };
    // Only react to changes that alter the persisted nodes/edges shape. View
    // state (viewport, selection, dialogs, image viewer) lives in the same
    // store but is filtered out by the content-signature comparison.
    const unsubscribeCanvas = useCanvasStore.subscribe((state, prev) => {
      if (state.viewportBookmarks !== prev.viewportBookmarks) {
        triggerSave();
      }
      // store 里还住着视口、选中、弹窗等纯视图状态，它们的变更不可能改到 nodes/edges。
      // 数组引用没变就直接放行，连签名都不用算 —— 切页时这里是热点。
      if (state.nodes === prev.nodes && state.edges === prev.edges) {
        // 抑制标志总是紧挨着 applyCanvasDataEdit 设的（同步，中间插不进别的变更），
        // 所以这里必须顺手消费掉：万一那次程序化改写产出的数组原样未变，标志留到
        // 下一次就会把用户真正的编辑连保存带草稿一起吞了。
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
    // shotMetadataStore holds only persisted business metadata, so any change
    // there is save-worthy.
    const unsubscribeShot = useShotMetadataStore.subscribe(triggerSave);
    return () => {
      unsubscribeCanvas();
      unsubscribeShot();
      if (draftTimerRef.current != null) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
        writeDraftNow();
      }
      if (debounceTimerRef.current != null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [project, canvasId]);

  // ---- 2b. Persist the camera position (pan/zoom) to localStorage ---- //
  // Pan/zoom never triggers the content PUT above, so we mirror the live
  // viewport into localStorage (cheap, synchronous) on a short debounce. This
  // is the source of truth that survives a refresh, no backend required.
  useEffect(() => {
    if (status !== "ready") return;
    let timer: number | null = null;
    const unsubscribe = useCanvasStore.subscribe((state) => {
      const viewport = state.currentViewport;
      if (
        lastSavedViewportRef.current != null &&
        viewportsEqual(lastSavedViewportRef.current, viewport)
      ) {
        return;
      }
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        lastSavedViewportRef.current = viewport;
        canvasSyncStorageGateway.writeViewport(project, canvasId, viewport);
      }, 300);
    });
    return () => {
      unsubscribe();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [project, canvasId, status]);

  const flush = async (): Promise<boolean> => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const { nodes, edges, currentViewport } = useCanvasStore.getState();
    const shot = useShotMetadataStore.getState().shot;
    lastSavedViewportRef.current = currentViewport;
    return await scheduleCanvasSave({
      project,
      canvasId,
      nodes,
      edges,
      viewport: currentViewport,
      metadata: buildPersistMetadata(shot),
      revisionRef,
      canvasEnvelopeRef,
      pendingClientSaveIdRef,
      pendingClientSaveIdSignatureRef,
      hydratedRef,
      switchingRef,
      lastRemoteNodeCountRef,
      setStatus: setSyncStatus,
      setError,
      inFlightRef,
      publishBackupStatus,
      publishRevision: setRevision,
      clearDraftAfterSave: clearDraftTimerAndDraft,
      markDraftPersisted: (signature) => {
        lastPersistedDraftSignatureRef.current = signature;
      },
    });
  };

  // Persist the final camera position on tab close. When a debounced content
  // edit is also pending, the application service writes the recovery draft
  // and delegates one best-effort PUT to the keepalive transport.
  useEffect(() => {
    const handler = () => {
      const canvasState = useCanvasStore.getState();
      const shot = useShotMetadataStore.getState().shot;
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
          draftTimerRef.current != null ||
          debounceTimerRef.current != null ||
          inFlightRef.current != null ||
          statusRef.current === "saving",
        hasPendingContentSave: debounceTimerRef.current != null,
        lastPersistedDraftSignature:
          lastPersistedDraftSignatureRef.current,
        cancelPendingDraft: () => {
          if (draftTimerRef.current != null) {
            window.clearTimeout(draftTimerRef.current);
            draftTimerRef.current = null;
          }
        },
        persistDraft: writeDraftNow,
        cancelPendingContentSave: () => {
          if (debounceTimerRef.current != null) {
            window.clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
        },
      });
    };
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
    pendingClientSaveIdRef.current = null;
    pendingClientSaveIdSignatureRef.current = null;
    setSyncStatus("ready");
    setError(null);
    return result.canvasId;
  };

  // Free workflow copies are no longer a separate canvas mode. Keep the
  // metadata envelope pass-through, but do not read/write dedicated fields.

  const restoreMainlineDefault = async (options?: { bestEffort?: boolean }) => {
    const preset = metadata?.preset as Record<string, unknown> | undefined;
    const request = presetRequestFromMetadata(preset);
    if (!request) {
      throw new Error("当前画布不是可恢复的主线 preset");
    }
    if (
      shouldDeferPresetRefreshUntilReady(
        options?.bestEffort,
        revision,
        hydratedCanvasId,
        canvasId,
      )
    ) {
      return canvasId;
    }
    setSyncStatus("saving");
    setError(null);
    try {
      const userEditsSinceHydrate = useCanvasStore.getState().userEditsSinceHydrate;
      if (shouldFlushBeforePresetRefresh(options?.bestEffort, userEditsSinceHydrate)) {
        const flushed = await flush();
        if (!flushed) {
          if (shouldAbortBestEffortPresetRefresh(options?.bestEffort, flushed)) {
            setError(null);
            setSyncStatus("ready");
            return canvasId;
          }
          throw new Error("当前画布还有未保存冲突，处理后再同步主线视图");
        }
      }
      await createCanvasFromPreset(project, {
        ...request,
        canvas_id: canvasId,
        overwrite_existing: true,
        base_revision: revisionRef.current ?? undefined,
      });
      setReloadKey((k) => k + 1);
      return canvasId;
    } catch (err) {
      const status = saveErrorStatusAndBody(err).status;
      if (options?.bestEffort && (status === 409 || status === 503)) {
        setError(null);
        setSyncStatus("ready");
        return canvasId;
      }
      const message =
        status === 409
          ? "主线视图已被其他窗口更新,请刷新后重试"
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
      setSyncStatus("error");
      throw new Error(message);
    }
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
