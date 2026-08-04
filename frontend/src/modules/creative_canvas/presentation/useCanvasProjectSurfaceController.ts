// Copyright (c) 2026 AI anime
import type {
  CanvasGenerationRecoveryControllerOptions,
} from './useCanvasGenerationRecoveryController';
import {
  useCanvasProjectContextController,
  type CanvasProjectContextController,
  type CanvasProjectContextControllerOptions,
} from './useCanvasProjectContextController';

export interface CanvasProjectSurfaceControllerDependencies {
  useGenerationRecovery(
    options: CanvasGenerationRecoveryControllerOptions,
  ): void;
}

export interface CanvasProjectSurfaceControllerOptions {
  projectId: CanvasProjectContextControllerOptions['projectId'];
  canvasId: CanvasProjectContextControllerOptions['canvasId'];
  nodes: CanvasProjectContextControllerOptions['nodes'];
  errorTitle: CanvasGenerationRecoveryControllerOptions['errorTitle'];
}

export type CanvasProjectSurfaceController = CanvasProjectContextController;

export function createUseCanvasProjectSurfaceController({
  useGenerationRecovery,
}: CanvasProjectSurfaceControllerDependencies) {
  return function useCanvasProjectSurfaceController({
    projectId,
    canvasId,
    nodes,
    errorTitle,
  }: CanvasProjectSurfaceControllerOptions): CanvasProjectSurfaceController {
    const projectContext = useCanvasProjectContextController({
      projectId,
      canvasId,
      nodes,
    });

    useGenerationRecovery({
      projectId: projectContext.projectId,
      errorTitle,
    });

    return projectContext;
  };
}
