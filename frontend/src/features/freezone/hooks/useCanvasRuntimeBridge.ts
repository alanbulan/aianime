// Copyright (c) 2026 AI anime
import { useEffect } from "react";

import {
  useCanvasStore,
  type CanvasEdge,
  type CanvasNode,
} from "@/features/canvas/canvasStore";
import type { FreezoneCanvasPayload } from "@/features/freezone/domain/canvasStorage";

import { canvasEnvelopeFromRemote } from "../application/canvasSyncCore";
import { canvasContentSignature } from "../application/canvasSyncHydration";
import type { CanvasSyncStatus } from "../application/canvasSyncStorage";
import { setFreezoneCanvasMetadata } from "../canvasMetadataContext";
import { registerFreezoneCanvasRuntime } from "../canvasSyncRuntime";
import {
  mergeProjectedCanvasWithLocalCanvas,
  removeProjectionFromLocalCanvas,
} from "../application/canvasProjectionGraph";
import {
  mergeProjectionMetadata,
  removeProjectionMetadata,
} from "../domain/canvasProjectionMetadata";
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

type CanvasMetadata = Record<string, unknown> & {
  shotMetadata?: ShotMetadata;
};

export interface CanvasRuntimeBridgeOptions {
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
  draftPersistence: CanvasDraftPersistenceController;
  readSaveController(): CanvasSaveController;
  setCanvasData(nodes: CanvasNode[], edges: CanvasEdge[]): void;
  applyCanvasDataEdit(nodes: CanvasNode[], edges: CanvasEdge[]): void;
  setRevision(revision: number | null): void;
  setMetadata(metadata: Record<string, unknown> | null): void;
  setHydratedCanvasId(canvasId: string | null): void;
  setStatus(status: CanvasSyncStatus): void;
  setError(error: string | null): void;
}

export function useCanvasRuntimeBridge({
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
}: CanvasRuntimeBridgeOptions): void {
  useEffect(() => {
    const saveProjectionEditNow = () => {
      window.setTimeout(() => {
        if (!hydratedRef.current || switchingRef.current) return;
        draftPersistence.persistNow();
        if (statusRef.current === "conflict" || statusRef.current === "error") {
          return;
        }
        void readSaveController().saveCurrent();
      }, 0);
    };

    return registerFreezoneCanvasRuntime(
      project,
      canvasId,
      (remote, merge) => {
        const saveController = readSaveController();
        saveController.cancelPendingSave();
        switchingRef.current = true;
        const local = useCanvasStore.getState();
        const remoteNodes = (remote.nodes ?? []) as CanvasNode[];
        const remoteEdges = (remote.edges ?? []) as CanvasEdge[];
        const next = merge
          ? merge(remoteNodes, remoteEdges, local.nodes, local.edges)
          : { nodes: remoteNodes, edges: remoteEdges };
        const remoteSignature = canvasContentSignature(
          remoteNodes,
          remoteEdges,
        );
        const nextSignature = canvasContentSignature(next.nodes, next.edges);
        const mergedLocalWork =
          Boolean(merge) && nextSignature !== remoteSignature;
        const remoteRevision =
          typeof remote.revision === "number" ? remote.revision : null;
        revisionRef.current = remoteRevision;
        setRevision(remoteRevision);
        canvasEnvelopeRef.current = canvasEnvelopeFromRemote(remote);
        lastSignatureRef.current = nextSignature;
        lastRemoteNodeCountRef.current = remoteNodes.length;
        saveController.resetIdentity();
        draftPersistence.clearStored();
        const metadata = (remote.metadata ?? null) as CanvasMetadata | null;
        metadataRef.current = metadata;
        setMetadata(metadata);
        setFreezoneCanvasMetadata(metadata);
        useCanvasStore
          .getState()
          .hydrateViewportBookmarks(metadata?.viewportBookmarks);
        useShotMetadataStore
          .getState()
          .hydrate(metadata?.shotMetadata ?? EMPTY_SHOT_METADATA);
        setCanvasData(next.nodes, next.edges);
        setStatus("ready");
        setError(null);
        hydratedRef.current = true;
        switchingRef.current = false;
        setHydratedCanvasId(canvasId);
        if (mergedLocalWork) {
          window.setTimeout(() => {
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
      },
      (projectionKey) => {
        if (!hydratedRef.current || switchingRef.current) {
          return false;
        }
        const local = useCanvasStore.getState();
        const next = removeProjectionFromLocalCanvas(
          local.nodes,
          local.edges,
          projectionKey,
        );
        metadataRef.current = removeProjectionMetadata(
          metadataRef.current,
          projectionKey,
        );
        setMetadata(metadataRef.current);
        setFreezoneCanvasMetadata(metadataRef.current);
        suppressNextCanvasAutosaveRef.current = true;
        applyCanvasDataEdit(next.nodes, next.edges);
        saveProjectionEditNow();
        return true;
      },
    );
  }, [applyCanvasDataEdit, project, canvasId, setCanvasData]);
}
