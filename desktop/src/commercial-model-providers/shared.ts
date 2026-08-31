// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { CommercialApiError } from "../commercial-api-client.js";
import type { ModelRoute, PreparedBody } from "../commercial-model-route.js";
import { createRequiredRecord, createRequiredText } from "../value-validation.js";
import type {
  CommercialModelProviderStrategy,
  ProviderAssignment,
  ProviderDiscoveredModel,
  ProviderModelDiscoveryInput,
} from "./types.js";

type AudioRole =
  | "AUDIO_SPEECH"
  | "AUDIO_VOICE_CLONE"
  | "AUDIO_VOICE_DESIGN"
  | "AUDIO_MUSIC";

const AUDIO_ROLES = new Set<AudioRole>([
  "AUDIO_SPEECH",
  "AUDIO_VOICE_CLONE",
  "AUDIO_VOICE_DESIGN",
  "AUDIO_MUSIC",
]);
const MAX_MODEL_CATALOG_BYTES = 4 * 1024 * 1024;

export const objectValue = createRequiredRecord(
  (name) => new CommercialApiError(`${name} 必须是对象`, { status: 502 }),
);

export const requiredText = createRequiredText(
  (name) => new CommercialApiError(`${name}不能为空`, { status: 422 }),
);

export function createNativeProviderStrategy(
  input: Omit<
    CommercialModelProviderStrategy,
    "normalizeBaseUrl" | "parameterSchema"
  > & {
    canonicalHosts: ReadonlySet<string>;
    parameterSchema?: CommercialModelProviderStrategy["parameterSchema"];
  },
): CommercialModelProviderStrategy {
  return {
    ...input,
    normalizeBaseUrl: (url) =>
      input.canonicalHosts.has(url.hostname.toLowerCase())
        ? `${url.origin}/v1`
        : url.toString().replace(/\/+$/, ""),
    parameterSchema: input.parameterSchema ?? (() => null),
  };
}

