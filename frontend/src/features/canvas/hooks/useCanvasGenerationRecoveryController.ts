// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  pollExportImageGeneration,
  resumeNodeGeneration,
} from '@/features/canvas/composition';
import { nodeNeedsGenerationResume } from '@/features/canvas/application/resumeGeneration';
import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';

import { useCanvasAsyncNodeTasks } from './useCanvasAsyncNodeTasks';

type CanvasStoreState = ReturnType<typeof useCanvasStore.getState>;

export interface CanvasGenerationRecoveryControllerOptions {
  projectId: string | null;
  errorTitle: string;
}

function selectPendingExportImageNodeIds(state: CanvasStoreState): string[] {
  return state.nodes
    .filter((node) => {
      if (node.type !== CANVAS_NODE_TYPES.exportImage) return false;
      const data = node.data as Record<string, unknown>;
      return (
        data.isGenerating === true &&
        typeof data.generationJobId === 'string' &&
        data.generationJobId.length > 0
      );
    })
    .map((node) => node.id);
}

function selectPendingGenerationResumeNodeIds(state: CanvasStoreState): string[] {
  return state.nodes.filter(nodeNeedsGenerationResume).map((node) => node.id);
}

function readCanvasNodeData(nodeId: string): Record<string, unknown> | null {
  return (useCanvasStore
    .getState()
    .nodes
    .find((node) => node.id === nodeId)?.data ?? null) as Record<string, unknown> | null;
}

export function useCanvasGenerationRecoveryController({
  projectId,
  errorTitle,
}: CanvasGenerationRecoveryControllerOptions): void {
  // Comparing only the pending IDs keeps drag-frame node updates from restarting settled tasks.
  const pendingExportImageNodeIds = useCanvasStore(
    useShallow(selectPendingExportImageNodeIds),
  );
  const pendingGenerationResumeNodeIds = useCanvasStore(
    useShallow(selectPendingGenerationResumeNodeIds),
  );
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);

  const pollExportImageNode = useCallback(
    (nodeId: string): Promise<void> => {
      if (!projectId) {
        return Promise.resolve();
      }
      return pollExportImageGeneration(projectId, {
        nodeId,
        errorTitle,
        getNodeData: readCanvasNodeData,
        updateNodeData,
      });
    },
    [errorTitle, projectId, updateNodeData],
  );
  const resumePendingGenerationNode = useCallback(
    (nodeId: string): Promise<void> => {
      if (!projectId) {
        return Promise.resolve();
      }
      const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
      if (!node || !nodeNeedsGenerationResume(node)) {
        return Promise.resolve();
      }
      return resumeNodeGeneration({
        node,
        projectId,
        updateNodeData,
        getNodeData: readCanvasNodeData,
      });
    },
    [projectId, updateNodeData],
  );

  useCanvasAsyncNodeTasks({
    enabled: Boolean(projectId),
    pendingNodeIds: pendingGenerationResumeNodeIds,
    runNode: resumePendingGenerationNode,
  });
  useCanvasAsyncNodeTasks({
    enabled: Boolean(projectId),
    pendingNodeIds: pendingExportImageNodeIds,
    runNode: pollExportImageNode,
  });
}
