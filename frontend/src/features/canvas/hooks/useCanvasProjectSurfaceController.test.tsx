// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasGenerationRecoveryControllerOptions,
} from './useCanvasGenerationRecoveryController';
import type {
  CanvasProjectContextControllerOptions,
} from '@/modules/creative_canvas/public';
import {
  useCanvasProjectSurfaceController,
  type CanvasProjectSurfaceControllerOptions,
} from './useCanvasProjectSurfaceController';

const controllerMocks = vi.hoisted(() => {
  const projectContext = {
    projectId: 'project-1' as string | null,
    canvasId: 'canvas-1',
  };
  return {
    projectContext,
    useProjectContext: vi.fn(
      (_options: CanvasProjectContextControllerOptions) => projectContext,
    ),
    useGenerationRecovery: vi.fn(
      (_options: CanvasGenerationRecoveryControllerOptions) => undefined,
    ),
  };
});

vi.mock('@/modules/creative_canvas/public', () => ({
  useCanvasProjectContextController: controllerMocks.useProjectContext,
}));
vi.mock('./useCanvasGenerationRecoveryController', () => ({
  useCanvasGenerationRecoveryController: controllerMocks.useGenerationRecovery,
}));

function createOptions(): CanvasProjectSurfaceControllerOptions {
  return {
    projectId: 'project-1',
    canvasId: 'canvas-1',
    nodes: [],
    errorTitle: 'Generation failed',
  };
}

describe('useCanvasProjectSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controllerMocks.useProjectContext.mockReturnValue(
      controllerMocks.projectContext,
    );
  });

  it('starts generation recovery with the resolved project context', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasProjectSurfaceController(options),
    );

    expect(controllerMocks.useProjectContext).toHaveBeenCalledWith({
      projectId: options.projectId,
      canvasId: options.canvasId,
      nodes: options.nodes,
    });
    expect(controllerMocks.useGenerationRecovery).toHaveBeenCalledWith({
      projectId: controllerMocks.projectContext.projectId,
      errorTitle: options.errorTitle,
    });
    expect(result.current).toBe(controllerMocks.projectContext);
  });

  it('keeps null project context for export-only recovery', () => {
    const options = createOptions();
    const projectContext = { projectId: null, canvasId: 'canvas-1' };
    controllerMocks.useProjectContext.mockReturnValueOnce(projectContext);
    const { result } = renderHook(() =>
      useCanvasProjectSurfaceController(options),
    );

    expect(controllerMocks.useGenerationRecovery).toHaveBeenCalledWith({
      projectId: null,
      errorTitle: options.errorTitle,
    });
    expect(result.current).toBe(projectContext);
  });
});
