// Copyright (c) 2026 AI anime

import { CommercialApiError } from "../commercial-api-client.js";
import type { CommercialModelProviderStrategy } from "./types.js";
import { requestOpenAiCompatible } from "./openai-compatible.js";
import {
  assertPost,
  assertSpeechRole,
  audioFormat,
  base64AudioResponse,
  createNativeProviderStrategy,
  fetchProvider,
  nativeJsonHeaders,
  numberValue,
  objectValue,
  preparedJsonObject,
  providerUrl,
  requiredText,
  stringValue,
  validateNativeAudioRoles,
} from "./shared.js";

const TTS_MODELS = ["s1", "s2-pro", "s2.1-pro", "s2.1-pro-free"];
const VOICE_DESIGN_MODEL = "voice-design-1";

const VOICE_DESIGN_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    voice_prompt: { type: "string", minLength: 1, maxLength: 2000 },
    preview_text: { type: "string", minLength: 1, maxLength: 150 },
    preferred_name: { type: "string", default: "custom_voice", maxLength: 16 },
    language: {
      type: "string",
      enum: ["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"],
      default: "zh",
    },
    sample_rate: { type: "integer", enum: [24000], default: 24000 },
    response_format: { type: "string", enum: ["wav"], default: "wav" },
  },
});

const SPEECH_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    voice: { type: "string", maxLength: 256 },
    response_format: {
      type: "string",
      enum: ["wav", "pcm", "mp3", "opus"],
      default: "mp3",
    },
  },
});

export const fishAudioProviderStrategy: CommercialModelProviderStrategy =
  createNativeProviderStrategy({
    id: "fish-audio",
    matches: (url) =>
      url.hostname.toLowerCase() === "api.fish.audio" ||
      /\/v1\/(?:tts|voice-design)(?:\/v1)?\/?$/i.test(url.pathname),
    canonicalHosts: new Set(["api.fish.audio"]),
    discoverModelIds: async () => [...TTS_MODELS, VOICE_DESIGN_MODEL],
    parameterSchema: (role) =>
      role === "AUDIO_VOICE_DESIGN"
        ? VOICE_DESIGN_SCHEMA
        : role === "AUDIO_SPEECH"
          ? SPEECH_SCHEMA
          : null,
    migrateAssignments: (assignments) =>
      assignments.map((assignment) =>
        assignment.role === "AUDIO_VOICE_DESIGN" &&
        assignment.modelId !== VOICE_DESIGN_MODEL
          ? { ...assignment, modelId: VOICE_DESIGN_MODEL }
          : { ...assignment },
      ),
    validateAssignments: (assignments) => {
      validateNativeAudioRoles("Fish Audio", assignments, [
        "AUDIO_SPEECH",
        "AUDIO_VOICE_DESIGN",
      ]);
      for (const assignment of assignments) {
        if (
          assignment.role === "AUDIO_VOICE_DESIGN" &&
          assignment.modelId !== VOICE_DESIGN_MODEL
        ) {
          throw new Error(
            `Fish Audio 的文字声线设计模型必须填写 ${VOICE_DESIGN_MODEL}`,
          );
        }
        if (
          assignment.role === "AUDIO_SPEECH" &&
          assignment.modelId === VOICE_DESIGN_MODEL
        ) {
          throw new Error("Fish Audio 的 voice-design-1 不能用于语音合成");
        }
      }
    },
    request: (route, input, prepared) =>
      route.role.startsWith("AUDIO_")
        ? requestFishAudio(route, input, prepared)
        : requestOpenAiCompatible(route, input, prepared),
  });

async function requestFishAudio(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  assertPost(input.method, "Fish Audio");
  const payload = preparedJsonObject(prepared);
  if (route.role === "AUDIO_VOICE_DESIGN") {
    const prompt = requiredText(payload.voice_prompt, "Fish Audio 声线描述");
    const preview = requiredText(payload.preview_text, "Fish Audio 试听文本");
    if (prompt.length > 2000 || preview.length > 150) {
      throw new CommercialApiError(
        "Fish Audio 声线描述最多 2000 字，试听文本最多 150 字",
        { status: 422 },
      );
    }
    const response = await fetchProvider(
      route,
      providerUrl(route.baseUrl ?? "", "/v1/voice-design"),
      {
        method: "POST",
        headers: nativeJsonHeaders(route, {
          Accept: "application/json",
          model: route.modelId,
        }),
        body: JSON.stringify({
          instruction: prompt,
          reference_text: preview,
          ...(stringValue(payload.language)
            ? { language: stringValue(payload.language) }
            : {}),
          n: 1,
        }),
        signal: input.signal,
      },
    );
    if (!response.ok) return response;
    const root = objectValue(await response.json(), "Fish Audio 声线设计响应");
    const candidates = Array.isArray(root.candidates) ? root.candidates : [];
    const candidate = candidates[0]
      ? objectValue(candidates[0], "Fish Audio 声线候选")
      : {};
    return base64AudioResponse(
      response,
      String(candidate.audio_base64 ?? ""),
      "audio/wav",
      String(candidate.id ?? ""),
      "Fish Audio 声线设计",
    );
  }

  assertSpeechRole(route, "Fish Audio");
  const format = audioFormat(payload, ["wav", "pcm", "mp3", "opus"]);
  const voice = stringValue(payload.voice);
  const speed = numberValue(payload.speed);
  return fetchProvider(route, providerUrl(route.baseUrl ?? "", "/v1/tts"), {
    method: "POST",
    headers: nativeJsonHeaders(route, {
      Accept: "audio/*",
      model: route.modelId,
    }),
    body: JSON.stringify({
      text: requiredText(payload.input, "Fish Audio 语音合成文本"),
      format,
      ...(voice ? { reference_id: voice } : {}),
      ...(speed === null ? {} : { prosody: { speed } }),
    }),
    signal: input.signal,
  });
}