export function normalizeOpenAiBaseUrl(url: URL): string {
  const baseUrl = url.toString().replace(/\/+$/, "");
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

export function validateNativeAudioRoles(
  providerName: string,
  assignments: readonly ProviderAssignment[],
  supported: readonly AudioRole[],
): void {
  const supportedRoles = new Set(supported);
  const invalid = assignments.find(
    (assignment) =>
      AUDIO_ROLES.has(assignment.role as AudioRole) &&
      !supportedRoles.has(assignment.role as AudioRole),
  );
  if (!invalid) return;
  const guidance =
    invalid.role === "AUDIO_VOICE_CLONE"
      ? "当前克隆流程需要单次请求内完成参考音频克隆与合成；该厂商原生接口是多阶段流程"
      : `${providerName} 不支持该音频用途`;
  throw new Error(`${providerName} 不能配置为 ${invalid.role}：${guidance}`);
}

export function assertSpeechRole(route: ModelRoute, providerName: string): void {
  if (route.role === "AUDIO_SPEECH") return;
  throw new CommercialApiError(`${providerName} 不支持当前音频用途 ${route.role}`, {
    status: 422,
  });
}

export function assertPost(method: string, providerName: string): void {
  if (method === "POST") return;
  throw new CommercialApiError(`${providerName} 接口仅支持 POST 请求`, {
    status: 405,
  });
}

export function preparedJsonObject(prepared: PreparedBody): Record<string, unknown> {
  if (typeof prepared.body !== "string") {
    throw new CommercialApiError("当前模型策略要求 JSON 请求体", { status: 400 });
  }
  try {
    return objectValue(JSON.parse(prepared.body) as unknown, "模型请求体");
  } catch (error) {
    if (error instanceof CommercialApiError) throw error;
    throw new CommercialApiError("模型请求体不是有效 JSON", { status: 400 });
  }
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function audioFormat(
  payload: Record<string, unknown>,
  supported: readonly string[],
): string {
  const format = stringValue(payload.response_format).toLowerCase() || "mp3";
  if (!supported.includes(format)) {
    throw new CommercialApiError(`当前声音策略不支持 ${format} 音频格式`, {
      status: 422,
    });
  }
  return format;
}

export function nativeJsonHeaders(
  route: ModelRoute,
  extra: Record<string, string> = {},
): Headers {
  const headers = new Headers({ "Content-Type": "application/json", ...extra });
  if (route.apiKey) headers.set("Authorization", `Bearer ${route.apiKey}`);
  return headers;
}

export function forwardedHeaders(
  source: IncomingMessage["headers"],
  contentType?: string,
): Headers {
  const headers = new Headers();
  if (source.accept) headers.set("Accept", String(source.accept));
  if (contentType) headers.set("Content-Type", contentType);
  if (source.range) headers.set("Range", String(source.range));
  if (source["anthropic-version"]) {
    headers.set("Anthropic-Version", String(source["anthropic-version"]));
  }
  if (source["anthropic-beta"]) {
    headers.set("Anthropic-Beta", String(source["anthropic-beta"]));
  }
  if (source["idempotency-key"]) {
    headers.set("Idempotency-Key", String(source["idempotency-key"]));
  }
  return headers;
}

export function providerUrl(baseUrl: string, pathname: string): URL {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export async function fetchProvider(
  route: ModelRoute,
  url: URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new CommercialApiError(
      `${route.label} 请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function providerJson(
  response: Response,
  providerName: string,
): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`${providerName} 模型目录请求失败 (${response.status})`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_MODEL_CATALOG_BYTES) {
    throw new Error(`${providerName} 模型目录响应过大`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_MODEL_CATALOG_BYTES) {
    throw new Error(`${providerName} 模型目录响应过大`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${providerName} 模型目录不是有效 JSON`);
  }
}

export function uniqueModelIds(
  values: readonly string[],
  providerName: string,
): string[] {
  const models = new Set<string>();
  values.forEach((value, index) => {
    const modelId = value.trim().replace(/^models\//, "");
    if (!modelId || modelId.length > 256) {
      throw new Error(`${providerName} model[${index}].id 无效`);
    }
    models.add(modelId);
  });
  return Array.from(models).sort((left, right) => left.localeCompare(right));
}

export function normalizeDiscoveredModelCatalog(
  discovered: readonly ProviderDiscoveredModel[],
  providerName: string,
): ProviderDiscoveredModel[] {
  const normalizedIds = uniqueModelIds(
    discovered.map((model) => model.id),
    providerName,
  );
  const byId = new Map(
    discovered.map((model) => [
      model.id.trim().replace(/^models\//, ""),
      model,
    ]),
  );
  return normalizedIds.map((id) => ({ ...byId.get(id), id }));
}

export async function discoverOpenAiCompatibleModels(
  input: ProviderModelDiscoveryInput,
): Promise<string[]> {
  return (await discoverOpenAiCompatibleModelCatalog(input)).map(
    (model) => model.id,
  );
}

export async function discoverOpenAiCompatibleModelCatalog(
  input: ProviderModelDiscoveryInput,
): Promise<ProviderDiscoveredModel[]> {
  const response = await input.fetchImpl(new URL("models", `${input.baseUrl}/`), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const root = objectValue(
    await providerJson(response, input.providerName),
    `${input.providerName} model catalog`,
  );
  const data = Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : null;
  if (!data) throw new Error(`${input.providerName} 模型目录缺少 data 数组`);
  const discovered = data.map((item, index) => {
    if (typeof item === "string") return { id: item };
    const model = objectValue(item, `model[${index}]`);
    return discoveredModelFromRecord(String(model.id ?? ""), model);
  });
  return normalizeDiscoveredModelCatalog(discovered, input.providerName);
}

export function discoveredModelFromRecord(
  id: string,
  model: Record<string, unknown>,
): ProviderDiscoveredModel {
  const metadata = optionalObject(model.metadata);
  const declaredCapabilities = optionalJsonObject(
    model.capabilities
      ?? model.capability
      ?? model.capability_json
      ?? model.capabilityJson
      ?? metadata?.capabilities
      ?? metadata?.capability,
  );
  const requestContract = optionalObject(declaredCapabilities?.request);
  const parameterSchema = optionalJsonObject(
    model.parameter_schema
      ?? model.parameterSchema
      ?? model.parameter_schema_json
      ?? model.parameterSchemaJson
      ?? model.input_schema
      ?? model.inputSchema
      ?? declaredCapabilities?.parameter_schema
      ?? declaredCapabilities?.parameterSchema
      ?? requestContract?.parameter_schema
      ?? requestContract?.parameterSchema
      ?? requestContract?.schema,
  );
  const capabilities = normalizedDiscoveredCapabilities(
    model,
    declaredCapabilities,
  );
  const properties = optionalObject(parameterSchema?.properties);
  const reasoning = reasoningMetadata(
    model.reasoning_effort
      ?? model.reasoningEffort
      ?? model.supported_reasoning_efforts
      ?? model.reasoning_efforts
      ?? capabilities?.reasoning_effort
      ?? capabilities?.reasoningEffort
      ?? properties?.reasoning_effort
      ?? properties?.reasoningEffort,
  );
  const declaredDefault = stringValue(
    model.default_reasoning_effort
      ?? model.defaultReasoningEffort
      ?? capabilities?.default_reasoning_effort
      ?? capabilities?.defaultReasoningEffort,
  );
  const defaultReasoningEffort = reasoning.options.includes(declaredDefault)
    ? declaredDefault
    : reasoning.defaultValue;
  const contextWindow = firstPositiveInteger(
    model.max_model_len,
    model.maxModelLen,
    model.context_window,
    model.contextWindow,
    model.context_window_tokens,
    model.contextWindowTokens,
    model.context_length,
    model.contextLength,
    model.input_token_limit,
    model.inputTokenLimit,
    capabilities?.max_model_len,
    capabilities?.maxModelLen,
    capabilities?.context_window,
    capabilities?.contextWindow,
    capabilities?.context_window_tokens,
    capabilities?.contextWindowTokens,
    capabilities?.context_length,
    capabilities?.contextLength,
    capabilities?.input_token_limit,
    capabilities?.inputTokenLimit,
  );
  const maxOutputTokens = firstPositiveInteger(
    model.max_output_tokens,
    model.maxOutputTokens,
    model.output_token_limit,
    model.outputTokenLimit,
    model.max_completion_tokens,
    model.maxCompletionTokens,
    capabilities?.max_output_tokens,
    capabilities?.maxOutputTokens,
    capabilities?.output_token_limit,
    capabilities?.outputTokenLimit,
    capabilities?.max_completion_tokens,
    capabilities?.maxCompletionTokens,
  );
  return {
    id,
    ...(capabilities ? { capabilities } : {}),
    ...(parameterSchema && Object.keys(parameterSchema).length > 0
      ? { parameterSchema }
      : {}),
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(reasoning.options.length === 0
      ? {}
      : {
          reasoningEfforts: reasoning.options,
          ...(defaultReasoningEffort
            ? { defaultReasoningEffort }
            : {}),
        }),
  };
}

function normalizedDiscoveredCapabilities(
  model: Record<string, unknown>,
  declared: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const generation = optionalObject(declared?.generation);
  const operation = stringValue(
    model.operation
      ?? model.model_operation
      ?? model.modelOperation
      ?? declared?.operation,
  ).toUpperCase();
  const supportedModes = uniqueStringValues(
    model.supported_modes,
    model.supportedModes,
    declared?.supported_modes,
    declared?.supportedModes,
    declared?.modes,
    generation?.supported_modes,
    generation?.supportedModes,
    generation?.modes,
  );
  const supportedRoles = Array.from(new Set(
    uniqueStringValues(
      model.supported_roles,
      model.supportedRoles,
      model.model_roles,
      model.modelRoles,
      declared?.supported_roles,
      declared?.supportedRoles,
      declared?.model_roles,
      declared?.modelRoles,
    ).map((role) => role.toUpperCase()),
  ));
  const resolutionOptions = uniqueStringValues(
    model.resolution_options,
    model.resolutionOptions,
    model.resolutions,
    declared?.resolution_options,
    declared?.resolutionOptions,
    declared?.resolutions,
    generation?.resolution_options,
    generation?.resolutionOptions,
    generation?.resolutions,
  );
  const sizeOptions = uniqueStringValues(
    model.size_options,
    model.sizeOptions,
    model.image_sizes,
    model.imageSizes,
    model.sizes,
    declared?.size_options,
    declared?.sizeOptions,
    declared?.image_sizes,
    declared?.imageSizes,
    generation?.size_options,
    generation?.sizeOptions,
    generation?.image_sizes,
    generation?.imageSizes,
  );
  const ratioOptions = uniqueStringValues(
    model.ratio_options,
    model.ratioOptions,
    model.aspect_ratio_options,
    model.aspectRatioOptions,
    model.aspect_ratios,
    model.aspectRatios,
    declared?.ratio_options,
    declared?.ratioOptions,
    declared?.aspect_ratio_options,
    declared?.aspectRatioOptions,
    declared?.aspect_ratios,
    declared?.aspectRatios,
    generation?.ratio_options,
    generation?.ratioOptions,
    generation?.aspectRatioOptions,
    generation?.aspectRatios,
  );
  const durationOptions = uniquePositiveNumbers(
    model.duration_options,
    model.durationOptions,
    model.seconds_options,
    model.secondsOptions,
    declared?.duration_options,
    declared?.durationOptions,
    declared?.seconds_options,
    declared?.secondsOptions,
    generation?.duration_options,
    generation?.durationOptions,
    generation?.seconds_options,
    generation?.secondsOptions,
  );
  const minDuration = firstPositiveNumber(
    model.min_duration,
    model.minDuration,
    model.min_seconds,
    model.minSeconds,
    declared?.min_duration,
    declared?.minDuration,
    declared?.min_seconds,
    declared?.minSeconds,
    generation?.min_duration,
    generation?.minDuration,
    generation?.min_seconds,
    generation?.minSeconds,
  );
  const maxDuration = firstPositiveNumber(
    model.max_duration,
    model.maxDuration,
    model.max_seconds,
    model.maxSeconds,
    declared?.max_duration,
    declared?.maxDuration,
    declared?.max_seconds,
    declared?.maxSeconds,
    generation?.max_duration,
    generation?.maxDuration,
    generation?.max_seconds,
    generation?.maxSeconds,
  );
  const supportsGenerateAudio = firstBoolean(
    model.supports_generate_audio,
    model.supportsGenerateAudio,
    declared?.supports_generate_audio,
    declared?.supportsGenerateAudio,
    generation?.supports_generate_audio,
    generation?.supportsGenerateAudio,
  );
  const supportsHumanReview = firstBoolean(
    model.supports_human_review,
    model.supportsHumanReview,
    declared?.supports_human_review,
    declared?.supportsHumanReview,
    generation?.supports_human_review,
    generation?.supportsHumanReview,
  );
  const normalized: Record<string, unknown> = {
    ...(declared ?? {}),
    ...(operation ? { operation } : {}),
    ...(supportedModes.length ? { supportedModes } : {}),
    ...(supportedRoles.length ? { supportedRoles } : {}),
    ...(resolutionOptions.length ? { resolutionOptions } : {}),
    ...(sizeOptions.length ? { sizeOptions } : {}),
    ...(ratioOptions.length ? { ratioOptions, aspectRatios: ratioOptions } : {}),
    ...(durationOptions.length ? { durationOptions } : {}),
    ...(minDuration === undefined ? {} : { minDuration }),
    ...(maxDuration === undefined ? {} : { maxDuration }),
    ...(supportsGenerateAudio === undefined ? {} : { supportsGenerateAudio }),
    ...(supportsHumanReview === undefined ? {} : { supportsHumanReview }),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

function uniqueStringValues(...values: unknown[]): string[] {
  return Array.from(new Set(
    values.flatMap((value) => (
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    )),
  ));
}

function uniquePositiveNumbers(...values: unknown[]): number[] {
  return Array.from(new Set(
    values.flatMap((value) => (
      Array.isArray(value)
        ? value.filter(
            (item): item is number =>
              typeof item === "number" && Number.isFinite(item) && item > 0,
          )
        : []
    )),
  ));
}

function firstPositiveNumber(...values: unknown[]): number | undefined {
  return values.find(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === "boolean");
}

function reasoningMetadata(value: unknown): {
  options: string[];
  defaultValue?: string;
} {
  const schema = optionalObject(value);
  const rawOptions = Array.isArray(value)
    ? value
    : Array.isArray(schema?.enum)
      ? schema.enum
      : Array.isArray(schema?.options)
        ? schema.options
        : [];
  const options = Array.from(new Set(
    rawOptions
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  ));
  const defaultValue = typeof schema?.default === "string"
    ? schema.default.trim()
    : typeof schema?.defaultValue === "string"
      ? schema.defaultValue.trim()
      : "";
  return {
    options,
    ...(defaultValue && options.includes(defaultValue) ? { defaultValue } : {}),
  };
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function optionalJsonObject(value: unknown): Record<string, unknown> | undefined {
  const direct = optionalObject(value);
  if (direct) return direct;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return optionalObject(JSON.parse(value) as unknown);
  } catch {
    return undefined;
  }
}

function firstPositiveInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

export function base64AudioResponse(
  source: Response,
  encoded: string,
  mediaType: string,
  voiceId: string,
  providerName: string,
): Response {
  const normalized = encoded.trim();
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new CommercialApiError(`${providerName}响应缺少有效音频`, { status: 502 });
  }
  return binaryAudioResponse(
    source,
    Buffer.from(normalized, "base64"),
    mediaType,
    voiceId,
    providerName,
  );
}

export function hexAudioResponse(
  source: Response,
  encoded: string,
  mediaType: string,
  voiceId: string,
  providerName: string,
): Response {
  const normalized = encoded.trim();
  if (!normalized || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
    throw new CommercialApiError(`${providerName}响应缺少有效音频`, { status: 502 });
  }
  return binaryAudioResponse(
    source,
    Buffer.from(normalized, "hex"),
    mediaType,
    voiceId,
    providerName,
  );
}

function binaryAudioResponse(
  source: Response,
  audio: Buffer,
  mediaType: string,
  voiceId: string,
  providerName: string,
): Response {
  if (audio.byteLength === 0) {
    throw new CommercialApiError(`${providerName}返回了空音频`, { status: 502 });
  }
  const headers = new Headers(source.headers);
  headers.set("Content-Type", mediaType || "application/octet-stream");
  headers.set("Content-Length", String(audio.byteLength));
  headers.delete("Content-Encoding");
  if (voiceId.trim()) headers.set("X-Voice-Id", voiceId.trim());
  return new Response(audio as unknown as BodyInit, { status: 200, headers });
}

export function mediaTypeForFormat(format: string): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "wav") return "audio/wav";
  if (format === "flac") return "audio/flac";
  if (format === "opus") return "audio/ogg";
  return "application/octet-stream";
}

export function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((partValue) => objectValue(partValue, "OpenAI content part"))
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("\n");
}

export function parseJsonArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new CommercialApiError("工具参数不是有效 JSON", { status: 400 });
  }
}

export function positiveNumberOrFallback(value: unknown, fallback: number): number {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function translateEventStream(
  source: Response,
  translate: (eventName: string, data: string) => string[],
  finish: () => string[],
): Response {
  if (!source.body) {
    throw new CommercialApiError("模型流式响应缺少正文", { status: 502 });
  }
  const reader = source.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (chunks: readonly string[]) => {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      };
      const drain = (final: boolean) => {
        while (true) {
          const boundary = /\r?\n\r?\n/.exec(buffer);
          if (!boundary) break;
          const block = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const parsed = parseServerSentEvent(block);
          if (parsed) emit(translate(parsed.eventName, parsed.data));
        }
        if (final && buffer.trim()) {
          const parsed = parseServerSentEvent(buffer);
          buffer = "";
          if (parsed) emit(translate(parsed.eventName, parsed.data));
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          drain(false);
        }
        buffer += decoder.decode();
        drain(true);
        emit(finish());
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  for (const name of ["x-request-id", "request-id"]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(body, { status: source.status, headers });
}

function parseServerSentEvent(
  block: string,
): { eventName: string; data: string } | null {
  let eventName = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length > 0 ? { eventName, data: data.join("\n") } : null;
}

export function parseEventPayload(data: string, name: string): Record<string, unknown> {
  try {
    return objectValue(JSON.parse(data) as unknown, name);
  } catch (error) {
    if (error instanceof CommercialApiError) throw error;
    throw new CommercialApiError(`${name} 不是有效 JSON`, { status: 502 });
  }
}

export function openAiEventChunk(
  id: string,
  model: string,
  delta: Record<string, unknown>,
  finishReason: string | null = null,
): string {
  return `data: ${JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

export function jsonResponseLike(source: Response, payload: unknown): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  for (const name of ["x-request-id", "request-id"]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(payload), { status: source.status, headers });
}

export function generatedCompletionId(): string {
  return `chatcmpl-${randomUUID()}`;
}
