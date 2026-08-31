// Copyright (c) 2026 AI anime

import { CommercialApiError } from "../commercial-api-client.js";
import type { CommercialModelProviderStrategy } from "./types.js";
import { requestOpenAiCompatible } from "./openai-compatible.js";
import {
  assertPost,
  audioFormat,
  base64AudioResponse,
  discoverOpenAiCompatibleModelCatalog,
  discoverOpenAiCompatibleModels,
  fetchProvider,
  mediaTypeForFormat,
  nativeJsonHeaders,
  normalizeOpenAiBaseUrl,
  objectValue,
  preparedJsonObject,
  providerUrl,
  requiredText,
  stringValue,
} from "./shared.js";

const QWEN_AUDIO_VOICE_DESIGN_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    voice_prompt: { type: "string", minLength: 1, maxLength: 500 },
    preview_text: { type: "string", minLength: 15, maxLength: 200 },
    preferred_name: {
      type: "string",
      pattern: "^[A-Za-z0-9]{1,10}$",
      default: "aivoice",
      maxLength: 10,
    },
    language: {
      type: "string",
      enum: ["zh", "en"],
      default: "zh",
    },
    sample_rate: {
      type: "integer",
      enum: [16000, 24000, 48000],
      default: 24000,
    },
    response_format: {
      type: "string",
      enum: ["wav", "mp3"],
      default: "wav",
    },
  },
});

const QWEN_AUDIO_SAMPLE_RATES = new Set([16000, 24000, 48000]);
const TOKEN_PLAN_HOSTS = new Set([
  "token-plan.cn-beijing.maas.aliyuncs.com",
]);

const TOKEN_PLAN_AUDIO_ERROR =
  "阿里云 Token Plan 仅限交互式 AI 工具的文本生成，不能配置为音频、图像或视频用途；请改用百炼通用 API Key 和业务空间 Base URL";

export const aliyunTokenPlanProviderStrategy: CommercialModelProviderStrategy = {
  id: "aliyun-token-plan",
  matches: (url) => TOKEN_PLAN_HOSTS.has(url.hostname.toLowerCase()),
  normalizeBaseUrl: normalizeOpenAiBaseUrl,
  discoverModelIds: discoverOpenAiCompatibleModels,
  discoverModels: discoverOpenAiCompatibleModelCatalog,
  parameterSchema: () => null,
  validateInputAssignments: assertTokenPlanAssignments,
  validateAssignments: assertTokenPlanAssignments,
  request: (route, input, prepared) => {
    if (route.role !== "TEXT") {
      throw new CommercialApiError(TOKEN_PLAN_AUDIO_ERROR, { status: 422 });
    }
    return requestOpenAiCompatible(route, input, prepared);
  },
};

export const aliyunModelStudioProviderStrategy: CommercialModelProviderStrategy = {
  id: "aliyun-model-studio",
  matches: (url) =>
    (!TOKEN_PLAN_HOSTS.has(url.hostname.toLowerCase()) &&
      url.hostname.toLowerCase().endsWith(".maas.aliyuncs.com")) ||
    ["dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"].includes(
      url.hostname.toLowerCase(),
    ) ||
    /\/compatible-mode\/v1\/?$/i.test(url.pathname),
  normalizeBaseUrl: normalizeOpenAiBaseUrl,
  discoverModelIds: discoverOpenAiCompatibleModels,
  discoverModels: discoverOpenAiCompatibleModelCatalog,
  parameterSchema: (role, modelId) =>
    role === "AUDIO_VOICE_DESIGN" && isQwenAudioTtsModel(modelId)
      ? QWEN_AUDIO_VOICE_DESIGN_SCHEMA
      : null,
  validateAssignments: () => undefined,
  request: (route, input, prepared) =>
    route.role === "AUDIO_VOICE_DESIGN" && isQwenAudioTtsModel(route.modelId)
      ? requestQwenAudioVoiceDesign(route, input, prepared)
      : requestOpenAiCompatible(route, input, prepared),
};

async function requestQwenAudioVoiceDesign(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  assertPost(input.method, "阿里云百炼声音设计");
  const payload = preparedJsonObject(prepared);
  const prompt = requiredText(payload.voice_prompt, "声音描述");
  const preview = requiredText(payload.preview_text, "试听文本");
  if (prompt.length > 500 || preview.length < 15 || preview.length > 200) {
    throw new CommercialApiError(
      "Qwen-Audio 声音描述最多 500 字，试听文本需为 15 至 200 字",
      { status: 422 },
    );
  }

  const language = stringValue(payload.language) || "zh";
  if (language !== "zh" && language !== "en") {
    throw new CommercialApiError("Qwen-Audio 声音设计仅支持中文或英文", {
      status: 422,
    });
  }
  const sampleRate = Number(payload.sample_rate ?? 24000);
  if (!QWEN_AUDIO_SAMPLE_RATES.has(sampleRate)) {
    throw new CommercialApiError(
      "Qwen-Audio 声音设计采样率仅支持 16000、24000 或 48000",
      { status: 422 },
    );
  }
  const format = audioFormat(payload, ["wav", "mp3"]);
  const response = await fetchProvider(
    route,
    providerUrl(
      route.baseUrl ?? "",
      "/api/v1/services/audio/tts/customization",
    ),
    {
      method: "POST",
      headers: nativeJsonHeaders(route, { Accept: "application/json" }),
      body: JSON.stringify({
        model: "voice-enrollment",
        input: {
          action: "create_voice",
          target_model: route.modelId,
          voice_prompt: prompt,
          preview_text: preview,
          prefix: voicePrefix(payload.preferred_name),
          language_hints: [language],
        },
        parameters: {
          sample_rate: sampleRate,
          response_format: format,
        },
      }),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;

  const root = objectValue(await response.json(), "阿里云百炼声音设计响应");
  const output = objectValue(root.output ?? {}, "阿里云百炼声音设计 output");
  const previewAudio = objectValue(
    output.preview_audio ?? {},
    "阿里云百炼声音设计 preview_audio",
  );
  const responseFormat = stringValue(previewAudio.response_format) || format;
  const source = responseWithRequestId(response, stringValue(root.request_id));
  return base64AudioResponse(
    source,
    String(previewAudio.data ?? ""),
    mediaTypeForFormat(responseFormat),
    String(output.voice_id ?? output.voice ?? ""),
    "阿里云百炼声音设计",
  );
}

function isQwenAudioTtsModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return normalized.startsWith("qwen-audio-") && normalized.includes("-tts-");
}

function voicePrefix(value: unknown): string {
  return stringValue(value).replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "aivoice";
}

function responseWithRequestId(source: Response, requestId: string): Response {
  if (!requestId || source.headers.has("x-request-id")) return source;
  const headers = new Headers(source.headers);
  headers.set("X-Request-Id", requestId);
  return new Response(null, {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
}

function assertTokenPlanAssignments(
  assignments: readonly { role: string }[],
): void {
  if (assignments.every((assignment) => assignment.role === "TEXT")) return;
  throw new Error(TOKEN_PLAN_AUDIO_ERROR);
}
