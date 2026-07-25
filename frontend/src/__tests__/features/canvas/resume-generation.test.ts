// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasGenerationTaskGateway } from '@/features/canvas/application/ports';
import { resumeNodeGeneration } from '@/features/canvas/application/resumeGeneration';
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from '@/features/canvas/domain/canvasNodes';

const hasTask = vi.fn();
const awaitCompletion = vi.fn();
const fetchResultUrl = vi.fn();
const fetchReversePrompt = vi.fn();
const fetchStoryScriptResult = vi.fn();
const updateNodeData = vi.fn();

const gateway: CanvasGenerationTaskGateway = {
  awaitCompletion: (taskKey, projectId) =>
    awaitCompletion(taskKey, projectId),
  fetchResultUrl: (projectId, taskType, jobId) =>
    fetchResultUrl(projectId, taskType, jobId),
  fetchReversePrompt: (projectId, jobId) =>
    fetchReversePrompt(projectId, jobId),
  fetchStoryScriptResult: (projectId, jobId) =>
    fetchStoryScriptResult(projectId, jobId),
  hasTask: (projectId, taskKey) => hasTask(projectId, taskKey),
};

function generationNode(
  type: CanvasNodeType,
  data: Record<string, unknown> = {},
): CanvasNode {
  return {
    data: {
      generationTaskJobId: 'job-1',
      generationTaskKey: 'task-1',
      generationTaskType: 'freezone_gen',
      isGenerating: true,
      ...data,
    },
    id: 'node-1',
    position: { x: 0, y: 0 },
    type,
  } as CanvasNode;
}

async function resume(node: CanvasNode): Promise<void> {
  await resumeNodeGeneration(
    {
      node,
      projectId: 'project-1',
      updateNodeData,
    },
    gateway,
  );
}

describe('resumeNodeGeneration', () => {
  beforeEach(() => {
    hasTask.mockReset().mockResolvedValue(true);
    awaitCompletion.mockReset();
    fetchResultUrl.mockReset();
    fetchReversePrompt.mockReset();
    fetchStoryScriptResult.mockReset();
    updateNodeData.mockReset();
  });

  it('writes an image URL returned by the completed task', async () => {
    awaitCompletion.mockResolvedValue({
      result: { output_url: '/static/project-1/image.png' },
    });

    await resume(generationNode(CANVAS_NODE_TYPES.imageGen));

    expect(hasTask).toHaveBeenCalledWith('project-1', 'task-1');
    expect(awaitCompletion).toHaveBeenCalledWith('task-1', 'project-1');
    expect(fetchResultUrl).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        generationTaskJobId: null,
        generationTaskKey: null,
        generationTaskType: null,
        imageUrl: '/static/project-1/image.png',
        isGenerating: false,
        previewImageUrl: '/static/project-1/image.png',
      }),
    );
  });

  it('uses the result endpoint when an image task has no direct URL', async () => {
    awaitCompletion.mockResolvedValue({ result: {} });
    fetchResultUrl.mockResolvedValue('/static/project-1/fallback.png');

    await resume(generationNode(CANVAS_NODE_TYPES.exportImage));

    expect(fetchResultUrl).toHaveBeenCalledWith(
      'project-1',
      'freezone_gen',
      'job-1',
    );
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        imageUrl: '/static/project-1/fallback.png',
      }),
    );
  });

  it('loads script results through the injected gateway', async () => {
    const scriptResult = {
      rows: [{ dialogue: '测试台词' }],
      title: '测试剧本',
    };
    awaitCompletion.mockResolvedValue({ result: {} });
    fetchStoryScriptResult.mockResolvedValue(scriptResult);

    await resume(
      generationNode(CANVAS_NODE_TYPES.script, {
        generationTaskType: 'freezone_story_script',
      }),
    );

    expect(fetchStoryScriptResult).toHaveBeenCalledWith(
      'project-1',
      'job-1',
    );
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        scriptResult,
        scriptTitle: '测试剧本',
      }),
    );
  });

  it('loads reverse prompts through the injected gateway', async () => {
    awaitCompletion.mockResolvedValue({ result: {} });
    fetchReversePrompt.mockResolvedValue('逆向提示词');

    await resume(
      generationNode(CANVAS_NODE_TYPES.textAnnotation, {
        generationTaskType: 'freezone_image_reverse_prompt',
      }),
    );

    expect(fetchReversePrompt).toHaveBeenCalledWith('project-1', 'job-1');
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({ content: '逆向提示词' }),
    );
  });

  it('clears a generation whose persisted task no longer exists', async () => {
    hasTask.mockResolvedValue(false);

    await resume(generationNode(CANVAS_NODE_TYPES.imageEdit));

    expect(awaitCompletion).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        generationError: '生成任务已结束或不存在',
        generationTaskKey: null,
        isGenerating: false,
      }),
    );
  });
});
