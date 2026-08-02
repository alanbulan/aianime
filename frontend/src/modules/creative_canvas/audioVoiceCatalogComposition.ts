// Copyright (c) 2026 AI anime
import { freezoneAudioVoiceCatalogGateway } from "./infrastructure/freezoneAudioVoiceCatalogGateway";

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
