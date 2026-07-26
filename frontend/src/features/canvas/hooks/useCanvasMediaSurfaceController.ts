// Copyright (c) 2026 AI anime
import {
  useCanvasHistoryAssetController,
  type CanvasHistoryAssetController,
  type CanvasHistoryAssetControllerOptions,
} from './useCanvasHistoryAssetController';
import {
  useCanvasMediaTransferController,
  type CanvasMediaTransferController,
  type CanvasMediaTransferControllerOptions,
} from './useCanvasMediaTransferController';

export interface CanvasMediaSurfaceControllerOptions {
  selectedUploadNodeId:
    CanvasMediaTransferControllerOptions['selectedUploadNodeId'];
  getPreferredClientPosition:
    CanvasMediaTransferControllerOptions['getPreferredClientPosition'];
  screenToFlowPosition:
    CanvasMediaTransferControllerOptions['screenToFlowPosition'];
  createNode: CanvasMediaTransferControllerOptions['createNode'];
  selectNode: CanvasMediaTransferControllerOptions['selectNode'];
  eventBus: CanvasMediaTransferControllerOptions['eventBus'];
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
  const { spawnAsset, ...mediaTransfer } = useCanvasMediaTransferController({
    selectedUploadNodeId,
    getPreferredClientPosition,
    screenToFlowPosition,
    createNode,
    selectNode,
    eventBus,
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
