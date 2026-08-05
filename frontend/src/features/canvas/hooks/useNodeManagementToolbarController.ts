// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useCanvasStore } from "@/features/canvas/canvasStore";

import { deriveNodeDropInfo, projectNodeManagementToolbar, publishCanvasCommitRequested, publishCanvasProjectionRemovalRequested, publishCanvasProjectionSyncRequested, useCanvasProjectionStatus, type CanvasNode, isAudioNode, isImageGenNode, isProtectedProjectionGroupNode, isVideoNode } from "@/modules/creative_canvas/public";

export interface NodeManagementToolbarControllerOptions {
  node: CanvasNode;
}

export function useNodeManagementToolbarController({
  node,
}: NodeManagementToolbarControllerOptions) {
  const { t } = useTranslation();
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const projection = useMemo(
    () =>
      projectNodeManagementToolbar({
        projectionKey: isProtectedProjectionGroupNode(node)
          ? node.data.projection_key
          : null,
        canRemove:
          !isImageGenNode(node) && !isVideoNode(node) && !isAudioNode(node),
        sourceUrl: deriveNodeDropInfo(node)?.sourceUrl ?? null,
      }),
    [node],
  );
  const projectionStatus = useCanvasProjectionStatus(
    projection.projectionKey,
  );

  const syncProjection = useCallback(() => {
    if (!projection.projectionKey) return;
    publishCanvasProjectionSyncRequested(projection.projectionKey);
  }, [projection.projectionKey]);

  const remove = useCallback(() => {
    if (projection.removalTarget === "projection" && projection.projectionKey) {
      publishCanvasProjectionRemovalRequested(projection.projectionKey);
      return;
    }
    if (projection.removalTarget === "node") {
      deleteNode(node.id);
    }
  }, [deleteNode, node.id, projection.projectionKey, projection.removalTarget]);

  const commit = useCallback(() => {
    if (!projection.canCommit) return;
    publishCanvasCommitRequested({ nodeId: node.id });
  }, [node.id, projection.canCommit]);

  return {
    ...projection,
    t,
    projectionIsStale: projectionStatus?.stale === true,
    syncProjection,
    remove,
    commit,
  };
}

export type NodeManagementToolbarController = ReturnType<
  typeof useNodeManagementToolbarController
>;
