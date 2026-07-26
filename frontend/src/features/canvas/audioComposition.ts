// Copyright (c) 2026 AI anime
import {
  generateCanvasAudio as generateCanvasAudioUseCase,
  type GenerateCanvasAudioParams,
} from './application/generateCanvasAudio';
import type { CanvasGenerationTaskRef } from './application/ports';
import { freezoneAudioGenerationGateway } from './infrastructure/freezoneAudioGenerationGateway';
import { freezoneAudioVoiceCatalogGateway } from './infrastructure/freezoneAudioVoiceCatalogGateway';
import { freezoneGenerationTaskGateway } from './infrastructure/freezoneGenerationTaskGateway';

export function generateCanvasAudio(
  params: GenerateCanvasAudioParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasAudioUseCase(params, {
    submissionGateway: freezoneAudioGenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
  });
}

export function loadCanvasAudioReferences(projectId: string) {
  return freezoneAudioVoiceCatalogGateway.listReferences(projectId);
}

export function createCanvasAudioVoice(
  projectId: string,
  file: File | Blob,
  name?: string,
) {
  return freezoneAudioVoiceCatalogGateway.createVoice(projectId, file, name);
}
