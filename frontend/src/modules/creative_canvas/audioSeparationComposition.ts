// Copyright (c) 2026 AI anime
import {
  separateCanvasAudioVideo as separateCanvasAudioVideoUseCase,
  type SeparateCanvasAudioVideoParams,
} from "./application/separateCanvasAudioVideo";
import { freezoneAudioSeparationGateway } from "./infrastructure/freezoneAudioSeparationGateway";
import { freezoneGenerationTaskGateway } from "./infrastructure/freezoneGenerationTaskGateway";

export function separateCanvasAudioVideo(
  params: SeparateCanvasAudioVideoParams,
) {
  return separateCanvasAudioVideoUseCase(params, {
    audioSeparationGateway: freezoneAudioSeparationGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}
