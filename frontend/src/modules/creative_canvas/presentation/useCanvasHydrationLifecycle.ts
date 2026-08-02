// Copyright (c) 2026 AI anime
import { useEffect } from "react";

import type { CanvasConflictRecovery } from "../application/canvasConflictRecovery";
import type { CanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";
import type { CanvasHydrateFlightCoordinator } from "../application/canvasHydrateFlights";
import {
  canvasContentSignature,
  decideHydrateDraft,
  type CanvasHydrationEdge,
  type CanvasHydrationNode,
} from "../application/canvasSyncHydration";
import {
  isCanvasSyncViewport,
  type CanvasSyncHistoryState,
  type CanvasSyncStatus,
  type CanvasSyncStorageGateway,
  type CanvasSyncViewport,
} from "../application/canvasSyncStorage";
import { canvasDraftSignature } from "../application/canvasDraft";
import { canvasEnvelopeFromRemote } from "../application/canvasSyncCore";
import type { ShotMetadataStateGateway } from "../application/shotMetadataState";
import type { CanvasBackupStatus, FreezoneCanvasPayload } from "../domain/canvasStorage";
import type { CanvasMutationState } from "../domain/canvasMutation";
import { EMPTY_SHOT_METADATA, type ShotMetadata } from "../domain/shotMetadata";
import type { CanvasSaveController } from "./useCanvasSaveController";

interface ValueRef<T> {
  current: T;
}

interface CanvasViewportPort {
  setViewport(
    viewport: CanvasSyncViewport,
    options: { duration: number },
  ): unknown;
}

type CanvasMetadata = Record<string, unknown> & {
  shotMetadata?: ShotMetadata;
};

export interface CanvasHydrationLifecycleState<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
  userEditsSinceHydrate: number;
  hydrateViewportBookmarks(list: unknown): void;
}

export interface CanvasHydrationLifecycleStore<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
  read(): CanvasHydrationLifecycleState<TNode, TEdge>;
}

interface CanvasHydrationLifecycleDependencies<
  TNode extends CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge,
> {
  store: CanvasHydrationLifecycleStore<TNode, TEdge>;
  hydrateFlights: CanvasHydrateFlightCoordinator;
  syncStorage: Pick<
    CanvasSyncStorageGateway,
    "readHistory" | "clearHistory" | "readViewport"
  >;
  conflictRecovery: Pick<CanvasConflictRecovery, "capture">;
  scheduleDraftPrune(): void;
  publishCanvasMetadata(metadata: Record<string, unknown> | null): void;
  shotMetadataState: Pick<ShotMetadataStateGateway, "hydrate">;
  consumeQueuedProjections(project: string, canvasId: string): void;
  scheduleFrame(callback: () => void): unknown;
}

export interface CanvasHydrationLifecycleOptions<
  TNode extends CanvasHydrationNode = CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge = CanvasHydrationEdge,
> {
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
  lastSavedViewportRef: ValueRef<CanvasSyncViewport | null>;
  draftPersistence: CanvasDraftPersistenceController<TNode, TEdge>;
  readSaveController(): CanvasSaveController;
  setCanvasData(nodes: TNode[], edges: TEdge[]): void;
  hydrateCanvasDraft(draft: {
    nodes: TNode[];
    edges: TEdge[];
    history?: CanvasSyncHistoryState<TNode, TEdge> | null;
    mutation: CanvasMutationState;
  }): void;
  restoreHistory(history: CanvasSyncHistoryState<TNode, TEdge>): void;
  setViewportState(viewport: CanvasSyncViewport): void;
  viewportPort: CanvasViewportPort;
  setRevision(revision: number | null): void;
  setMetadata(metadata: Record<string, unknown> | null): void;
  setHydratedCanvasId(canvasId: string | null): void;
  setBackupStatus(status: CanvasBackupStatus | null): void;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
}

export function createUseCanvasHydrationLifecycle<
  TNode extends CanvasHydrationNode,
  TEdge extends CanvasHydrationEdge,
