// Copyright (c) 2026 AI anime
import { useEffect } from "react";

import type { CanvasDraftPersistenceController } from "./useCanvasDraftPersistenceController";
import type {
  LocalProjectionPayload,
  RemoteCanvasMerge,
} from "../application/canvasRuntimeState";
import type {
  CanvasProjectionEdge,
  CanvasProjectionNode,
} from "../application/canvasProjectionGraph";
import type { CanvasSyncStatus } from "../application/canvasSyncStorage";
import type { FreezoneCanvasPayload } from "../domain/canvasStorage";
import type { ShotMetadata } from "../domain/shotMetadata";
import type { CanvasSaveController } from "./useCanvasSaveController";

interface ValueRef<T> {
  current: T;
}

type CanvasMetadata = Record<string, unknown> & {
  shotMetadata?: ShotMetadata;
};

export interface CanvasRuntimeBridgeState<
  TNode extends CanvasProjectionNode = CanvasProjectionNode,
  TEdge extends CanvasProjectionEdge = CanvasProjectionEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
  hydrateViewportBookmarks(list: unknown): void;
}

export interface CanvasRuntimeBridgeStore<
  TNode extends CanvasProjectionNode = CanvasProjectionNode,
  TEdge extends CanvasProjectionEdge = CanvasProjectionEdge,
> {
  read(): CanvasRuntimeBridgeState<TNode, TEdge>;
}

interface CanvasRuntimeBridgeDependencies<
  TNode extends CanvasProjectionNode,
  TEdge extends CanvasProjectionEdge,
> {
  store: CanvasRuntimeBridgeStore<TNode, TEdge>;
  registerRuntime(
    project: string,
    canvasId: string,
    apply: (
      remote: FreezoneCanvasPayload,
      merge?: RemoteCanvasMerge<TNode, TEdge>,
    ) => void,
    flush: () => Promise<boolean>,
    applyProjection: (
      projection: LocalProjectionPayload<TNode, TEdge>,
    ) => boolean,
    removeProjection: (projectionKey: string) => boolean,
  ): () => void;
  contentSignature(nodes: TNode[], edges: TEdge[]): string;
  envelopeFromRemote(
    remote: FreezoneCanvasPayload,
  ): Partial<FreezoneCanvasPayload>;
  mergeProjectionGraph(
    remoteNodes: TNode[],
    remoteEdges: TEdge[],
    localNodes: TNode[],
    localEdges: TEdge[],
    projectionKey: string,
  ): { nodes: TNode[]; edges: TEdge[] };
  removeProjectionGraph(
    localNodes: TNode[],
    localEdges: TEdge[],
    projectionKey: string,
  ): { nodes: TNode[]; edges: TEdge[] };
  mergeProjectionMetadata(
    current: Record<string, unknown> | null,
    incoming: Record<string, unknown> | null | undefined,
    projectionKey: string,
  ): Record<string, unknown> | null;
  removeProjectionMetadata(
    current: Record<string, unknown> | null,
    projectionKey: string,
  ): Record<string, unknown> | null;
  publishCanvasMetadata(metadata: Record<string, unknown> | null): void;
  hydrateShotMetadata(metadata: ShotMetadata): void;
  emptyShotMetadata: ShotMetadata;
  schedule(callback: () => void, delayMs: number): unknown;
}

export interface CanvasRuntimeBridgeOptions<
  TNode extends CanvasProjectionNode = CanvasProjectionNode,
  TEdge extends CanvasProjectionEdge = CanvasProjectionEdge,
> {
  project: string;
  canvasId: string;
  revisionRef: ValueRef<number | null>;
  canvasEnvelopeRef: ValueRef<Partial<FreezoneCanvasPayload>>;
  lastSignatureRef: ValueRef<string | null>;
  lastRemoteNodeCountRef: ValueRef<number>;
  metadataRef: ValueRef<Record<string, unknown> | null>;
  hydratedRef: ValueRef<boolean>;
  switchingRef: ValueRef<boolean>;
  statusRef: ValueRef<CanvasSyncStatus>;
  suppressNextCanvasAutosaveRef: ValueRef<boolean>;
  draftPersistence: CanvasDraftPersistenceController<TNode, TEdge>;
  readSaveController(): CanvasSaveController;
  setCanvasData(nodes: TNode[], edges: TEdge[]): void;
  applyCanvasDataEdit(nodes: TNode[], edges: TEdge[]): void;
  setRevision(revision: number | null): void;
  setMetadata(metadata: Record<string, unknown> | null): void;
  setHydratedCanvasId(canvasId: string | null): void;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
}

