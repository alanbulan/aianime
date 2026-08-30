// Copyright (c) 2026 AI anime

import { CommercialApiError } from "../commercial-api-client.js";
import type { CommercialModelProviderStrategy } from "./types.js";
import { requestOpenAiCompatible } from "./openai-compatible.js";
import {
  assertPost,
  assertSpeechRole,
  audioFormat,
  createNativeProviderStrategy,
  fetchProvider,
  hexAudioResponse,
  mediaTypeForFormat,
  nativeJsonHeaders,
  numberValue,
  objectValue,
  preparedJsonObject,
  providerUrl,
  requiredText,
  validateNativeAudioRoles,
} from "./shared.js";

const SPEECH_MODELS = [
  "speech-2.8-hd",
  "speech-2.8-turbo",
  "speech-2.6-hd",
  "speech-2.6-turbo",
  "speech-02-hd",
  "speech-02-turbo",
  "speech-01-hd",
  "speech-01-turbo",
];
const VOICE_DESIGN_MODEL = "voice-design";

const VOICE_DESIGN_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    voice_prompt: { type: "string", minLength: 1, maxLength: 2000 },
    preview_text: { type: "string", minLength: 1, maxLength: 500 },
    preferred_name: { type: "string", default: "custom_voice", maxLength: 16 },
    language: {
      type: "string",
      enum: ["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"],
      default: "zh",
    },
    sample_rate: { type: "integer", enum: [32000], default: 32000 },
    response_format: { type: "string", enum: ["mp3"], default: "mp3" },
  },
});

const SPEECH_SCHEMA = JSON.stringify({
  type: "object",
  required: ["voice"],
  properties: {
    voice: { type: "string", minLength: 1, maxLength: 256 },
    response_format: {
      type: "string",
      enum: ["mp3", "wav", "flac"],
      default: "mp3",
    },
  },
});

export const miniMaxAudioProviderStrategy: CommercialModelProviderStrategy =
  createNativeProviderStrategy({
    id: "minimax-audio",
    matches: (url) =>
      ["api.minimax.io", "api-uw.minimax.io", "api.minimaxi.com"].includes(
        url.hostname.toLowerCase(),
      ) || /\/v1\/(?:t2a_v2|voice_design)\/?$/i.test(url.pathname),
    canonicalHosts: new Set([
      "api.minimax.io",
      "api-uw.minimax.io",
      "api.minimaxi.com",
    ]),
    discoverModelIds: async () => [...SPEECH_MODELS, VOICE_DESIGN_MODEL],
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
      validateNativeAudioRoles("MiniMax Speech", assignments, [
        "AUDIO_SPEECH",
        "AUDIO_VOICE_DESIGN",
      ]);
      for (const assignment of assignments) {
        if (
          assignment.role === "AUDIO_VOICE_DESIGN" &&
          assignment.modelId !== VOICE_DESIGN_MODEL
        ) {
          throw new Error(
            `MiniMax 声线设计用途必须填写 ${VOICE_DESIGN_MODEL}`,
          );
        }
        if (
          assignment.role === "AUDIO_SPEECH" &&
          assignment.modelId === VOICE_DESIGN_MODEL
        ) {
          throw new Error("MiniMax 的 voice-design 不能用于语音合成");
        }
      }
    },
    request: (route, input, prepared) =>
      route.role.startsWith("AUDIO_")
        ? requestMiniMaxAudio(route, input, prepared)
        : requestOpenAiCompatible(route, input, prepared),
  });

async function requestMiniMaxAudio(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  assertPost(input.method, "MiniMax Speech");
  const payload = preparedJsonObject(prepared);
  if (route.role === "AUDIO_VOICE_DESIGN") {
    const preview = requiredText(payload.preview_text, "MiniMax 试听文本");
    if (preview.length > 500) {
      throw new CommercialApiError("MiniMax 试听文本最多 500 字", {
        status: 422,
      });
    }
    const response = await fetchProvider(
      route,
      providerUrl(route.baseUrl ?? "", "/v1/voice_design"),
      {
        method: "POST",
        headers: nativeJsonHeaders(route, { Accept: "application/json" }),
        body: JSON.stringify({
          prompt: requiredText(payload.voice_prompt, "MiniMax 声线描述"),
          preview_text: preview,
        }),
        signal: input.signal,
      },
    );
    if (!response.ok) return response;
    const root = objectValue(await response.json(), "MiniMax 声线设计响应");
    assertMiniMaxSuccess(root, "MiniMax 声线设计");
    return hexAudioResponse(
      response,
      String(root.trial_audio ?? ""),
      "audio/mpeg",
      String(root.voice_id ?? ""),
      "MiniMax 声线设计",
    );
  }

  assertSpeechRole(route, "MiniMax Speech");
  const voice = requiredText(payload.voice, "MiniMax 音色 ID");
  const format = audioFormat(payload, ["mp3", "wav", "flac"]);
  const speed = numberValue(payload.speed) ?? 1;
  const response = await fetchProvider(
    route,
    providerUrl(route.baseUrl ?? "", "/v1/t2a_v2"),
    {
      method: "POST",
      headers: nativeJsonHeaders(route, { Accept: "application/json" }),
      body: JSON.stringify({
        model: route.modelId,
        text: requiredText(payload.input, "MiniMax 语音合成文本"),
        stream: false,
        output_format: "hex",
        language_boost: "auto",
        voice_setting: { voice_id: voice, speed, vol: 1, pitch: 0 },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format,
          channel: 1,
        },
      }),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;
  const root = objectValue(await response.json(), "MiniMax 语音合成响应");
  assertMiniMaxSuccess(root, "MiniMax 语音合成");
  const data = objectValue(root.data ?? {}, "MiniMax 语音合成 data");
  return hexAudioResponse(
    response,
    String(data.audio ?? ""),
    mediaTypeForFormat(format),
    "",
    "MiniMax 语音合成",
  );
}

function assertMiniMaxSuccess(
  root: Record<string, unknown>,
  providerName: string,
): void {
  const baseResponse = objectValue(
    root.base_resp ?? {},
    `${providerName} base_resp`,
  );
  const statusCode = Number(baseResponse.status_code ?? 0);
  if (statusCode === 0) return;
  throw new CommercialApiError(
    `${providerName}失败：${String(baseResponse.status_msg ?? statusCode)}`,
    { status: 502 },
  );
}
