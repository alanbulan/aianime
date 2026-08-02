// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from 'react';

import { hydrateAssetDragPayload } from '@/features/canvas/composition';
import type { CanvasEventBus } from '@/features/canvas/application/ports';

import {
  spawnCanvasAssetNode,
  type CanvasAssetDragPayload,
  type CanvasAssetNodeSpawnPort,
} from '@/modules/creative_canvas/public';
import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';
import {
  useCanvasMediaDropController,
  type CanvasMediaDropController,
} from './useCanvasMediaDropController';
import {
  useCanvasMediaPaste,
  type CanvasMediaPasteController,
  type CanvasMediaPasteEventPort,
} from './useCanvasMediaPaste';

interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasMediaTransferControllerOptions {
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
}

export interface CanvasMediaTransferController
  extends CanvasMediaPasteController,
    CanvasMediaDropController {
  spawnAsset: (
    payload: CanvasAssetDragPayload,
    position: CanvasPosition,
  ) => string;
}

export function useCanvasMediaTransferController({
  selectedUploadNodeId,
  getPreferredClientPosition,
  screenToFlowPosition,
  createNode,
  selectNode,
  eventBus,
}: CanvasMediaTransferControllerOptions): CanvasMediaTransferController {
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
  const createTransferredUploadNode = useCallback(
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
  const spawnAsset = useCallback(
    (payload: CanvasAssetDragPayload, position: CanvasPosition) =>
      spawnCanvasAssetNode(assetNodeSpawnPort, payload, position),
    [assetNodeSpawnPort],
  );
  const { queueSnapshotPaste } = useCanvasMediaPaste({
    selectedUploadNodeId,
    getPreferredClientPosition,
    screenToCanvasPosition: screenToFlowPosition,
    createUploadNode: createTransferredUploadNode,
    selectNode,
    eventPort: mediaTransferEventPort,
  });
  const dropController = useCanvasMediaDropController({
    screenToFlowPosition,
    hydrateAsset,
    spawnAsset,
    createUploadNode: createTransferredUploadNode,
    selectNode,
    attachExternalFile: mediaTransferEventPort.attachExternalFile,
  });

  return {
    queueSnapshotPaste,
    spawnAsset,
    ...dropController,
  };
}
