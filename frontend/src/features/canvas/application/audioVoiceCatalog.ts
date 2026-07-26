// Copyright (c) 2026 AI anime
import type { AudioVoiceRef } from "../domain/canvasNodes";

export interface CanvasAudioReference {
  readonly ref: AudioVoiceRef;
  readonly label: string | null;
  readonly language: string | null;
  readonly gender: string | null;
  readonly previewUrl: string | null;
}

export interface CanvasAudioVoiceCatalogGateway {
  listReferences(projectId: string): Promise<CanvasAudioReference[]>;
  createVoice(
    projectId: string,
    file: File | Blob,
    name?: string,
  ): Promise<void>;
}
