// Copyright (c) 2026 AI anime
import { awaitTaskCompletion, listTasks } from '@/api/tasks';
import { apiCall } from '@/shared/api/client';

import type {
  CanvasGenerationTaskGateway,
  CanvasStoryScriptResult,
} from '../application/ports';

interface ResultUrlTransport {
  readonly url: string;
}

interface ReversePromptTransport {
  readonly prompt: string;
}

function resultPath(projectId: string, taskType: string, jobId: string): string {
  return `projects/${encodeURIComponent(projectId)}/freezone/jobs/${encodeURIComponent(taskType)}/${encodeURIComponent(jobId)}/result`;
}

export const freezoneGenerationTaskGateway: CanvasGenerationTaskGateway = {
  async hasTask(projectId, taskKey) {
    const tasks = await listTasks(projectId);
    return tasks.some((task) => task.task_key === taskKey);
  },

  async awaitCompletion(taskKey, projectId) {
    const completed = await awaitTaskCompletion(taskKey, projectId);
    return { result: completed.result };
  },

  async fetchResultUrl(projectId, taskType, jobId) {
    const result = await apiCall<ResultUrlTransport>(
      resultPath(projectId, taskType, jobId),
    );
    return result.url;
  },

  async fetchReversePrompt(projectId, jobId) {
    const result = await apiCall<ReversePromptTransport>(
      resultPath(projectId, 'freezone_image_reverse_prompt', jobId),
    );
    return result.prompt;
  },

  async fetchStoryScriptResult(projectId, jobId) {
    return await apiCall<CanvasStoryScriptResult>(
      resultPath(projectId, 'freezone_story_script', jobId),
    );
  },
};
