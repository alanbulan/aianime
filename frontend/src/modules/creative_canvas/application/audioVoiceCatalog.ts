// Copyright (c) 2026 AI anime
import type { AudioVoiceRef } from "../domain/audioVoice";

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

export function audioVoiceRefKey(ref: AudioVoiceRef): string {
  return [
    ref.scope,
    ref.characterName ?? "",
    ref.identityId ?? "",
    ref.slot ?? "",
    ref.voiceId ?? "",
  ].join("|");
}

export function describeAudioVoiceRef(ref: AudioVoiceRef): string {
  switch (ref.scope) {
    case "project_narrator":
      return "项目解说人";
    case "user_custom":
      return ref.voiceId ?? "自定义音色";
    case "character_default":
      return `${ref.characterName ?? "角色"}（默认声线）`;
    case "character_age_group":
      return `${ref.characterName ?? "角色"}（${ref.slot ?? "年龄段"}）`;
    case "identity":
      return `${ref.identityId ?? "身份"}（自有声线）`;
    case "identity_resolved":
      return `${ref.identityId ?? "身份"}（解析后）`;
  }
}
