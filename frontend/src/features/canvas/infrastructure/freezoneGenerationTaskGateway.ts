// Copyright (c) 2026 AI anime
import { awaitTaskCompletion, listTasks } from '@/modules/task_execution/public';
import {
  fetchCanvasGenerationResult,
  fetchCanvasGenerationResultUrl,
} from '@/modules/creative_canvas/public';

import type {
  CanvasGenerationTaskGateway,
  CanvasStoryScriptResult,
} from '../application/ports';

interface ReversePromptTransport {
  readonly prompt: string;
}

function canvasTaskResult(
  value: unknown,
): Record<string, unknown> | null | undefined {
  if (value == null) return value;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export const freezoneGenerationTaskGateway: CanvasGenerationTaskGateway = {
  async hasTask(projectId, taskKey) {
    const tasks = await listTasks(projectId);
    return tasks.some((task) => task.task_key === taskKey);
  },

  async awaitCompletion(taskKey, projectId) {
    const completed = await awaitTaskCompletion(taskKey, projectId);
    return { result: canvasTaskResult(completed.result) };
  },

  async fetchResultUrl(projectId, taskType, jobId) {
    return await fetchCanvasGenerationResultUrl(projectId, taskType, jobId);
  },

  async fetchReversePrompt(projectId, jobId) {
    const result = await fetchCanvasGenerationResult<ReversePromptTransport>(
      projectId,
      'freezone_image_reverse_prompt',
      jobId,
    );
    return result.prompt;
  },

  async fetchStoryScriptResult(projectId, jobId) {
    return await fetchCanvasGenerationResult<CanvasStoryScriptResult>(
      projectId,
      'freezone_story_script',
      jobId,
    );
  },
};
