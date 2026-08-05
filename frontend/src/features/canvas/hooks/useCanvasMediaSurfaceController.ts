// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from 'react';

import { hydrateAssetDragPayload } from "@/modules/creative_canvas/canvasComposition";
import { isImmersiveViewerActive } from '@/features/viewer-kit/public';
import { spawnCanvasAssetNode, useCanvasHistoryAssetController, useCanvasMediaTransferController, type CanvasAssetDragPayload, type CanvasHistoryAssetController, type CanvasHistoryAssetControllerOptions, type CanvasEventBus, type CanvasAssetNodeSpawnPort, type CanvasMediaPasteEventPort, type CanvasMediaTransferController, type CanvasNodeData, type CanvasNodeType } from '@/modules/creative_canvas/public';

;

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasMediaSurfaceControllerOptions {
  selectedUploadNodeId: string | null;
  getPreferredClientPosition: () => CanvasPosition | null;
  screenToFlowPosition: (position: CanvasPosition) => CanvasPosition;
  createNode: (
    type: CanvasNodeType,
    position: CanvasPosition,
    data?: Partial<CanvasNodeData>,
  ) => string;
  selectNode: (nodeId: string) => void;
  eventBus: Pick<CanvasEventBus, 'publish'>;
  getViewportCenter: CanvasHistoryAssetControllerOptions['getViewportCenter'];
  deleteNode: CanvasHistoryAssetControllerOptions['deleteNode'];
}

export type CanvasMediaSurfaceController = Omit<
  CanvasMediaTransferController,
  'spawnAsset'
> & CanvasHistoryAssetController;

export function useCanvasMediaSurfaceController({
  selectedUploadNodeId,
  getPreferredClientPosition,
  screenToFlowPosition,
  createNode,
  selectNode,
  eventBus,
  getViewportCenter,
  deleteNode,
}: CanvasMediaSurfaceControllerOptions): CanvasMediaSurfaceController {
  const mediaTransferEventPort = useMemo<CanvasMediaPasteEventPort>(
    () => ({
      pasteImageIntoNode: (nodeId, file) => {
        eventBus.publish('upload-node/paste-image', { nodeId, file });
      },
      attachExternalFile: (nodeId, file) => {
        eventBus.publish('upload-node/external-file', { nodeId, file });
      },
    }),
    [eventBus],
  );
  const createUploadNode = useCallback(
    (position: CanvasPosition) =>
      createNode(
        CANVAS_NODE_TYPES.upload,
        position,
        { user_spawned: true } as Partial<CanvasNodeData>,
      ),
    [createNode],
  );
  const hydrateAsset = useCallback(
    (payload: CanvasAssetDragPayload) => hydrateAssetDragPayload(payload),
    [],
  );
  const assetNodeSpawnPort = useMemo<CanvasAssetNodeSpawnPort>(
    () => ({
      addNode: (type, position, data) =>
        createNode(type, position, data as Partial<CanvasNodeData>),
    }),
    [createNode],
  );
  const spawnAssetNode = useCallback(
    (payload: CanvasAssetDragPayload, position: CanvasPosition) =>
      spawnCanvasAssetNode(assetNodeSpawnPort, payload, position),
    [assetNodeSpawnPort],
  );
  const { spawnAsset, ...mediaTransfer } = useCanvasMediaTransferController({
    selectedUploadNodeId,
    getPreferredClientPosition,
    screenToFlowPosition,
    createUploadNode,
    selectNode,
    eventPort: mediaTransferEventPort,
    hydrateAsset,
    spawnAsset: spawnAssetNode,
    isImmersiveViewerActive,
  });
  const historyAssets = useCanvasHistoryAssetController({
    getViewportCenter,
    spawnAsset,
    selectNode,
    deleteNode,
  });

  return {
    ...mediaTransfer,
    ...historyAssets,
  };
}
