// Copyright (c) 2026 AI anime
import { useEffect, useRef } from 'react';

export interface CanvasGenerationResumeOptions {
  projectId: string | null;
  pendingNodeIds: readonly string[];
  resumeNode: (nodeId: string, projectId: string) => Promise<void>;
}

export function useCanvasGenerationResume({
  projectId,
  pendingNodeIds,
  resumeNode,
}: CanvasGenerationResumeOptions): void {
  const activeNodeIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!projectId) {
      return;
    }

    for (const nodeId of pendingNodeIds) {
      if (activeNodeIdsRef.current.has(nodeId)) {
        continue;
      }
      activeNodeIdsRef.current.add(nodeId);
      void resumeNode(nodeId, projectId).finally(() => {
        activeNodeIdsRef.current.delete(nodeId);
      });
    }
  }, [pendingNodeIds, projectId, resumeNode]);
}
