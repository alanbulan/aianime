// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasImageJobGateway } from './canvasImageJob';
import { regenerateExportImageNode } from './regenerateExportNode';

const submitImage = vi.fn();
const updateNodeData = vi.fn();
const aiGateway: CanvasImageJobGateway = {
  submitGenerateImageJob: (scope, payload) => submitImage(scope, payload),
};

const generateRedraw = vi.fn();
const generateGridAction = vi.fn();

async function regenerate(
  nodeData: Record<string, unknown>,
): Promise<void> {
  await regenerateExportImageNode(
    {
      nodeData,
      nodeId: 'export-node',
      projectId: 'proj',
      canvasId: 'canvas-a',
      runtimeSessionId: 'runtime-test',
      updateNodeData,
    },
    { aiGateway, generateRedraw, generateGridAction },
  );
}

describe('regenerateExportImageNode', () => {
  beforeEach(() => {
    updateNodeData.mockReset();
    submitImage.mockReset();
    generateRedraw.mockReset();
    generateGridAction.mockReset();
  });

  it('re-submits a stored image generation through the injected AI gateway', async () => {
    submitImage.mockResolvedValue({
      job_id: 'image-job',
      task_key: 'freezone_gen:image-job',
      task_type: 'freezone_gen',
    });

    await regenerate({
      generationRequestPayload: {
        aspectRatio: '16:9',
        model: 'openai/gpt-image-2',
        prompt: '重新生成',
        size: '2K',
      },
    });

    expect(submitImage).toHaveBeenCalledWith(
      { projectId: 'proj', canvasId: 'canvas-a' },
      expect.objectContaining({ nodeId: 'export-node', prompt: '重新生成' }),
    );
    expect(generateRedraw).not.toHaveBeenCalled();
    expect(generateGridAction).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'export-node',
      expect.objectContaining({
        generationClientSessionId: 'runtime-test',
        generationJobId: 'image-job',
        generationTaskJobId: 'image-job',
        generationTaskKey: 'freezone_gen:image-job',
        generationTaskType: 'freezone_gen',
      }),
    );
  });

  it('replays a stored redraw and writes its completed output URL', async () => {
    const task = {
      job_id: 'redraw-job',
      task_key: 'freezone_redraw:redraw-job',
      task_type: 'freezone_redraw',
    };
    generateRedraw.mockImplementation(async (_params, onTaskSubmitted) => {
      onTaskSubmitted(task);
      return { task, url: '/static/proj/redraw.png' };
    });

    await regenerate({
      freezoneRedrawRequest: {
        aspectRatio: 'original',
        imageSize: '2K',
        maskUrl: '/static/proj/mask.png',
        model: 'cloud-image-standard',
        sourceUrl: '/static/proj/source.png',
      },
    });

    expect(generateRedraw).toHaveBeenCalledWith(
      {
        projectId: 'proj',
        aspectRatio: 'original',
        imageSize: '2K',
        maskUrl: '/static/proj/mask.png',
        model: 'cloud-image-standard',
        sourceUrl: '/static/proj/source.png',
      },
      expect.any(Function),
    );
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'export-node',
      expect.objectContaining({
        generationTaskJobId: null,
        imageUrl: '/static/proj/redraw.png',
        isGenerating: false,
        previewImageUrl: '/static/proj/redraw.png',
      }),
    );
  });

  it('replays a stored grid action with its original prompt and selected model', async () => {
    const task = {
      job_id: 'grid-job',
      task_key: 'freezone_template_edit:grid-job',
      task_type: 'freezone_template_edit',
    };
    generateGridAction.mockImplementation(async (_params, onTaskSubmitted) => {
      onTaskSubmitted(task);
      return { task, url: '/static/proj/grid.png' };
    });

    await regenerate({
      gridActionRequest: {
        actionKey: 'multiCameraGrid',
        model: 'cloud-image-standard',
        modelSelector: 'edit-route',
        prompt: 'Create a coherent nine-camera grid.',
        sourceUrl: '/static/proj/source.png',
      },
    });

    expect(generateGridAction).toHaveBeenCalledWith(
      {
        projectId: 'proj',
        actionKey: 'multiCameraGrid',
        model: 'cloud-image-standard',
        modelSelector: 'edit-route',
        prompt: 'Create a coherent nine-camera grid.',
        sourceUrl: '/static/proj/source.png',
      },
      expect.any(Function),
    );
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'export-node',
      expect.objectContaining({
        generationTaskJobId: null,
        imageUrl: '/static/proj/grid.png',
        isGenerating: false,
        previewImageUrl: '/static/proj/grid.png',
      }),
    );
  });
});
