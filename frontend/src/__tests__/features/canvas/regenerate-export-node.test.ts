// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { regenerateExportImageNode } from '@/features/canvas/application/regenerateExportNode';
import type {
  AiGateway,
  CanvasRedrawTaskGateway,
} from '@/features/canvas/application/ports';

const store = vi.hoisted(() => ({
  nodes: [] as Array<{ data: Record<string, unknown>; id: string }>,
  updateNodeData: vi.fn(),
}));

vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: {
    getState: () => store,
  },
}));

const submitImage = vi.fn();
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

describe('regenerateExportImageNode', () => {
  beforeEach(() => {
    store.nodes = [];
    store.updateNodeData.mockReset();
    submitImage.mockReset();
    submitRedraw.mockReset();
    awaitRedraw.mockReset();
    fetchRedrawResultUrl.mockReset();
    window.history.replaceState({}, '', '/projects/proj/freezone');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('re-submits a stored image generation through the injected AI gateway', async () => {
    store.nodes = [
      {
        id: 'export-node',
        data: {
          generationRequestPayload: {
            aspectRatio: '16:9',
            model: 'openai/gpt-image-2',
            prompt: '重新生成',
            size: '2K',
          },
        },
      },
    ];
    submitImage.mockResolvedValue('image-job');

    await regenerateExportImageNode(
      'export-node',
      aiGateway,
      redrawGateway,
    );

    expect(submitImage).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'export-node', prompt: '重新生成' }),
    );
    expect(submitRedraw).not.toHaveBeenCalled();
    expect(store.updateNodeData).toHaveBeenLastCalledWith('export-node', {
      generationClientSessionId: expect.any(String),
      generationJobId: 'image-job',
    });
  });

  it('replays a stored redraw and writes its completed output URL', async () => {
    store.nodes = [
      {
        id: 'export-node',
        data: {
          freezoneRedrawRequest: {
            aspectRatio: 'original',
            imageSize: '2K',
            maskUrl: '/static/proj/mask.png',
            sourceUrl: '/static/proj/source.png',
          },
        },
      },
    ];
    submitRedraw.mockResolvedValue({
      job_id: 'redraw-job',
      task_key: 'freezone_redraw:redraw-job',
      task_type: 'freezone_redraw',
    });
    awaitRedraw.mockResolvedValue({
      result: { output_url: '/static/proj/redraw.png' },
    });

    await regenerateExportImageNode(
      'export-node',
      aiGateway,
      redrawGateway,
    );

    expect(submitRedraw).toHaveBeenCalledWith('proj', {
      aspectRatio: 'original',
      imageSize: '2K',
      maskUrl: '/static/proj/mask.png',
      sourceUrl: '/static/proj/source.png',
    });
    expect(fetchRedrawResultUrl).not.toHaveBeenCalled();
    expect(store.updateNodeData).toHaveBeenLastCalledWith(
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
    store.nodes = [
      {
        id: 'export-node',
        data: {
          freezoneRedrawRequest: {
            aspectRatio: '16:9',
            imageSize: '2K',
            maskUrl: '/static/proj/mask.png',
            sourceUrl: '/static/proj/source.png',
          },
        },
      },
    ];
    submitRedraw.mockResolvedValue({
      job_id: 'redraw-job',
      task_key: 'freezone_redraw:redraw-job',
      task_type: 'freezone_redraw',
    });
    awaitRedraw.mockResolvedValue({ result: {} });
    fetchRedrawResultUrl.mockResolvedValue('/static/proj/fallback.png');

    await regenerateExportImageNode(
      'export-node',
      aiGateway,
      redrawGateway,
    );

    expect(fetchRedrawResultUrl).toHaveBeenCalledWith(
      'proj',
      'freezone_redraw',
      'redraw-job',
    );
    expect(store.updateNodeData).toHaveBeenLastCalledWith(
      'export-node',
      expect.objectContaining({ imageUrl: '/static/proj/fallback.png' }),
    );
  });
});