export function createUseCanvasRuntimeBridge<
  TNode extends CanvasProjectionNode,
  TEdge extends CanvasProjectionEdge,
>(dependencies: CanvasRuntimeBridgeDependencies<TNode, TEdge>) {
  return function useCanvasRuntimeBridge({
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
    readSaveController,
    setCanvasData,
    applyCanvasDataEdit,
    setRevision,
    setMetadata,
    setHydratedCanvasId,
    setStatus,
    setError,
  }: CanvasRuntimeBridgeOptions<TNode, TEdge>): void {
    useEffect(() => {
      const saveProjectionEditNow = () => {
        dependencies.schedule(() => {
          if (!hydratedRef.current || switchingRef.current) return;
          draftPersistence.persistNow();
          if (
            statusRef.current === "conflict" ||
            statusRef.current === "error"
          ) {
            return;
          }
          void readSaveController().saveCurrent();
        }, 0);
      };

      return dependencies.registerRuntime(
        project,
        canvasId,
        (remote, merge) => {
          const saveController = readSaveController();
          saveController.cancelPendingSave();
          switchingRef.current = true;
          const local = dependencies.store.read();
          const remoteNodes = (remote.nodes ?? []) as TNode[];
          const remoteEdges = (remote.edges ?? []) as TEdge[];
          const next = merge
            ? merge(remoteNodes, remoteEdges, local.nodes, local.edges)
            : { nodes: remoteNodes, edges: remoteEdges };
          const remoteSignature = dependencies.contentSignature(
            remoteNodes,
            remoteEdges,
          );
          const nextSignature = dependencies.contentSignature(
            next.nodes,
            next.edges,
          );
          const mergedLocalWork =
            Boolean(merge) && nextSignature !== remoteSignature;
          const remoteRevision =
            typeof remote.revision === "number" ? remote.revision : null;
          revisionRef.current = remoteRevision;
          setRevision(remoteRevision);
          canvasEnvelopeRef.current = dependencies.envelopeFromRemote(remote);
          lastSignatureRef.current = nextSignature;
          lastRemoteNodeCountRef.current = remoteNodes.length;
          saveController.resetIdentity();
          draftPersistence.clearStored();
          const metadata = (remote.metadata ?? null) as CanvasMetadata | null;
          metadataRef.current = metadata;
          setMetadata(metadata);
          dependencies.publishCanvasMetadata(metadata);
          dependencies.store
            .read()
            .hydrateViewportBookmarks(metadata?.viewportBookmarks);
          dependencies.hydrateShotMetadata(
            metadata?.shotMetadata ?? dependencies.emptyShotMetadata,
          );
          setCanvasData(next.nodes, next.edges);
          setStatus("ready");
          setError(null);
          hydratedRef.current = true;
          switchingRef.current = false;
          setHydratedCanvasId(canvasId);
          if (mergedLocalWork) {
            dependencies.schedule(() => {
              if (!hydratedRef.current || switchingRef.current) return;
              void saveController.saveCurrent();
            }, 0);
          }
        },
        () => readSaveController().flush(),
        (projection) => {
          if (!hydratedRef.current || switchingRef.current) {
            return false;
          }
          const local = dependencies.store.read();
          const next = dependencies.mergeProjectionGraph(
            projection.nodes,
            projection.edges,
            local.nodes,
            local.edges,
            projection.projectionKey,
          );
          metadataRef.current = dependencies.mergeProjectionMetadata(
            metadataRef.current,
            projection.metadata,
            projection.projectionKey,
          );
          setMetadata(metadataRef.current);
          dependencies.publishCanvasMetadata(metadataRef.current);
          suppressNextCanvasAutosaveRef.current = true;
          applyCanvasDataEdit(next.nodes, next.edges);
          saveProjectionEditNow();
          return true;
        },
        (projectionKey) => {
          if (!hydratedRef.current || switchingRef.current) {
            return false;
          }
          const local = dependencies.store.read();
          const next = dependencies.removeProjectionGraph(
            local.nodes,
            local.edges,
            projectionKey,
          );
          metadataRef.current = dependencies.removeProjectionMetadata(
            metadataRef.current,
            projectionKey,
          );
          setMetadata(metadataRef.current);
          dependencies.publishCanvasMetadata(metadataRef.current);
          suppressNextCanvasAutosaveRef.current = true;
          applyCanvasDataEdit(next.nodes, next.edges);
          saveProjectionEditNow();
          return true;
        },
      );
    }, [applyCanvasDataEdit, project, canvasId, setCanvasData]);
  };
}
