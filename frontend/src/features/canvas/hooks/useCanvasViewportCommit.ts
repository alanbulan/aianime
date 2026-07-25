// Copyright (c) 2026 AI anime
import { useCallback, useRef } from 'react';

const VIEWPORT_COMMIT_INTERVAL_MS = 120;

export interface CanvasViewportSnapshot {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasViewportCommitController {
  handleMove: (_event: unknown, viewport: CanvasViewportSnapshot) => void;
  handleMoveEnd: (_event: unknown, viewport: CanvasViewportSnapshot) => void;
}

export function useCanvasViewportCommit(
  commitViewport: (viewport: CanvasViewportSnapshot) => void,
): CanvasViewportCommitController {
  // React Flow emits every frame; limit subscriber churn and always flush on move end.
  const lastCommitAtRef = useRef(0);

  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: CanvasViewportSnapshot) => {
      lastCommitAtRef.current = Date.now();
      commitViewport(viewport);
    },
    [commitViewport],
  );

  const handleMove = useCallback(
    (_event: unknown, viewport: CanvasViewportSnapshot) => {
      const now = Date.now();
      if (now - lastCommitAtRef.current < VIEWPORT_COMMIT_INTERVAL_MS) {
        return;
      }
      lastCommitAtRef.current = now;
      commitViewport(viewport);
    },
    [commitViewport],
  );

  return {
    handleMove,
    handleMoveEnd,
  };
}
