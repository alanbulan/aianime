// Copyright (c) 2026 AI anime
import { freezoneAudioVoiceCatalogGateway } from "./infrastructure/freezoneAudioVoiceCatalogGateway";
import type {
  DesignCanvasAudioVoiceInput,
  PresetCanvasAudioVoiceInput,
} from "./application/audioVoiceCatalog";

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

export function deleteCanvasAudioVoice(projectId: string, voiceId: string) {
  return freezoneAudioVoiceCatalogGateway.deleteVoice(projectId, voiceId);
}

export function createPresetCanvasAudioVoice(
  projectId: string,
  input: PresetCanvasAudioVoiceInput,
) {
  return freezoneAudioVoiceCatalogGateway.createPresetVoice(projectId, input);
}

export function designCanvasAudioVoice(
  projectId: string,
  input: DesignCanvasAudioVoiceInput,
) {
  return freezoneAudioVoiceCatalogGateway.designVoice(projectId, input);
}
