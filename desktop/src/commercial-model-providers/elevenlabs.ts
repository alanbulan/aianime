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
  numberValue,
  objectValue,
  preparedJsonObject,
  providerJson,
  providerUrl,
  requiredText,
  uniqueModelIds,
  validateNativeAudioRoles,
} from "./shared.js";

const VOICE_DESIGN_MODELS = new Set([
  "eleven_multilingual_ttv_v2",
  "eleven_ttv_v3",
]);

const VOICE_DESIGN_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    voice_prompt: { type: "string", minLength: 20, maxLength: 1000 },
    preview_text: { type: "string", minLength: 100, maxLength: 1000 },
    preferred_name: { type: "string", default: "custom_voice", maxLength: 16 },
    language: {
      type: "string",
      enum: ["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"],
      default: "zh",
    },
    sample_rate: { type: "integer", enum: [44100], default: 44100 },
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
      enum: ["mp3", "wav", "pcm", "opus"],
      default: "mp3",
    },
  },
});

export const elevenLabsProviderStrategy: CommercialModelProviderStrategy =
  createNativeProviderStrategy({
    id: "elevenlabs",
    matches: (url) =>
      url.hostname.toLowerCase() === "api.elevenlabs.io" ||
      /\/v1\/(?:text-to-speech|text-to-voice)(?:\/|$)/i.test(url.pathname),
    canonicalHosts: new Set(["api.elevenlabs.io"]),
    discoverModelIds: discoverModels,
    parameterSchema: (role) =>
      role === "AUDIO_VOICE_DESIGN"
        ? VOICE_DESIGN_SCHEMA
        : role === "AUDIO_SPEECH"
          ? SPEECH_SCHEMA
          : null,
    validateAssignments: (assignments) => {
      validateNativeAudioRoles("ElevenLabs", assignments, [
        "AUDIO_SPEECH",
        "AUDIO_VOICE_DESIGN",
      ]);
      const invalid = assignments.find(
        (assignment) =>
          assignment.role === "AUDIO_VOICE_DESIGN" &&
          !VOICE_DESIGN_MODELS.has(assignment.modelId),
      );
      if (invalid) {
        throw new Error(
          "ElevenLabs 声线设计仅支持 eleven_multilingual_ttv_v2 或 eleven_ttv_v3",
        );
      }
    },
    request: (route, input, prepared) =>
      route.role.startsWith("AUDIO_")
        ? requestElevenLabs(route, input, prepared)
        : requestOpenAiCompatible(route, input, prepared),
  });

async function discoverModels(
  input: Parameters<CommercialModelProviderStrategy["discoverModelIds"]>[0],
): Promise<string[]> {
  const response = await input.fetchImpl(
    providerUrl(input.baseUrl, "/v1/models"),
    {
      headers: {
        Accept: "application/json",
        ...(input.apiKey ? { "xi-api-key": input.apiKey } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = await providerJson(response, input.providerName);
  if (!Array.isArray(payload)) {
    throw new Error(`${input.providerName} 模型目录必须是数组`);
  }
  return uniqueModelIds(
    payload.map((item, index) =>
      String(objectValue(item, `model[${index}]`).model_id ?? ""),
    ),
    input.providerName,
  );
}

async function requestElevenLabs(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  assertPost(input.method, "ElevenLabs");
  const payload = preparedJsonObject(prepared);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (route.apiKey) headers.set("xi-api-key", route.apiKey);
  if (route.role === "AUDIO_VOICE_DESIGN") {
    const prompt = requiredText(payload.voice_prompt, "ElevenLabs 声线描述");
    const preview = requiredText(payload.preview_text, "ElevenLabs 试听文本");
    if (
      prompt.length < 20 ||
      prompt.length > 1000 ||
      preview.length < 100 ||
      preview.length > 1000
    ) {
      throw new CommercialApiError(
        "ElevenLabs 声线描述需 20-1000 字，试听文本需 100-1000 字",
        { status: 422 },
      );
    }
    const url = providerUrl(route.baseUrl ?? "", "/v1/text-to-voice/design");
    url.searchParams.set("output_format", "mp3_44100_128");
    const response = await fetchProvider(route, url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        voice_description: prompt,
        model_id: route.modelId,
        text: preview,
      }),
      signal: input.signal,
    });
    if (!response.ok) return response;
    const root = objectValue(await response.json(), "ElevenLabs 声线设计响应");
    const previews = Array.isArray(root.previews) ? root.previews : [];
    const candidate = previews[0]
      ? objectValue(previews[0], "ElevenLabs 声线候选")
      : {};
    return base64AudioResponse(
      response,
      String(candidate.audio_base_64 ?? ""),
      String(candidate.media_type ?? "audio/mpeg"),
      String(candidate.generated_voice_id ?? ""),
      "ElevenLabs 声线设计",
    );
  }

  assertSpeechRole(route, "ElevenLabs");
  const voice = requiredText(payload.voice, "ElevenLabs Voice ID");
  const format = audioFormat(payload, ["mp3", "wav", "pcm", "opus"]);
  const url = providerUrl(
    route.baseUrl ?? "",
    `/v1/text-to-speech/${encodeURIComponent(voice)}`,
  );
  url.searchParams.set("output_format", outputFormat(format));
  const speed = numberValue(payload.speed);
  return fetchProvider(route, url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: requiredText(payload.input, "ElevenLabs 语音合成文本"),
      model_id: route.modelId,
      ...(speed === null ? {} : { voice_settings: { speed } }),
    }),
    signal: input.signal,
  });
}

function outputFormat(format: string): string {
  if (format === "wav") return "wav_44100";
  if (format === "pcm") return "pcm_24000";
  if (format === "opus") return "opus_48000_128";
  return "mp3_44100_128";
}
