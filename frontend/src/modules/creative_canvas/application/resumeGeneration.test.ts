// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resumeNodeGeneration,
  type CanvasGenerationRecoveryNode,
  type CanvasGenerationTaskGateway,
} from './resumeGeneration';

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
  type: string,
  data: Record<string, unknown> = {},
): CanvasGenerationRecoveryNode {
  return {
    data: {
      generationTaskJobId: 'job-1',
      generationTaskKey: 'task-1',
      generationTaskType: 'freezone_gen',
      isGenerating: true,
      ...data,
    },
    id: 'node-1',
    type,
  };
}

async function resume(node: CanvasGenerationRecoveryNode): Promise<void> {
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

    await resume(generationNode('imageGenNode'));

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

    await resume(generationNode('exportImageNode'));

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
      generationNode('scriptNode', {
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
      generationNode('textAnnotationNode', {
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

    await resume(generationNode('imageNode'));

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

  it('does not clear a task that the node has already cancelled', async () => {
    hasTask.mockResolvedValue(false);
    const node = generationNode('audioNode');

    await resumeNodeGeneration(
      {
        node,
        projectId: 'project-1',
        updateNodeData,
        getNodeData: () => ({
          ...(node.data as Record<string, unknown>),
          generationTaskKey: null,
          isGenerating: false,
        }),
      },
      gateway,
    );

    expect(updateNodeData).not.toHaveBeenCalled();
  });

  it('does not write a task result after the node has been deleted', async () => {
    hasTask.mockResolvedValue(false);
    const node = generationNode('audioNode');

    await resumeNodeGeneration(
      {
        node,
        projectId: 'project-1',
        updateNodeData,
        getNodeData: () => null,
      },
      gateway,
    );

    expect(updateNodeData).not.toHaveBeenCalled();
  });

  it('does not apply an old completion after the node starts a newer task', async () => {
    let currentTaskKey = 'task-1';
    awaitCompletion.mockResolvedValue({ result: {} });
    fetchResultUrl.mockImplementation(async () => {
      currentTaskKey = 'task-2';
      return '/static/project-1/stale.png';
    });
    const node = generationNode('imageGenNode');

    await resumeNodeGeneration(
      {
        node,
        projectId: 'project-1',
        updateNodeData,
        getNodeData: () => ({
          ...(node.data as Record<string, unknown>),
          generationTaskKey: currentTaskKey,
        }),
      },
      gateway,
    );

    expect(updateNodeData).not.toHaveBeenCalled();
  });
});
