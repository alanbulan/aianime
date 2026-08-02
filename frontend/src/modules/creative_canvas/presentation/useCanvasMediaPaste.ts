// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef } from 'react';

import { isTypingTarget } from './canvasInteractionTargets';
import {
  collectDroppedMediaFiles,
  resolveClipboardImageFile,
} from './canvasMediaTransfer';

export interface CanvasMediaPasteEventPort {
  pasteImageIntoNode: (nodeId: string, file: File) => void;
  attachExternalFile: (nodeId: string, file: File) => void;
}

export interface CanvasMediaPasteOptions {
  selectedUploadNodeId: string | null;
  getPreferredClientPosition: () => { x: number; y: number } | null;
  screenToCanvasPosition: (position: { x: number; y: number }) => { x: number; y: number };
  createUploadNode: (position: { x: number; y: number }) => string;
  selectNode: (nodeId: string) => void;
  eventPort: CanvasMediaPasteEventPort;
  isImmersiveViewerActive: () => boolean;
}

export interface CanvasMediaPasteController {
  queueSnapshotPaste: (pasteSnapshot: () => void) => void;
}

export function useCanvasMediaPaste({
  selectedUploadNodeId,
  getPreferredClientPosition,
  screenToCanvasPosition,
  createUploadNode,
  selectNode,
  eventPort,
  isImmersiveViewerActive,
}: CanvasMediaPasteOptions): CanvasMediaPasteController {
  const mediaPasteHandledRef = useRef(false);

  const queueSnapshotPaste = useCallback((pasteSnapshot: () => void) => {
    mediaPasteHandledRef.current = false;
    window.setTimeout(() => {
      if (mediaPasteHandledRef.current) {
        mediaPasteHandledRef.current = false;
        return;
      }
      pasteSnapshot();
    }, 0);
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      mediaPasteHandledRef.current = false;
      if (isTypingTarget(event.target) || isImmersiveViewerActive()) {
        return;
      }

      if (selectedUploadNodeId) {
        const imageFile = resolveClipboardImageFile(event);
        if (imageFile) {
          event.preventDefault();
          mediaPasteHandledRef.current = true;
          eventPort.pasteImageIntoNode(selectedUploadNodeId, imageFile);
          return;
        }
      }

      const mediaFiles = event.clipboardData
        ? collectDroppedMediaFiles(event.clipboardData)
        : [];
      if (mediaFiles.length === 0) {
        return;
      }

      event.preventDefault();
      mediaPasteHandledRef.current = true;
      const clientPosition = getPreferredClientPosition();
      if (!clientPosition) {
        return;
      }
      const basePosition = screenToCanvasPosition(clientPosition);

      let lastNodeId: string | null = null;
      mediaFiles.forEach((file, index) => {
        const nodeId = createUploadNode({
          x: basePosition.x + index * 36,
          y: basePosition.y + index * 36,
        });
        lastNodeId = nodeId;
        requestAnimationFrame(() => eventPort.attachExternalFile(nodeId, file));
      });
      if (lastNodeId) {
        selectNode(lastNodeId);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [
    createUploadNode,
    eventPort,
    getPreferredClientPosition,
    screenToCanvasPosition,
    selectNode,
    selectedUploadNodeId,
  ]);

  return { queueSnapshotPaste };
}
