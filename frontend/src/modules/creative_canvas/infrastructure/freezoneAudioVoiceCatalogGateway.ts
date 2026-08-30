// Copyright (c) 2026 AI anime
import { apiCall, apiRequest } from "@/shared/api/client";

import type {
  CanvasAudioReference,
  CanvasAudioVoiceCatalogGateway,
  GeneratedVoiceTaskReceipt,
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

interface VoiceTaskTransport extends Record<string, unknown> {
  readonly task_id?: string | null;
  readonly task_key?: string | null;
  readonly task_scope?: string | null;
  readonly task_type?: string | null;
}

function bindingTransport(
  binding: Parameters<CanvasAudioVoiceCatalogGateway["designVoice"]>[1]["binding"],
) {
  if (!binding) return undefined;
  return {
    kind: binding.kind,
    character_name: binding.characterName,
    ...(binding.kind === "character_slot"
      ? { slot: binding.slot }
      : { identity_id: binding.identityId }),
  };
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
  async deleteVoice(projectId, voiceId) {
    await apiCall<unknown>(
      `projects/${encodeURIComponent(projectId)}/freezone/audio/voices/${encodeURIComponent(voiceId)}`,
      { method: "DELETE" },
    );
  },
  async createPresetVoice(projectId, input) {
    const response = await apiRequest(
      `projects/${encodeURIComponent(projectId)}/freezone/audio/voices/preset`,
      {
        method: "POST",
        json: {
          name: input.name,
          model_selector: input.modelSelector,
          text: input.text,
          voice: input.voice,
          binding: bindingTransport(input.binding),
        },
      },
    ).json<{
      ok: boolean;
      data?: VoiceTaskTransport;
      error?: string;
    }>();
    return voiceTaskResponse(response, "freezone_voice_preset", "preset voice failed");
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
          binding: bindingTransport(input.binding),
        },
      },
    ).json<{
      ok: boolean;
      data?: VoiceTaskTransport;
      error?: string;
    }>();
    return voiceTaskResponse(response, "freezone_voice_design", "voice design failed");
  },
};

function voiceTaskResponse(
  response: {
    ok: boolean;
    data?: VoiceTaskTransport;
    error?: string;
  },
  expectedTaskType: GeneratedVoiceTaskReceipt["taskType"],
  fallbackError: string,
): GeneratedVoiceTaskReceipt {
  const data = response.data;
  const taskType = String(data?.task_type ?? "").trim();
  const taskKey = String(data?.task_key ?? "").trim();
  const scope = String(data?.task_scope ?? "").trim();
  if (
    !response.ok ||
    !data ||
    taskType !== expectedTaskType ||
    !taskKey ||
    !scope
  ) {
    throw new Error(response.error ?? fallbackError);
  }
  return {
    taskType: expectedTaskType,
    taskId:
      typeof data.task_id === "string" && data.task_id.trim()
        ? data.task_id
        : null,
    taskKey,
    scope,
  };
}
