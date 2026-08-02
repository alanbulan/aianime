// Copyright (c) 2026 AI anime
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import {
  generateCanvasAudio as generateCanvasAudioUseCase,
  type GenerateCanvasAudioParams,
  type CanvasAudioGenerationTaskRef,
} from "./application/generateCanvasAudio";
import { freezoneAudioGenerationGateway } from "./infrastructure/freezoneAudioGenerationGateway";
import { fetchCanvasGenerationResultUrl } from "./infrastructure/freezoneGenerationResultGateway";

export function generateCanvasAudio(
  params: GenerateCanvasAudioParams,
  onTaskSubmitted: (task: CanvasAudioGenerationTaskRef) => void,
) {
  return generateCanvasAudioUseCase(params, {
    submissionGateway: freezoneAudioGenerationGateway,
    resultGateway: { fetchResultUrl: fetchCanvasGenerationResultUrl },
    taskGateway: {
      async awaitCompletion(taskKey, projectId) {
        await awaitTaskCompletion(taskKey, projectId);
      },
    },
    onTaskSubmitted,
  });
}
