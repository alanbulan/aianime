// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import { projectNodeManagementToolbar } from "@/features/canvas/application/nodeManagementToolbarModel";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import { useCanvasProjectionStatus } from "@/features/freezone/public";

export interface NodeManagementToolbarControllerOptions {
  node: CanvasNode;
}

export function useNodeManagementToolbarController({
  node,
}: NodeManagementToolbarControllerOptions) {
  const { t } = useTranslation();
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const projection = useMemo(
    () => projectNodeManagementToolbar(node),
    [node],
  );
  const projectionStatus = useCanvasProjectionStatus(
    projection.projectionKey,
  );

  const syncProjection = useCallback(() => {
    if (!projection.projectionKey) return;
    canvasEventBus.publish("freezone/projection-sync", {
      projectionKey: projection.projectionKey,
    });
  }, [projection.projectionKey]);

  const remove = useCallback(() => {
    if (projection.removalTarget === "projection" && projection.projectionKey) {
      canvasEventBus.publish("freezone/projection-remove", {
        projectionKey: projection.projectionKey,
      });
      return;
    }
    if (projection.removalTarget === "node") {
      deleteNode(node.id);
    }
  }, [deleteNode, node.id, projection.projectionKey, projection.removalTarget]);

  const commit = useCallback(() => {
    if (!projection.canCommit) return;
    canvasEventBus.publish("freezone/commit-node", { nodeId: node.id });
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
