// Copyright (c) 2026 AI anime
import {
  useCanvasGenerationRecoveryController,
  type CanvasGenerationRecoveryControllerOptions,
} from './useCanvasGenerationRecoveryController';
import {
  useCanvasProjectContextController,
  type CanvasProjectContextController,
  type CanvasProjectContextControllerOptions,
} from './useCanvasProjectContextController';

export interface CanvasProjectSurfaceControllerOptions {
  nodes: CanvasProjectContextControllerOptions['nodes'];
  errorTitle: CanvasGenerationRecoveryControllerOptions['errorTitle'];
}

export type CanvasProjectSurfaceController = CanvasProjectContextController;

export function useCanvasProjectSurfaceController({
  nodes,
  errorTitle,
}: CanvasProjectSurfaceControllerOptions): CanvasProjectSurfaceController {
  const projectContext = useCanvasProjectContextController({ nodes });

  useCanvasGenerationRecoveryController({
    projectId: projectContext.projectId,
    errorTitle,
  });

  return projectContext;
}
