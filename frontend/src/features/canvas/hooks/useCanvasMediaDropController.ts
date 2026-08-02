// Copyright (c) 2026 AI anime
import { useCallback, type DragEvent as ReactDragEvent } from 'react';

import {
  readCanvasAssetDragPayload,
  type CanvasAssetDragPayload,
} from '@/modules/creative_canvas/public';
import { collectDroppedMediaFiles } from '../ui/canvasMediaTransfer';
import { useCanvasDropIndicator } from './useCanvasDropIndicator';

const DROPPED_FILE_OFFSET = 36;

function reportAssetHydrationFailure(error: unknown): void {
  console.warn('[canvas] scene director world manifest unavailable during import', error);
}

function scheduleAfterNodeMount(callback: () => void): void {
  window.requestAnimationFrame(callback);
}

export interface CanvasMediaDropControllerOptions {
  screenToFlowPosition: (
    clientPosition: { x: number; y: number },
  ) => { x: number; y: number };
  hydrateAsset: (
    payload: CanvasAssetDragPayload,
  ) => Promise<CanvasAssetDragPayload>;
  spawnAsset: (
    payload: CanvasAssetDragPayload,
    position: { x: number; y: number },
  ) => string;
  createUploadNode: (position: { x: number; y: number }) => string;
  selectNode: (nodeId: string) => void;
  attachExternalFile: (nodeId: string, file: File) => void;
  reportHydrationFailure?: (error: unknown) => void;
  scheduleAfterMount?: (callback: () => void) => void;
}

export interface CanvasMediaDropController {
  isCanvasDropActive: boolean;
  handleCanvasDragEnter: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleCanvasDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleCanvasDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleCanvasDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
}

export function useCanvasMediaDropController({
  screenToFlowPosition,
  hydrateAsset,
  spawnAsset,
  createUploadNode,
  selectNode,
  attachExternalFile,
  reportHydrationFailure = reportAssetHydrationFailure,
  scheduleAfterMount = scheduleAfterNodeMount,
}: CanvasMediaDropControllerOptions): CanvasMediaDropController {
  const {
    isCanvasDropActive,
    acceptsCanvasDrop,
    handleCanvasDragEnter,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    resetCanvasDropIndicator,
  } = useCanvasDropIndicator();

  const handleCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!acceptsCanvasDrop(event)) {
        return;
      }
      event.preventDefault();
      resetCanvasDropIndicator();

      const basePosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const assetPayload = readCanvasAssetDragPayload(event.dataTransfer);
      if (assetPayload) {
        void (async () => {
          let hydratedPayload = assetPayload;
          try {
            hydratedPayload = await hydrateAsset(assetPayload);
          } catch (error) {
            reportHydrationFailure(error);
          }
          selectNode(spawnAsset(hydratedPayload, basePosition));
        })();
        return;
      }

      const mediaFiles = collectDroppedMediaFiles(event.dataTransfer);
      let lastNodeId: string | null = null;
      mediaFiles.forEach((file, index) => {
        const nodeId = createUploadNode({
          x: basePosition.x + index * DROPPED_FILE_OFFSET,
          y: basePosition.y + index * DROPPED_FILE_OFFSET,
        });
        lastNodeId = nodeId;
        scheduleAfterMount(() => attachExternalFile(nodeId, file));
      });
      if (lastNodeId) {
        selectNode(lastNodeId);
      }
    },
    [
      acceptsCanvasDrop,
      attachExternalFile,
      createUploadNode,
      hydrateAsset,
      reportHydrationFailure,
      resetCanvasDropIndicator,
      scheduleAfterMount,
      screenToFlowPosition,
      selectNode,
      spawnAsset,
    ],
  );

  return {
    isCanvasDropActive,
    handleCanvasDragEnter,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    handleCanvasDrop,
  };
}
