// Copyright (c) 2026 AI anime
import { freezoneAudioVoiceCatalogGateway } from "./infrastructure/freezoneAudioVoiceCatalogGateway";
import type { DesignCanvasAudioVoiceInput } from "./application/audioVoiceCatalog";

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

export function designCanvasAudioVoice(
  projectId: string,
  input: DesignCanvasAudioVoiceInput,
) {
  return freezoneAudioVoiceCatalogGateway.designVoice(projectId, input);
}
