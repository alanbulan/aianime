// Copyright (c) 2026 AI anime

import type { CommercialModelProviderStrategy } from "./types.js";
import { requestOpenAiCompatible } from "./openai-compatible.js";
import {
  assertPost,
  assertSpeechRole,
  audioFormat,
  createNativeProviderStrategy,
  fetchProvider,
  nativeJsonHeaders,
  numberValue,
  preparedJsonObject,
  providerUrl,
  requiredText,
  validateNativeAudioRoles,
} from "./shared.js";

const TTS_MODELS = ["sonic-3.6", "sonic-3.5", "sonic-turbo"];
const SPEECH_SCHEMA = JSON.stringify({
  type: "object",
  required: ["voice"],
  properties: {
    voice: { type: "string", minLength: 1, maxLength: 256 },
    response_format: {
      type: "string",
      enum: ["mp3", "wav", "pcm"],
      default: "mp3",
    },
  },
});

export const cartesiaProviderStrategy: CommercialModelProviderStrategy =
  createNativeProviderStrategy({
    id: "cartesia",
    matches: (url) =>
      url.hostname.toLowerCase() === "api.cartesia.ai" ||
      /\/tts\/bytes\/?$/i.test(url.pathname),
    canonicalHosts: new Set(["api.cartesia.ai"]),
    discoverModelIds: async () => [...TTS_MODELS],
    parameterSchema: (role) =>
      role === "AUDIO_SPEECH" ? SPEECH_SCHEMA : null,
    validateAssignments: (assignments) =>
      validateNativeAudioRoles("Cartesia", assignments, ["AUDIO_SPEECH"]),
    request: (route, input, prepared) =>
      route.role.startsWith("AUDIO_")
        ? requestCartesia(route, input, prepared)
        : requestOpenAiCompatible(route, input, prepared),
  });

async function requestCartesia(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  assertPost(input.method, "Cartesia");
  assertSpeechRole(route, "Cartesia");
  const payload = preparedJsonObject(prepared);
  const format = audioFormat(payload, ["mp3", "wav", "pcm"]);
  const speed = numberValue(payload.speed);
  return fetchProvider(
    route,
    providerUrl(route.baseUrl ?? "", "/tts/bytes"),
    {
      method: "POST",
      headers: nativeJsonHeaders(route, {
        Accept: "audio/*",
        "Cartesia-Version": "2026-08-14",
      }),
      body: JSON.stringify({
        model_id: route.modelId,
        transcript: requiredText(payload.input, "Cartesia 语音合成文本"),
        voice: requiredText(payload.voice, "Cartesia Voice ID"),
        output_format: outputFormat(format),
        ...(speed === null ? {} : { generation_config: { speed } }),
      }),
      signal: input.signal,
    },
  );
}

function outputFormat(format: string): Record<string, unknown> {
  if (format === "mp3") {
    return { container: "mp3", sample_rate: 44100, bit_rate: 128000 };
  }
  if (format === "wav") {
    return { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 };
  }
  return { container: "raw", encoding: "pcm_s16le", sample_rate: 24000 };
}
