// Copyright (c) 2026 AI anime
import {
  fetchFreezoneJobResult,
  fetchFreezoneReversePromptResult,
  fetchFreezoneStoryScriptResult,
} from '@/api/ops';
import { awaitTaskCompletion, listTasks } from '@/api/tasks';

import type { CanvasGenerationTaskGateway } from '../application/ports';

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
    const result = await fetchFreezoneJobResult(
      projectId,
      taskType,
      jobId,
    );
    return result.url;
  },

  async fetchReversePrompt(projectId, jobId) {
    const result = await fetchFreezoneReversePromptResult(projectId, jobId);
    return result.prompt;
  },

  async fetchStoryScriptResult(projectId, jobId) {
    return await fetchFreezoneStoryScriptResult(projectId, jobId);
  },
};
