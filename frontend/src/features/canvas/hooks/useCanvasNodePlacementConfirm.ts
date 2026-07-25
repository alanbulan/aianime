// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from 'react';

const NODE_PLACEMENT_CONFIRM_DURATION_MS = 900;

export interface CanvasNodePlacementConfirmController {
  placementConfirmNodeId: string | null;
  triggerPlacementConfirm: (nodeId: string) => void;
}

export function useCanvasNodePlacementConfirm(): CanvasNodePlacementConfirmController {
  const [placementConfirmNodeId, setPlacementConfirmNodeId] =
    useState<string | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  const clearPlacementConfirmTimer = useCallback(() => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  }, []);

  const triggerPlacementConfirm = useCallback((nodeId: string) => {
    clearPlacementConfirmTimer();
    setPlacementConfirmNodeId(nodeId);
    clearTimerRef.current = window.setTimeout(() => {
      setPlacementConfirmNodeId(null);
      clearTimerRef.current = null;
    }, NODE_PLACEMENT_CONFIRM_DURATION_MS);
  }, [clearPlacementConfirmTimer]);

  useEffect(() => clearPlacementConfirmTimer, [clearPlacementConfirmTimer]);

  return {
    placementConfirmNodeId,
    triggerPlacementConfirm,
  };
}
