// Copyright (c) 2026 AI anime
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import {
  separateCanvasAudioVideo as separateCanvasAudioVideoUseCase,
  type SeparateCanvasAudioVideoParams,
} from "./application/separateCanvasAudioVideo";
import { freezoneAudioSeparationGateway } from "./infrastructure/freezoneAudioSeparationGateway";

export function separateCanvasAudioVideo(
  params: SeparateCanvasAudioVideoParams,
) {
  return separateCanvasAudioVideoUseCase(params, {
    audioSeparationGateway: freezoneAudioSeparationGateway,
    taskGateway: {
      async awaitCompletion(taskKey, projectId) {
        const task = await awaitTaskCompletion(taskKey, projectId);
        return { result: task.result };
      },
    },
  });
}
