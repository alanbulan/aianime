// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';

import { CANVAS_ASSET_DRAG_MIME } from '../domain/assetDrag';

const FILES_DATA_TRANSFER_TYPE = 'Files';

export interface CanvasDropIndicatorController {
  isCanvasDropActive: boolean;
  acceptsCanvasDrop: (event: ReactDragEvent<HTMLDivElement>) => boolean;
  handleCanvasDragEnter: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleCanvasDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleCanvasDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  resetCanvasDropIndicator: () => void;
}

export function useCanvasDropIndicator(): CanvasDropIndicatorController {
  const dragDepthRef = useRef(0);
  const [isCanvasDropActive, setIsCanvasDropActive] = useState(false);

  const acceptsCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const types = Array.from(event.dataTransfer.types ?? []);
      return types.includes(FILES_DATA_TRANSFER_TYPE)
        || types.includes(CANVAS_ASSET_DRAG_MIME);
    },
    [],
  );

  const resetCanvasDropIndicator = useCallback(() => {
    dragDepthRef.current = 0;
    setIsCanvasDropActive(false);
  }, []);

  const handleCanvasDragEnter = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!acceptsCanvasDrop(event)) {
        return;
      }
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsCanvasDropActive(true);
    },
    [acceptsCanvasDrop],
  );

  const handleCanvasDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!acceptsCanvasDrop(event)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [acceptsCanvasDrop],
  );

  const handleCanvasDragLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!acceptsCanvasDrop(event)) {
        return;
      }
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsCanvasDropActive(false);
      }
    },
    [acceptsCanvasDrop],
  );

  useEffect(() => {
    // Capture resets the overlay even when a node drop handler stops bubbling.
    window.addEventListener('drop', resetCanvasDropIndicator, true);
    window.addEventListener('dragend', resetCanvasDropIndicator, true);
    return () => {
      window.removeEventListener('drop', resetCanvasDropIndicator, true);
      window.removeEventListener('dragend', resetCanvasDropIndicator, true);
    };
  }, [resetCanvasDropIndicator]);

  return {
    isCanvasDropActive,
    acceptsCanvasDrop,
    handleCanvasDragEnter,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    resetCanvasDropIndicator,
  };
}
