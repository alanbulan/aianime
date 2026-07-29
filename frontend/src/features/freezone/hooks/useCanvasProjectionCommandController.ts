// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef } from "react";

import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import type { CanvasEdge, CanvasNode } from "@/features/canvas/canvasStore";

import {
  consumeQueuedLocalFreezoneProjections,
  queueLocalFreezoneProjection,
  removeLocalFreezoneProjection,
} from "../canvasSyncRuntime";
import { buildProjectionFromPreset } from "../composition";
import {
  projectionMetadataWithRequest,
  requestFromProjectionMetadata,
} from "../domain/canvasProjectionMetadata";
import { projectionTargetForCanvasPanel } from "../domain/canvasProjectionRequest";
import { markCanvasProjectionFresh } from "../projectionStatusStore";

export interface CanvasProjectionCommandMessages {
  syncMissingRequest: string;
  syncSuccess: string;
  removeBlocked: string;
  removeSuccess: string;
}

export interface CanvasProjectionCommandControllerOptions {
  projectId: string;
  canvasId: string;
  metadata: Record<string, unknown> | null;
  messages: CanvasProjectionCommandMessages;
  onMessage: (message: string) => void;
}

export function useCanvasProjectionCommandController({
  projectId,
  canvasId,
  metadata,
  messages,
  onMessage,
}: CanvasProjectionCommandControllerOptions): void {
  const syncingProjectionRef = useRef<string | null>(null);
  const removingProjectionRef = useRef<string | null>(null);
  const {
    syncMissingRequest,
    syncSuccess,
    removeBlocked,
    removeSuccess,
  } = messages;

  const handleSyncProjection = useCallback(async (projectionKey: string) => {
    if (syncingProjectionRef.current) return;
    const request = requestFromProjectionMetadata(metadata, projectionKey);
    if (!request) {
      onMessage(syncMissingRequest);
      return;
    }
    syncingProjectionRef.current = projectionKey;
    try {
      const target = projectionTargetForCanvasPanel({
        currentCanvasId: canvasId,
        request,
      });
      const projection = await buildProjectionFromPreset(projectId, {
        ...request,
        projection_key: target.projectionKey,
        base_revision: 0,
        force_refresh: true,
      });
      queueLocalFreezoneProjection(projectId, target.targetCanvasId, {
        projectionKey: target.projectionKey,
        nodes: (projection.nodes ?? []) as CanvasNode[],
        edges: (projection.edges ?? []) as CanvasEdge[],
        metadata: projectionMetadataWithRequest(
          projection.metadata ?? null,
          target.projectionKey,
          request,
          projection.facts_signature,
        ),
      });
      consumeQueuedLocalFreezoneProjections(projectId, target.targetCanvasId);
      markCanvasProjectionFresh(target.projectionKey);
      onMessage(syncSuccess);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      syncingProjectionRef.current = null;
    }
  }, [canvasId, metadata, onMessage, projectId, syncMissingRequest, syncSuccess]);

  const handleRemoveProjection = useCallback(async (projectionKey: string) => {
    if (removingProjectionRef.current) return;
    removingProjectionRef.current = projectionKey;
    try {
      const removed = removeLocalFreezoneProjection(projectId, canvasId, projectionKey);
      if (!removed) {
        throw new Error(removeBlocked);
      }
      onMessage(removeSuccess);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : String(error));
    } finally {
      removingProjectionRef.current = null;
    }
  }, [canvasId, onMessage, projectId, removeBlocked, removeSuccess]);

  useEffect(() => {
    const unsubscribeSync = canvasEventBus.subscribe(
      "freezone/projection-sync",
      ({ projectionKey }) => {
        void handleSyncProjection(projectionKey);
      },
    );
    const unsubscribeRemove = canvasEventBus.subscribe(
      "freezone/projection-remove",
      ({ projectionKey }) => {
        void handleRemoveProjection(projectionKey);
      },
    );

    return () => {
      unsubscribeSync();
      unsubscribeRemove();
    };
  }, [handleRemoveProjection, handleSyncProjection]);
}
