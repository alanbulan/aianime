// Copyright (c) 2026 AI anime
import {
  fetchFreezoneAudioSeparateResult,
  submitFreezoneAudioSeparate,
} from "@/api/ops";

import type { CanvasAudioSeparationGateway } from "../application/separateCanvasAudioVideo";

export const freezoneAudioSeparationGateway: CanvasAudioSeparationGateway = {
  async submit(projectId, command) {
    const task = await submitFreezoneAudioSeparate(projectId, {
      sourceUrl: command.sourceUrl,
      ...(command.targetEpisode != null
        ? { targetEpisode: command.targetEpisode }
        : {}),
      ...(command.targetBeat != null ? { targetBeat: command.targetBeat } : {}),
    });
    if (task.task_type !== "freezone_audio_separate") {
      throw new Error(
        `Unexpected audio separation task type: ${task.task_type}`,
      );
    }
    return {
      job_id: task.job_id,
      task_key: task.task_key,
      task_type: task.task_type,
    };
  },
  async fetchResult(projectId, jobId) {
    return await fetchFreezoneAudioSeparateResult(projectId, jobId);
  },
};