>(dependencies: CanvasHydrationLifecycleDependencies<TNode, TEdge>) {
  return function useCanvasHydrationLifecycle({
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
  }: CanvasHydrationLifecycleOptions<TNode, TEdge>): void {
    useEffect(() => {
      let cancelled = false;
      dependencies.scheduleDraftPrune();
      const hydrateFlight = dependencies.hydrateFlights.acquire(
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
          const nodes = (remote.nodes ?? []) as TNode[];
          const edges = (remote.edges ?? []) as TEdge[];
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
            dependencies.publishCanvasMetadata(draftMetadata);
            dependencies.shotMetadataState.hydrate(
              draftMetadata?.shotMetadata ?? EMPTY_SHOT_METADATA,
            );
            lastSignatureRef.current = canvasContentSignature(nodes, edges);
            hydratedRef.current = true;
            switchingRef.current = false;
            hydrateCanvasDraft({
              nodes: draftDecision.draft.nodes,
              edges: draftDecision.draft.edges,
              history: draftDecision.draft.history,
              mutation: draftDecision.draft.mutation,
            });
            dependencies.store
              .read()
              .hydrateViewportBookmarks(draftMetadata?.viewportBookmarks);
            const draftViewport = isCanvasSyncViewport(
              draftDecision.draft.viewport,
            )
              ? draftDecision.draft.viewport
              : dependencies.syncStorage.readViewport(project, canvasId) ??
                (isCanvasSyncViewport(remote.viewport) ? remote.viewport : null);
            if (draftViewport) {
              lastSavedViewportRef.current = draftViewport;
              setViewportState(draftViewport);
              dependencies.scheduleFrame(() => {
                if (cancelled) return;
                viewportPort.setViewport(draftViewport, { duration: 0 });
              });
            }
            dependencies.syncStorage.clearHistory(project, canvasId);
            setHydratedCanvasId(canvasId);
            setStatus("ready");
            return;
          }

          if (draftDecision.kind === "conflict") {
            dependencies.conflictRecovery.capture({
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
          const hydrated = dependencies.store.read();
          lastSignatureRef.current = canvasContentSignature(
            hydrated.nodes,
            hydrated.edges,
          );
          const storedHistory = dependencies.syncStorage.readHistory<
            TNode,
            TEdge
          >(project, canvasId);
          if (
            storedHistory &&
            storedHistory.signature === lastSignatureRef.current
          ) {
            restoreHistory({
              past: storedHistory.past,
              future: storedHistory.future,
            });
          }
          dependencies.syncStorage.clearHistory(project, canvasId);
          const savedViewport =
            dependencies.syncStorage.readViewport(project, canvasId) ??
            (isCanvasSyncViewport(remote.viewport) ? remote.viewport : null);
          if (savedViewport) {
            lastSavedViewportRef.current = savedViewport;
            setViewportState(savedViewport);
            dependencies.scheduleFrame(() => {
              if (cancelled) return;
              viewportPort.setViewport(savedViewport, { duration: 0 });
            });
          }
          metadataRef.current = metadata;
          setMetadata(metadata);
          dependencies.publishCanvasMetadata(metadata);
          dependencies.store
            .read()
            .hydrateViewportBookmarks(metadata?.viewportBookmarks);
          dependencies.shotMetadataState.hydrate(
            metadata?.shotMetadata ?? EMPTY_SHOT_METADATA,
          );
          hydratedRef.current = true;
          switchingRef.current = false;
          setHydratedCanvasId(canvasId);
          if (draftDecision.kind === "conflict") {
            setError(draftDecision.message);
            setStatus("conflict");
          } else {
            setStatus("ready");
            dependencies.consumeQueuedProjections(project, canvasId);
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
        dependencies.publishCanvasMetadata(null);
      };
      // Store setters and refs are stable; identity or retry changes own the flight.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project, canvasId, reloadKey]);
  };
}
