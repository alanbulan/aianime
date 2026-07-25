// Copyright (c) 2026 AI anime
import {
  fetchFreezoneJobResult,
  submitFreezoneRedraw,
  type FreezoneRedrawAspectRatio,
} from '@/api/ops';
import { awaitTaskCompletion } from '@/api/tasks';

import type { CanvasRedrawTaskGateway } from '../application/ports';

export const freezoneRedrawTaskGateway: CanvasRedrawTaskGateway = {
  async submit(projectId, command) {
    return await submitFreezoneRedraw(projectId, {
      aspectRatio: command.aspectRatio as FreezoneRedrawAspectRatio,
      imageSize: command.imageSize,
      maskUrl: command.maskUrl,
      numImages: 1,
      sourceUrl: command.sourceUrl,
    });
  },

  async awaitCompletion(taskKey, projectId) {
    const completed = await awaitTaskCompletion(taskKey, projectId);
    return {
      result: completed.result as Record<string, unknown> | null | undefined,
    };
  },

  async fetchResultUrl(projectId, taskType, jobId) {
    const result = await fetchFreezoneJobResult(
      projectId,
      taskType,
      jobId,
    );
    return result.url;
  },
};
