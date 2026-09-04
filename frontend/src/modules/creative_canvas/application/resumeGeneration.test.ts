// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearGenerationTaskDescriptor,
  generationTaskBatchDescriptor,
  generationTaskDescriptor,
  nodeNeedsGenerationResume,
  resumeNodeGeneration,
  type CanvasGenerationRecoveryNode,
  type CanvasGenerationTaskGateway,
} from './resumeGeneration';

const hasTask = vi.fn();
const awaitCompletion = vi.fn();
const fetchResult = vi.fn();
const fetchResultUrl = vi.fn();
const fetchReversePrompt = vi.fn();
const fetchStoryScriptResult = vi.fn();
const updateNodeData = vi.fn();

const gateway: CanvasGenerationTaskGateway = {
  awaitCompletion: (taskKey, projectId) =>
    awaitCompletion(taskKey, projectId),
  fetchResult: (projectId, taskType, jobId) =>
    fetchResult(projectId, taskType, jobId),
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
    fetchResult.mockReset();
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

  it('writes a completed video-upscale URL back to its video node', async () => {
    awaitCompletion.mockResolvedValue({
      result: { output_url: '/static/project-1/upscaled.mp4?v=42' },
    });

    await resume(
      generationNode('videoNode', {
        generationTaskType: 'freezone_video_upscale',
      }),
    );

    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        generationTaskJobId: null,
        generationTaskKey: null,
        generationTaskType: null,
        isGenerating: false,
        videoUrl: '/static/project-1/upscaled.mp4?v=42',
      }),
    );
  });

  it('keeps one writer for an in-session task and releases it on settlement', () => {
    const task = {
      task_key: 'task-owned-terminal',
      task_type: 'freezone_video_upscale',
      job_id: 'job-owned-terminal',
    };
    generationTaskDescriptor(task);
    const node = generationNode('videoNode', {
      generationTaskKey: task.task_key,
      generationTaskType: task.task_type,
      generationTaskJobId: task.job_id,
    });

    expect(nodeNeedsGenerationResume(node)).toBe(false);
    expect(clearGenerationTaskDescriptor(task.task_key)).toEqual({
      generationTaskKey: null,
      generationTaskType: null,
      generationTaskJobId: null,
      generationTaskRefs: null,
    });
    expect(nodeNeedsGenerationResume(node)).toBe(true);
  });

  it('keeps one writer for every task in an in-session batch', () => {
    const tasks = [
      {
        task_key: 'task-owned-batch-1',
        task_type: 'freezone_gen',
        job_id: 'job-owned-batch-1',
      },
      {
        task_key: 'task-owned-batch-2',
        task_type: 'freezone_gen',
        job_id: 'job-owned-batch-2',
      },
    ];
    const descriptor = generationTaskBatchDescriptor(tasks);
    const node = generationNode('imageGenNode', descriptor);

    expect(nodeNeedsGenerationResume(node)).toBe(false);
    clearGenerationTaskDescriptor(tasks.map((task) => task.task_key));
    expect(nodeNeedsGenerationResume(node)).toBe(true);
  });

  it('recovers every persisted image task in a batch after reload', async () => {
    const tasks = [
      {
        task_key: 'task-batch-1',
        task_type: 'freezone_gen',
        job_id: 'job-batch-1',
      },
      {
        task_key: 'task-batch-2',
        task_type: 'freezone_gen',
        job_id: 'job-batch-2',
      },
    ];
    awaitCompletion.mockImplementation(async (taskKey: string) => ({
      result: {
        output_url: `/static/project-1/${taskKey}.png`,
      },
    }));

    await resume(
      generationNode('imageGenNode', {
        generationTaskJobId: tasks[0].job_id,
        generationTaskKey: tasks[0].task_key,
        generationTaskType: tasks[0].task_type,
        generationTaskRefs: tasks,
      }),
    );

    expect(awaitCompletion).toHaveBeenCalledTimes(2);
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        generationBatch: [
          '/static/project-1/task-batch-1.png',
          '/static/project-1/task-batch-2.png',
        ],
        generationTaskRefs: null,
        imageUrl: '/static/project-1/task-batch-1.png',
        isGenerating: false,
      }),
    );
  });

  it('keeps successful batch outputs when another persisted task fails', async () => {
    const tasks = [
      {
        task_key: 'task-partial-1',
        task_type: 'freezone_video_gen',
        job_id: 'job-partial-1',
      },
      {
        task_key: 'task-partial-2',
        task_type: 'freezone_video_gen',
        job_id: 'job-partial-2',
      },
    ];
    awaitCompletion.mockImplementation(async (taskKey: string) => {
      if (taskKey === 'task-partial-1') {
        throw new Error('first task failed');
      }
      return { result: { output_url: '/static/project-1/partial.mp4' } };
    });

    await resume(
      generationNode('videoNode', {
        generationTaskJobId: tasks[0].job_id,
        generationTaskKey: tasks[0].task_key,
        generationTaskType: tasks[0].task_type,
        generationTaskRefs: tasks,
      }),
    );

    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        generationBatch: null,
        generationError: null,
        videoUrl: '/static/project-1/partial.mp4',
      }),
    );
  });

  it('does not route skill tasks through the generic generation recovery', () => {
    expect(nodeNeedsGenerationResume(generationNode('skillNode'))).toBe(false);
  });

  it('leaves legacy export-image post-processing to its dedicated task owner', () => {
    expect(nodeNeedsGenerationResume(generationNode('exportImageNode', {
      generationJobId: 'job-1',
    }))).toBe(false);
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

  it('uses completed inline script and reverse-prompt results before fallback requests', async () => {
    const scriptResult = {
      rows: [{ dialogue: '内嵌台词' }],
      title: '内嵌剧本',
    };
    awaitCompletion.mockResolvedValueOnce({ result: scriptResult });

    await resume(
      generationNode('scriptNode', {
        generationTaskType: 'freezone_story_script',
      }),
    );

    expect(fetchStoryScriptResult).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({ scriptResult }),
    );

    updateNodeData.mockClear();
    awaitCompletion.mockResolvedValueOnce({
      result: { prompt: '内嵌反推提示词' },
    });
    await resume(
      generationNode('textAnnotationNode', {
        generationTaskType: 'freezone_image_reverse_prompt',
      }),
    );

    expect(fetchReversePrompt).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({ content: '内嵌反推提示词' }),
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

  it('recovers an artifact after its completed task record was cleared', async () => {
    hasTask.mockResolvedValue(false);
    fetchResultUrl.mockResolvedValue('/static/project-1/persisted.mp4');

    await resume(
      generationNode('videoNode', {
        generationTaskType: 'freezone_video_upscale',
      }),
    );

    expect(awaitCompletion).not.toHaveBeenCalled();
    expect(fetchResultUrl).toHaveBeenCalledWith(
      'project-1',
      'freezone_video_upscale',
      'job-1',
    );
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        generationTaskKey: null,
        isGenerating: false,
        videoUrl: '/static/project-1/persisted.mp4',
      }),
    );
  });

  it('clears a malformed persisted task instead of retrying it forever', async () => {
    await resume(
      generationNode('audioNode', {
        generationTaskType: null,
      }),
    );

    expect(hasTask).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenLastCalledWith(
      'node-1',
      expect.objectContaining({
        generationError: '生成任务信息不完整',
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
