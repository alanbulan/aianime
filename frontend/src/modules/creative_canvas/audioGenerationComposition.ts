// Copyright (c) 2026 AI anime
import {
  generateCanvasAudio as generateCanvasAudioUseCase,
  type GenerateCanvasAudioParams,
  type CanvasAudioGenerationTaskRef,
} from "./application/generateCanvasAudio";
import { freezoneAudioGenerationGateway } from "./infrastructure/freezoneAudioGenerationGateway";
import { freezoneGenerationTaskGateway } from "./infrastructure/freezoneGenerationTaskGateway";

export function generateCanvasAudio(
  params: GenerateCanvasAudioParams,
  onTaskSubmitted: (task: CanvasAudioGenerationTaskRef) => void,
) {
  return generateCanvasAudioUseCase(params, {
    submissionGateway: freezoneAudioGenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
  });
}
