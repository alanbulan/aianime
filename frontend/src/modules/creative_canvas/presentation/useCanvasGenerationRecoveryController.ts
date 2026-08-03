// Copyright (c) 2026 AI anime
import { useCallback } from "react";

import { useCanvasAsyncNodeTasks } from "./useCanvasAsyncNodeTasks";

export interface CanvasGenerationRecoveryControllerOptions {
  projectId: string | null;
  errorTitle: string;
}

export interface CanvasGenerationRecoveryControllerDependencies {
  usePendingExportImageNodeIds(): readonly string[];
  usePendingGenerationResumeNodeIds(): readonly string[];
  pollExportImageNode(command: {
    projectId: string;
    nodeId: string;
    errorTitle: string;
  }): Promise<void>;
  resumePendingGenerationNode(command: {
    projectId: string;
    nodeId: string;
  }): Promise<void>;
}

export function createUseCanvasGenerationRecoveryController({
  usePendingExportImageNodeIds,
  usePendingGenerationResumeNodeIds,
  pollExportImageNode,
  resumePendingGenerationNode,
}: CanvasGenerationRecoveryControllerDependencies) {
  return function useCanvasGenerationRecoveryController({
    projectId,
    errorTitle,
  }: CanvasGenerationRecoveryControllerOptions): void {
    const pendingExportImageNodeIds = usePendingExportImageNodeIds();
    const pendingGenerationResumeNodeIds =
      usePendingGenerationResumeNodeIds();
    const pollNode = useCallback(
      (nodeId: string): Promise<void> => {
        if (!projectId) {
          return Promise.resolve();
        }
        return pollExportImageNode({ projectId, nodeId, errorTitle });
      },
      [errorTitle, projectId],
    );
    const resumeNode = useCallback(
      (nodeId: string): Promise<void> => {
        if (!projectId) {
          return Promise.resolve();
        }
        return resumePendingGenerationNode({ projectId, nodeId });
      },
      [projectId],
    );

    useCanvasAsyncNodeTasks({
      enabled: Boolean(projectId),
      pendingNodeIds: pendingGenerationResumeNodeIds,
      runNode: resumeNode,
    });
    useCanvasAsyncNodeTasks({
      enabled: Boolean(projectId),
      pendingNodeIds: pendingExportImageNodeIds,
      runNode: pollNode,
    });
  };
}
