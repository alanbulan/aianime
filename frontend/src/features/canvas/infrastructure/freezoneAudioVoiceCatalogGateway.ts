// Copyright (c) 2026 AI anime
import {
  createFreezoneAudioVoice,
  fetchFreezoneAudioReferences,
  type FreezoneAudioReferenceItem,
} from "@/api/ops";

import type {
  CanvasAudioReference,
  CanvasAudioVoiceCatalogGateway,
} from "../application/audioVoiceCatalog";

function mapGender(item: FreezoneAudioReferenceItem): string | null {
  const raw =
    item.gender ?? (item as Record<string, unknown>).sex;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function mapAudioReference(
  item: FreezoneAudioReferenceItem,
): CanvasAudioReference {
  return {
    ref: {
      scope: item.scope,
      ...(item.character_name != null
        ? { characterName: item.character_name }
        : {}),
      ...(item.identity_id != null ? { identityId: item.identity_id } : {}),
      ...(item.slot != null ? { slot: item.slot } : {}),
      ...(item.voice_id != null ? { voiceId: item.voice_id } : {}),
    },
    label: item.label ?? null,
    language: item.language ?? null,
    gender: mapGender(item),
    previewUrl: item.preview_url ?? null,
  };
}

export const freezoneAudioVoiceCatalogGateway: CanvasAudioVoiceCatalogGateway = {
  async listReferences(projectId) {
    const result = await fetchFreezoneAudioReferences(projectId);
    return result.available.map(mapAudioReference);
  },
  async createVoice(projectId, file, name) {
    await createFreezoneAudioVoice(projectId, file, name);
  },
};
