// Copyright (c) 2026 AI anime
import { apiCall, apiRequest } from "@/shared/api/client";

import type {
  CanvasAudioReference,
  CanvasAudioVoiceCatalogGateway,
  DesignedCanvasAudioVoice,
} from "../application/audioVoiceCatalog";

interface AudioReferenceTransport extends Record<string, unknown> {
  readonly scope: CanvasAudioReference["ref"]["scope"];
  readonly character_name?: string | null;
  readonly identity_id?: string | null;
  readonly slot?: string | null;
  readonly voice_id?: string | null;
  readonly label?: string | null;
  readonly language?: string | null;
  readonly gender?: string | null;
  readonly preview_url?: string | null;
  readonly url?: string | null;
}

interface DesignedVoiceTransport extends Record<string, unknown> {
  readonly voice_id?: string | null;
  readonly name?: string | null;
  readonly preview_url?: string | null;
  readonly provider_voice_id?: string | null;
}

function referenceItems(payload: unknown): AudioReferenceTransport[] {
  if (Array.isArray(payload)) return payload as AudioReferenceTransport[];
  if (!payload || typeof payload !== "object") return [];
  const wrapper = payload as Record<string, unknown>;
  for (const key of ["available", "items", "data"]) {
    if (Array.isArray(wrapper[key])) {
      return wrapper[key] as AudioReferenceTransport[];
    }
  }
  return [];
}

function mapGender(item: AudioReferenceTransport): string | null {
  const raw = item.gender ?? item.sex;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

function mapAudioReference(
  item: AudioReferenceTransport,
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
    previewUrl: item.preview_url ?? item.url ?? null,
  };
}

export const freezoneAudioVoiceCatalogGateway: CanvasAudioVoiceCatalogGateway = {
  async listReferences(projectId) {
    const payload = await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/audio/references`,
    );
    return referenceItems(payload).map(mapAudioReference);
  },
  async createVoice(projectId, file, name) {
    const body = new FormData();
    body.append(
      "file",
      file,
      file instanceof File ? file.name : "voice.wav",
    );
    if (name && name.trim()) body.append("name", name.trim());
    const response = await apiRequest(
      `projects/${encodeURIComponent(projectId)}/freezone/audio/voices`,
      {
        method: "POST",
        body,
        timeout: false,
      },
    ).json<{ ok: boolean; data?: unknown; error?: string }>();
    if (!response.ok || !response.data) {
      throw new Error(response.error ?? "voice upload failed");
    }
  },
  async designVoice(projectId, input) {
    const response = await apiRequest(
      `projects/${encodeURIComponent(projectId)}/freezone/audio/voices/design`,
      {
        method: "POST",
        json: {
          name: input.name,
          model_selector: input.modelSelector,
          voice_prompt: input.voicePrompt,
          preview_text: input.previewText,
          preferred_name: input.preferredName,
          language: input.language,
          sample_rate: input.sampleRate,
          response_format: input.responseFormat,
        },
        timeout: false,
      },
    ).json<{
      ok: boolean;
      data?: DesignedVoiceTransport;
      error?: string;
    }>();
    const data = response.data;
    const voiceId = String(data?.voice_id ?? "").trim();
    if (!response.ok || !data || !voiceId) {
      throw new Error(response.error ?? "voice design failed");
    }
    return {
      voiceId,
      label: String(data.name ?? input.name ?? voiceId).trim() || voiceId,
      previewUrl:
        typeof data.preview_url === "string" && data.preview_url.trim()
          ? data.preview_url
          : null,
      providerVoiceId:
        typeof data.provider_voice_id === "string" &&
        data.provider_voice_id.trim()
          ? data.provider_voice_id
          : null,
    } satisfies DesignedCanvasAudioVoice;
  },
};
