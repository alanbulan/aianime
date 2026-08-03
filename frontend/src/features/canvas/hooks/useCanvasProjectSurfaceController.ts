// Copyright (c) 2026 AI anime
import {
  useCanvasProjectContextController,
  type CanvasGenerationRecoveryControllerOptions,
  type CanvasProjectContextController,
  type CanvasProjectContextControllerOptions,
} from '@/modules/creative_canvas/public';
import { useCanvasGenerationRecoveryController } from '../composition';

export interface CanvasProjectSurfaceControllerOptions {
  projectId: CanvasProjectContextControllerOptions['projectId'];
  canvasId: CanvasProjectContextControllerOptions['canvasId'];
  nodes: CanvasProjectContextControllerOptions['nodes'];
  errorTitle: CanvasGenerationRecoveryControllerOptions['errorTitle'];
}

export type CanvasProjectSurfaceController = CanvasProjectContextController;

export function useCanvasProjectSurfaceController({
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

  useCanvasGenerationRecoveryController({
    projectId: projectContext.projectId,
    errorTitle,
  });

  return projectContext;
}
