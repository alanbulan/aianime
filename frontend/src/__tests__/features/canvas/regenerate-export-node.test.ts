// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { regenerateExportImageNode } from '@/features/canvas/application/regenerateExportNode';
import type {
  AiGateway,
  CanvasRedrawTaskGateway,
} from '@/features/canvas/application/ports';

const submitImage = vi.fn();
const updateNodeData = vi.fn();
const aiGateway: AiGateway = {
  generateImage: vi.fn(),
  getGenerateImageJob: vi.fn(),
  setApiKey: vi.fn(),
  submitGenerateImageJob: (payload) => submitImage(payload),
};

const submitRedraw = vi.fn();
const awaitRedraw = vi.fn();
const fetchRedrawResultUrl = vi.fn();
const redrawGateway: CanvasRedrawTaskGateway = {
  awaitCompletion: (taskKey, projectId) =>
    awaitRedraw(taskKey, projectId),
  fetchResultUrl: (projectId, taskType, jobId) =>
    fetchRedrawResultUrl(projectId, taskType, jobId),
  submit: (projectId, command) => submitRedraw(projectId, command),
};

async function regenerate(
  nodeData: Record<string, unknown>,
  projectId: string | null = 'proj',
): Promise<void> {
  await regenerateExportImageNode(
    {
      nodeData,
      nodeId: 'export-node',
      projectId,
      updateNodeData,
    },
    aiGateway,
    redrawGateway,
  );
}

describe('regenerateExportImageNode', () => {
  beforeEach(() => {
    updateNodeData.mockReset();
    submitImage.mockReset();
    submitRedraw.mockReset();
    awaitRedraw.mockReset();
    fetchRedrawResultUrl.mockReset();
  });

  it('re-submits a stored image generation through the injected AI gateway', async () => {
    submitImage.mockResolvedValue('image-job');

    await regenerate({
      generationRequestPayload: {
        aspectRatio: '16:9',
        model: 'openai/gpt-image-2',
        prompt: '重新生成',
        size: '2K',
      },
    });

    expect(submitImage).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'export-node', prompt: '重新生成' }),
    );
    expect(submitRedraw).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenLastCalledWith('export-node', {
      generationClientSessionId: expect.any(String),
      generationJobId: 'image-job',
    });
  });

  it('replays a stored redraw and writes its completed output URL', async () => {
    submitRedraw.mockResolvedValue({
      job_id: 'redraw-job',
      task_key: 'freezone_redraw:redraw-job',
      task_type: 'freezone_redraw',
    });
    awaitRedraw.mockResolvedValue({
      result: { output_url: '/static/proj/redraw.png' },
    });

    await regenerate({
      freezoneRedrawRequest: {
        aspectRatio: 'original',
        imageSize: '2K',
        maskUrl: '/static/proj/mask.png',
        sourceUrl: '/static/proj/source.png',
      },
    });

    expect(submitRedraw).toHaveBeenCalledWith('proj', {
      aspectRatio: 'original',
      imageSize: '2K',
      maskUrl: '/static/proj/mask.png',
      sourceUrl: '/static/proj/source.png',
    });
    expect(fetchRedrawResultUrl).not.toHaveBeenCalled();
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

  it('falls back to the redraw result endpoint when completion has no URL', async () => {
    submitRedraw.mockResolvedValue({
      job_id: 'redraw-job',
      task_key: 'freezone_redraw:redraw-job',
      task_type: 'freezone_redraw',
    });
    awaitRedraw.mockResolvedValue({ result: {} });
    fetchRedrawResultUrl.mockResolvedValue('/static/proj/fallback.png');

    await regenerate({
      freezoneRedrawRequest: {
        aspectRatio: '16:9',
        imageSize: '2K',
        maskUrl: '/static/proj/mask.png',
        sourceUrl: '/static/proj/source.png',
      },
    });

    expect(fetchRedrawResultUrl).toHaveBeenCalledWith(
      'proj',
      'freezone_redraw',
      'redraw-job',
    );
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'export-node',
      expect.objectContaining({ imageUrl: '/static/proj/fallback.png' }),
    );
  });

  it('reports a missing project without submitting a redraw task', async () => {
    await regenerate(
      {
        freezoneRedrawRequest: {
          maskUrl: '/static/proj/mask.png',
          sourceUrl: '/static/proj/source.png',
        },
      },
      null,
    );

    expect(submitRedraw).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenCalledWith('export-node', {
      generationError: '当前 URL 没有 project，无法重试',
    });
  });
});
