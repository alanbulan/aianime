// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import {
  createCanvasHistoryAssetPayload,
  resolveCanvasHistoryAssetPosition,
  type CanvasHistoryAssetPlacement,
} from '../application/canvasHistoryAssetSpawn';
import type { CanvasAsset } from '../domain/canvasAsset';
import type { CanvasAssetDragPayload } from '../domain/assetDrag';

export interface CanvasHistoryAssetControllerOptions {
  getViewportCenter: () => { x: number; y: number };
  spawnAsset: (
    payload: CanvasAssetDragPayload,
    position: { x: number; y: number },
  ) => string;
  selectNode: (nodeId: string) => void;
  deleteNode: (nodeId: string) => void;
}

export interface CanvasHistoryAssetController {
  useHistoryAsset: (
    asset: CanvasAsset,
    placement?: CanvasHistoryAssetPlacement,
  ) => void;
  deleteHistoryNode: (nodeId: string) => void;
}

export function useCanvasHistoryAssetController({
  getViewportCenter,
  spawnAsset,
  selectNode,
  deleteNode,
}: CanvasHistoryAssetControllerOptions): CanvasHistoryAssetController {
  const useHistoryAsset = useCallback(
    (asset: CanvasAsset, placement?: CanvasHistoryAssetPlacement) => {
      const nodeId = spawnAsset(
        createCanvasHistoryAssetPayload(asset),
        resolveCanvasHistoryAssetPosition(getViewportCenter(), placement),
      );
      selectNode(nodeId);
    },
    [getViewportCenter, selectNode, spawnAsset],
  );

  const deleteHistoryNode = useCallback(
    (nodeId: string) => deleteNode(nodeId),
    [deleteNode],
  );

  return {
    useHistoryAsset,
    deleteHistoryNode,
  };
}
