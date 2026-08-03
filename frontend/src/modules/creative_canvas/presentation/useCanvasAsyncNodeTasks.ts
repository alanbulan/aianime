// Copyright (c) 2026 AI anime
import { useEffect, useRef } from "react";

export interface CanvasAsyncNodeTasksOptions {
  enabled?: boolean;
  pendingNodeIds: readonly string[];
  runNode: (nodeId: string) => Promise<void>;
}

export function useCanvasAsyncNodeTasks({
  enabled = true,
  pendingNodeIds,
  runNode,
}: CanvasAsyncNodeTasksOptions): void {
  const activeNodeIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    for (const nodeId of pendingNodeIds) {
      if (activeNodeIdsRef.current.has(nodeId)) {
        continue;
      }
      activeNodeIdsRef.current.add(nodeId);
      void runNode(nodeId).finally(() => {
        activeNodeIdsRef.current.delete(nodeId);
      });
    }
  }, [enabled, pendingNodeIds, runNode]);
}
