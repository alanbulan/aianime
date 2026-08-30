// Copyright (c) 2026 AI anime

import type { CommercialModelProviderStrategy } from "./types.js";
import { requestOpenAiCompatible } from "./openai-compatible.js";
import {
  assertPost,
  assertSpeechRole,
  audioFormat,
  createNativeProviderStrategy,
  discoverOpenAiCompatibleModelCatalog,
  discoverOpenAiCompatibleModels,
  fetchProvider,
  nativeJsonHeaders,
  numberValue,
  preparedJsonObject,
  providerUrl,
  requiredText,
  validateNativeAudioRoles,
} from "./shared.js";

const SPEECH_SCHEMA = JSON.stringify({
  type: "object",
  required: ["voice"],
  properties: {
    voice: {
      type: "string",
      enum: [
        "alloy",
        "ash",
        "ballad",
        "coral",
        "echo",
        "fable",
        "onyx",
        "nova",
        "sage",
        "shimmer",
        "verse",
        "marin",
        "cedar",
      ],
      default: "alloy",
    },
    response_format: {
      type: "string",
      enum: ["mp3", "opus", "aac", "flac", "wav", "pcm"],
      default: "mp3",
    },
  },
});

export const openAiNativeProviderStrategy: CommercialModelProviderStrategy =
  createNativeProviderStrategy({
    id: "openai-native",
    matches: (url) =>
      ["api.openai.com", "api.siliconflow.cn"].includes(
        url.hostname.toLowerCase(),
      ) || /\/v1\/audio\/speech\/?$/i.test(url.pathname),
    canonicalHosts: new Set(["api.openai.com", "api.siliconflow.cn"]),
    discoverModelIds: discoverOpenAiCompatibleModels,
    discoverModels: discoverOpenAiCompatibleModelCatalog,
    parameterSchema: (role) =>
      role === "AUDIO_SPEECH" ? SPEECH_SCHEMA : null,
    validateAssignments: (assignments) =>
      validateNativeAudioRoles("OpenAI 语音接口", assignments, [
        "AUDIO_SPEECH",
      ]),
    request: (route, input, prepared) =>
      route.role === "AUDIO_SPEECH"
        ? requestSpeech(route, input, prepared)
        : requestOpenAiCompatible(route, input, prepared),
  });

async function requestSpeech(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  assertPost(input.method, "OpenAI 语音接口");
  assertSpeechRole(route, "OpenAI 语音接口");
  const payload = preparedJsonObject(prepared);
  const body: Record<string, unknown> = {
    model: route.modelId,
    input: requiredText(payload.input, "语音合成文本"),
    voice: requiredText(payload.voice, "语音音色"),
    response_format: audioFormat(payload, [
      "mp3",
      "opus",
      "aac",
      "flac",
      "wav",
      "pcm",
    ]),
  };
  const speed = numberValue(payload.speed);
  if (speed !== null) body.speed = speed;
  return fetchProvider(
    route,
    providerUrl(route.baseUrl ?? "", "/v1/audio/speech"),
    {
      method: "POST",
      headers: nativeJsonHeaders(route, { Accept: "audio/*" }),
      body: JSON.stringify(body),
      signal: input.signal,
    },
  );
}
