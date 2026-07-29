// Copyright (c) 2026 AI anime
import { useEffect } from "react";
import type { Viewport } from "@xyflow/react";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import type {
  CanvasBackupStatus,
  FreezoneCanvasPayload,
} from "@/features/freezone/domain/canvasStorage";

import { canvasDraftSignature } from "../application/canvasDraft";
import { canvasEnvelopeFromRemote } from "../application/canvasSyncCore";
import {
  canvasContentSignature,
  decideHydrateDraft,
} from "../application/canvasSyncHydration";
import {
  isCanvasSyncViewport,
  type CanvasSyncStatus,
} from "../application/canvasSyncStorage";
import { canvasConflictRecovery } from "../canvasConflictRecoveryComposition";
import { scheduleCanvasDraftPruneOnce } from "../canvasDraftComposition";
import { canvasHydrateFlightCoordinator } from "../canvasHydrationComposition";
import { setFreezoneCanvasMetadata } from "../canvasMetadataContext";
import { canvasSyncStorageGateway } from "../canvasSyncComposition";
import { consumeQueuedLocalFreezoneProjections } from "../canvasSyncRuntime";
import {
  EMPTY_SHOT_METADATA,
  useShotMetadataStore,
  type ShotMetadata,
} from "../shotMetadataStore";
import type { CanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";
import type { CanvasSaveController } from "./useCanvasSaveController";

interface ValueRef<T> {
  current: T;
}

interface CanvasViewportPort {
  setViewport(viewport: Viewport, options: { duration: number }): unknown;
}

type CanvasStoreState = ReturnType<typeof useCanvasStore.getState>;
type CanvasMetadata = Record<string, unknown> & {
  shotMetadata?: ShotMetadata;
};

export interface CanvasHydrationLifecycleOptions {
  project: string;
  canvasId: string;
  reloadKey: number;
  revisionRef: ValueRef<number | null>;
  canvasEnvelopeRef: ValueRef<Partial<FreezoneCanvasPayload>>;
  lastSignatureRef: ValueRef<string | null>;
  lastRemoteNodeCountRef: ValueRef<number>;
  metadataRef: ValueRef<Record<string, unknown> | null>;
  hydratedRef: ValueRef<boolean>;
  switchingRef: ValueRef<boolean>;
  lastSavedViewportRef: ValueRef<Viewport | null>;
  draftPersistence: CanvasDraftPersistenceController;
  readSaveController(): CanvasSaveController;
  setCanvasData: CanvasStoreState["setCanvasData"];
  hydrateCanvasDraft: CanvasStoreState["hydrateCanvasDraft"];
  restoreHistory: CanvasStoreState["restoreHistory"];
  setViewportState: CanvasStoreState["setViewportState"];
  viewportPort: CanvasViewportPort;
  setRevision(revision: number | null): void;
  setMetadata(metadata: Record<string, unknown> | null): void;
  setHydratedCanvasId(canvasId: string | null): void;
  setBackupStatus(status: CanvasBackupStatus | null): void;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
}

export function useCanvasHydrationLifecycle({
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
  readSaveController,
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
}: CanvasHydrationLifecycleOptions): void {
  useEffect(() => {
    let cancelled = false;
    scheduleCanvasDraftPruneOnce();
    const hydrateFlight = canvasHydrateFlightCoordinator.acquire(
      project,
      canvasId,
      reloadKey,
    );
    setStatus("loading");
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
    readSaveController().resetIdentity();
    setBackupStatus(null);

    void (async () => {
      try {
        const remote = await hydrateFlight.promise;
        if (cancelled) return;
        const remoteRevision =
          typeof remote.revision === "number" ? remote.revision : null;
        revisionRef.current = remoteRevision;
        setRevision(remoteRevision);
        canvasEnvelopeRef.current = canvasEnvelopeFromRemote(remote);
        const nodes = (remote.nodes ?? []) as Parameters<
          CanvasStoreState["setCanvasData"]
        >[0];
        const edges = (remote.edges ?? []) as Parameters<
          CanvasStoreState["setCanvasData"]
        >[1];
        const metadata = (remote.metadata ?? null) as CanvasMetadata | null;
        const remoteSignature = canvasDraftSignature(nodes, edges, metadata);
        draftPersistence.markPersisted(remoteSignature);
        const draft = draftPersistence.readStored();
        const draftDecision = decideHydrateDraft(
          draft,
          remoteRevision,
          remoteSignature,
          nodes,
          edges,
          metadata,
        );
        lastRemoteNodeCountRef.current = nodes.length;
        if (draftDecision.kind === "draft") {
          const draftMetadata = draftDecision.draft.metadata as
            | CanvasMetadata
            | null;
          metadataRef.current = draftMetadata;
          setMetadata(draftMetadata);
          setFreezoneCanvasMetadata(draftMetadata);
          useShotMetadataStore
            .getState()
            .hydrate(draftMetadata?.shotMetadata ?? EMPTY_SHOT_METADATA);
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
            .hydrateViewportBookmarks(draftMetadata?.viewportBookmarks);
          const draftViewport = isCanvasSyncViewport(
            draftDecision.draft.viewport,
          )
            ? draftDecision.draft.viewport
            : canvasSyncStorageGateway.readViewport(project, canvasId) ??
              (isCanvasSyncViewport(remote.viewport) ? remote.viewport : null);
          if (draftViewport) {
            lastSavedViewportRef.current = draftViewport;
            setViewportState(draftViewport);
            requestAnimationFrame(() => {
              if (cancelled) return;
              viewportPort.setViewport(draftViewport, { duration: 0 });
            });
          }
          canvasSyncStorageGateway.clearHistory(project, canvasId);
          setHydratedCanvasId(canvasId);
          setStatus("ready");
          return;
        }

        if (draftDecision.kind === "conflict") {
          canvasConflictRecovery.capture({
            canvasId,
            nodes: draftDecision.draft.nodes,
            edges: draftDecision.draft.edges,
            viewport: draftDecision.draft.viewport ?? null,
            metadata: draftDecision.draft.metadata ?? null,
            timestamp: new Date(
              draftDecision.draft.updatedAt,
            ).toISOString(),
          });
        } else if (draft) {
          draftPersistence.clearStored();
        }

        setCanvasData(nodes, edges);
        const hydrated = useCanvasStore.getState();
        lastSignatureRef.current = canvasContentSignature(
          hydrated.nodes,
          hydrated.edges,
        );
        const storedHistory = canvasSyncStorageGateway.readHistory(
          project,
          canvasId,
        );
        if (
          storedHistory &&
          storedHistory.signature === lastSignatureRef.current
        ) {
          restoreHistory({
            past: storedHistory.past,
            future: storedHistory.future,
          });
        }
        canvasSyncStorageGateway.clearHistory(project, canvasId);
        const savedViewport =
          canvasSyncStorageGateway.readViewport(project, canvasId) ??
          (isCanvasSyncViewport(remote.viewport) ? remote.viewport : null);
        if (savedViewport) {
          lastSavedViewportRef.current = savedViewport;
          setViewportState(savedViewport);
          requestAnimationFrame(() => {
            if (cancelled) return;
            viewportPort.setViewport(savedViewport, { duration: 0 });
          });
        }
        metadataRef.current = metadata;
        setMetadata(metadata);
        setFreezoneCanvasMetadata(metadata);
        useCanvasStore
          .getState()
          .hydrateViewportBookmarks(metadata?.viewportBookmarks);
        useShotMetadataStore
          .getState()
          .hydrate(metadata?.shotMetadata ?? EMPTY_SHOT_METADATA);
        hydratedRef.current = true;
        switchingRef.current = false;
        setHydratedCanvasId(canvasId);
        if (draftDecision.kind === "conflict") {
          setError(draftDecision.message);
          setStatus("conflict");
        } else {
          setStatus("ready");
          consumeQueuedLocalFreezoneProjections(project, canvasId);
        }
      } catch (error) {
        if (cancelled) return;
        hydratedRef.current = false;
        switchingRef.current = false;
        setRevision(null);
        setHydratedCanvasId(null);
        setError(error instanceof Error ? error.message : String(error));
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      hydrateFlight.release();
      setFreezoneCanvasMetadata(null);
    };
    // Store setters and refs are stable; identity or retry changes own the flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, canvasId, reloadKey]);
}
