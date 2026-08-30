// Copyright (c) 2026 AI anime

import type { CommercialModelProviderStrategy } from "./types.js";
import { requestOpenAiCompatible } from "./openai-compatible.js";
import {
  assertPost,
  assertSpeechRole,
  audioFormat,
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

const SPEECH_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    response_format: {
      type: "string",
      enum: ["mp3", "wav", "flac", "opus", "pcm"],
      default: "mp3",
    },
  },
});

export const deepgramProviderStrategy: CommercialModelProviderStrategy =
  createNativeProviderStrategy({
    id: "deepgram",
    matches: (url) =>
      url.hostname.toLowerCase() === "api.deepgram.com" ||
      /\/v[12]\/speak\/?$/i.test(url.pathname),
    canonicalHosts: new Set(["api.deepgram.com"]),
    discoverModelIds: discoverModels,
    parameterSchema: (role) =>
      role === "AUDIO_SPEECH" ? SPEECH_SCHEMA : null,
    validateAssignments: (assignments) =>
      validateNativeAudioRoles("Deepgram", assignments, ["AUDIO_SPEECH"]),
    request: (route, input, prepared) =>
      route.role.startsWith("AUDIO_")
        ? requestDeepgram(route, input, prepared)
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
        ...(input.apiKey ? { Authorization: `Token ${input.apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = objectValue(
    await providerJson(response, input.providerName),
    "Deepgram model catalog",
  );
  const tts = Array.isArray(payload.tts) ? payload.tts : [];
  const ids = tts.flatMap((item, index) => {
    const model = objectValue(item, `tts model[${index}]`);
    const id = String(
      model.canonical_name ?? model.name ?? model.id ?? "",
    ).trim();
    return id ? [id] : [];
  });
  return uniqueModelIds(ids, input.providerName);
}

async function requestDeepgram(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  assertPost(input.method, "Deepgram");
  assertSpeechRole(route, "Deepgram");
  const payload = preparedJsonObject(prepared);
  const format = audioFormat(payload, ["mp3", "wav", "flac", "opus", "pcm"]);
  const version = route.modelId.startsWith("flux-") ? "v2" : "v1";
  const url = providerUrl(route.baseUrl ?? "", `/${version}/speak`);
  url.searchParams.set("model", route.modelId);
  const speed = numberValue(payload.speed);
  if (speed !== null) url.searchParams.set("speed", String(speed));
  configureFormat(url, format);
  const headers = new Headers({
    "Content-Type": "application/json",
    Accept: "audio/*",
  });
  if (route.apiKey) headers.set("Authorization", `Token ${route.apiKey}`);
  return fetchProvider(route, url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: requiredText(payload.input, "Deepgram 语音合成文本"),
    }),
    signal: input.signal,
  });
}

function configureFormat(url: URL, format: string): void {
  if (format === "wav") {
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("container", "wav");
    return;
  }
  if (format === "pcm") {
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("container", "none");
    return;
  }
  url.searchParams.set("encoding", format);
}
