// Copyright (c) 2026 AI anime
import type { CanvasAssetDragPayload } from '../domain/assetDrag';
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
  createUploadNode: (position: CanvasPosition) => string;
  selectNode: (nodeId: string) => void;
  eventPort: CanvasMediaPasteEventPort;
  hydrateAsset: (
    payload: CanvasAssetDragPayload,
  ) => Promise<CanvasAssetDragPayload>;
  spawnAsset: (
    payload: CanvasAssetDragPayload,
    position: CanvasPosition,
  ) => string;
  isImmersiveViewerActive: () => boolean;
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
  createUploadNode,
  selectNode,
  eventPort,
  hydrateAsset,
  spawnAsset,
  isImmersiveViewerActive,
}: CanvasMediaTransferControllerOptions): CanvasMediaTransferController {
  const { queueSnapshotPaste } = useCanvasMediaPaste({
    selectedUploadNodeId,
    getPreferredClientPosition,
    screenToCanvasPosition: screenToFlowPosition,
    createUploadNode,
    selectNode,
    eventPort,
    isImmersiveViewerActive,
  });
  const dropController = useCanvasMediaDropController({
    screenToFlowPosition,
    hydrateAsset,
    spawnAsset,
    createUploadNode,
    selectNode,
    attachExternalFile: eventPort.attachExternalFile,
  });

  return {
    queueSnapshotPaste,
    spawnAsset,
    ...dropController,
  };
}
