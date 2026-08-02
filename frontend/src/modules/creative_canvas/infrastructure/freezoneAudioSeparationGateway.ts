// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  CanvasAudioSeparationGateway,
  CanvasAudioSeparationTaskRef,
} from "../application/separateCanvasAudioVideo";

export const freezoneAudioSeparationGateway: CanvasAudioSeparationGateway = {
  async submit(projectId, command) {
    const task = await apiCall<CanvasAudioSeparationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/video/audio-separate`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          target_episode: command.targetEpisode,
          target_beat: command.targetBeat,
        },
      },
    );
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
    return await apiCall<Record<string, unknown>>(
      `projects/${encodeURIComponent(projectId)}/freezone/jobs/freezone_audio_separate/${encodeURIComponent(jobId)}/result`,
    );
  },
};
