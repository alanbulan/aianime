// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef } from 'react';

const NODE_HOVER_CLEAR_DELAY_MS = 400;

interface HoveredCanvasNode {
  id: string;
}

export interface CanvasNodeHoverController {
  clearHoveredNodeTimer: () => void;
  scheduleHoveredNodeClear: () => void;
  handleNodeMouseEnter: (_event: unknown, node: HoveredCanvasNode) => void;
  handleNodeMouseLeave: () => void;
}

export function useCanvasNodeHover(
  setHoveredNodeId: (nodeId: string | null) => void,
): CanvasNodeHoverController {
  const clearTimerRef = useRef<number | null>(null);

  const clearHoveredNodeTimer = useCallback(() => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const scheduleHoveredNodeClear = useCallback(() => {
    clearHoveredNodeTimer();
    clearTimerRef.current = window.setTimeout(() => {
      setHoveredNodeId(null);
      clearTimerRef.current = null;
    }, NODE_HOVER_CLEAR_DELAY_MS);
  }, [clearHoveredNodeTimer, setHoveredNodeId]);

  const handleNodeMouseEnter = useCallback(
    (_event: unknown, node: HoveredCanvasNode) => {
      clearHoveredNodeTimer();
      setHoveredNodeId(node.id);
    },
    [clearHoveredNodeTimer, setHoveredNodeId],
  );

  useEffect(() => clearHoveredNodeTimer, [clearHoveredNodeTimer]);

  return {
    clearHoveredNodeTimer,
    scheduleHoveredNodeClear,
    handleNodeMouseEnter,
    handleNodeMouseLeave: scheduleHoveredNodeClear,
  };
}
