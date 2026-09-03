// Copyright (c) 2026 AI anime

import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import {
  BYOK_MODEL_ROLES,
  type ByokModelRole,
} from "./commercial-model-access.js";
import { CommercialApiError } from "./commercial-api-client.js";
import type { ModelRoute, PreparedBody } from "./commercial-model-route.js";

const MAX_MODEL_JSON_BODY_BYTES = 4 * 1024 * 1024;
const MAX_MODEL_MULTIPART_BODY_BYTES = 108 * 1024 * 1024;
const FALLBACK_STATUSES = new Set([401, 403, 404, 408, 409, 425, 429, 500, 502, 503, 504]);
const BYOK_CONFIGURATION_ERROR_STATUSES = new Set([401, 403, 404]);
const FORBIDDEN_MODEL_FIELDS = new Set([
  "apikey",
  "baseurl",
  "authorization",
  "headers",
  "xapikey",
  "xgoogapikey",
]);
const CLOUD_VIDEO_CORE_TEXT_FIELDS = new Set([
  "model",
  "prompt",
  "mode",
  "generation_mode",
  "seconds",
  "duration",
  "size",
  "resolution",
  "ratio",
  "aspect_ratio",
  "generate_audio",
  "reference_video_duration",
  "reference_audio_duration",
]);
const CLOUD_VIDEO_MEDIA_FIELD_ALIASES = new Map([
  ["reference_images", "reference_image"],
  ["reference_images[]", "reference_image"],
  ["reference_videos", "reference_video"],
  ["reference_videos[]", "reference_video"],
  ["reference_audios", "reference_audio"],
  ["reference_audios[]", "reference_audio"],
]);
const ASSISTANT_ROUTE_MODEL_PREFIX = "ai-anime-route:";
const ASSISTANT_AUTOMATIC_MODEL_ID = "ai-anime-assistant-auto";
const ASSISTANT_REASONING_EFFORT_MARKER = ":reasoning-effort:";
const MODEL_SELECTOR_MAX_LENGTH = 768;
const MODEL_SELECTOR_PREFIXES = ["cloud:", "byok:"] as const;

export interface AssistantModelSelection {
  selector: string | null;
  reasoningEffort: string | null;
}

export async function prepareBodyForRoute(
  rawBody: Buffer | undefined,
  contentType: string,
  modelId: string,
  cloudVideo: boolean,
  reasoningEffort?: string | null,
  maxOutputTokens?: number,
  allowedVideoExtraParameters: readonly string[] = [],
  parameterOverrides?: Readonly<Record<string, unknown>>,
): Promise<PreparedBody> {
  if (rawBody === undefined) return {};
  const normalized = contentType.trim().toLowerCase();
  if (normalized.startsWith("application/json")) {
    const payload = parseJsonBody(rawBody);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const routedPayload = cloudVideo
        ? Object.fromEntries(
            Object.entries(payload).filter(([key]) => {
              const normalizedKey = key.toLowerCase();
              return (
                CLOUD_VIDEO_CORE_TEXT_FIELDS.has(normalizedKey) ||
                allowedVideoExtraParameters.includes(key)
              );
            }),
          )
        : payload;
      const overriddenPayload = mergeParameterOverrides(
        routedPayload,
        filterParameterOverrides(
          parameterOverrides,
          cloudVideo,
          allowedVideoExtraParameters,
        ),
      );
      const outputTokenField = Object.hasOwn(overriddenPayload, "max_completion_tokens")
        ? "max_completion_tokens"
        : "max_tokens";
      return {
        body: JSON.stringify({
          ...overriddenPayload,
          model: modelId,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          ...(maxOutputTokens
            ? { [outputTokenField]: maxOutputTokens }
            : {}),
        }),
        contentType: contentType || "application/json",
      };
    }
  }
  if (normalized.startsWith("multipart/form-data")) {
    const source = await parseMultipartBody(rawBody, contentType);
    const target = new FormData();
    source.forEach((value, key) => {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey === "model") return;
      if (typeof value === "string") {
        if (
          cloudVideo &&
          !CLOUD_VIDEO_CORE_TEXT_FIELDS.has(normalizedKey) &&
          !allowedVideoExtraParameters.includes(key)
        ) {
          return;
        }
        target.append(key, value);
        return;
      }
      const targetKey = cloudVideo
        ? (CLOUD_VIDEO_MEDIA_FIELD_ALIASES.get(normalizedKey) ?? key)
        : key;
      target.append(targetKey, value, value.name);
    });
    for (const [key, value] of Object.entries(filterParameterOverrides(
      parameterOverrides,
      cloudVideo,
      allowedVideoExtraParameters,
    ))) {
      const serialized = multipartParameterOverride(value);
      if (serialized !== undefined) target.set(key, serialized);
    }
    target.set("model", modelId);
    return { body: target };
  }
  return {
    body: rawBody as unknown as BodyInit,
    ...(contentType ? { contentType } : {}),
  };
}

function filterParameterOverrides(
  overrides: Readonly<Record<string, unknown>> | undefined,
  cloudVideo: boolean,
  allowedVideoExtraParameters: readonly string[],
): Readonly<Record<string, unknown>> {
  if (!overrides) return {};
  if (!cloudVideo) return overrides;
  return Object.fromEntries(
    Object.entries(overrides).filter(([key]) => (
      CLOUD_VIDEO_CORE_TEXT_FIELDS.has(key.toLowerCase())
      || allowedVideoExtraParameters.includes(key)
    )),
  );
}

function mergeParameterOverrides(
  payload: Record<string, unknown>,
  overrides: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...payload };
  for (const [key, value] of Object.entries(overrides)) {
    const current = plainRecord(merged[key]);
    const replacement = plainRecord(value);
    merged[key] = current && replacement
      ? mergeParameterOverrides(current, replacement)
      : cloneParameterOverride(value);
  }
  return merged;
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function cloneParameterOverride(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneParameterOverride);
  const record = plainRecord(value);
  return record
    ? Object.fromEntries(
        Object.entries(record).map(([key, item]) => [key, cloneParameterOverride(item)]),
      )
    : value;
}

function multipartParameterOverride(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  return JSON.stringify(value);
}

export function isVideoCreatePath(path: string): boolean {
  return new URL(path, "http://model-proxy.local").pathname === "/v1/videos";
}

export async function modelRequestFingerprint(
  method: string,
  path: string,
  contentType: string,
  body: Buffer | undefined,
  metadata: Record<string, string>,
): Promise<string> {
  const hash = createHash("sha256");
  hash.update(method.toUpperCase());
  hash.update("\0");
  hash.update(new URL(path, "http://model-proxy.local").pathname);
  for (const [key, value] of Object.entries(metadata).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    hash.update("\0");
    hash.update(key);
    hash.update("=");
    hash.update(value);
  }
  if (!body) return hash.digest("hex");

  const normalizedContentType = contentType.trim().toLowerCase();
  if (normalizedContentType.startsWith("application/json")) {
    hash.update("\0json\0");
    hash.update(stableJson(parseJsonBody(body)));
    return hash.digest("hex");
  }
  if (normalizedContentType.startsWith("multipart/form-data")) {
    const form = await parseMultipartBody(body, contentType);
    const values = new Map<string, FormDataEntryValue[]>();
    form.forEach((value, key) => {
      const entries = values.get(key) ?? [];
      entries.push(value);
      values.set(key, entries);
    });
    for (const key of [...values.keys()].sort()) {
      for (const value of values.get(key) ?? []) {
        hash.update("\0field\0");
        hash.update(key);
        if (typeof value === "string") {
          hash.update("\0text\0");
          hash.update(value);
          continue;
        }
        hash.update("\0file\0");
        hash.update(value.name);
        hash.update("\0");
        hash.update(value.type);
        hash.update("\0");
        hash.update(Buffer.from(await value.arrayBuffer()));
      }
    }
    return hash.digest("hex");
  }
  hash.update("\0raw\0");
  hash.update(body);
  return hash.digest("hex");
}

export async function readModelRequestBody(
  request: IncomingMessage,
  contentType: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const normalized = contentType.trim().toLowerCase();
  const multipart = normalized.startsWith("multipart/form-data");
  const limit = multipart
    ? MAX_MODEL_MULTIPART_BODY_BYTES
    : MAX_MODEL_JSON_BODY_BYTES;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > limit) {
      throw new CommercialApiError(
        multipart
          ? "模型 multipart 请求体超过 108 MiB"
          : "模型请求体超过 4 MiB",
        { status: 413 },
      );
    }
    chunks.push(bytes);
  }
  const body = Buffer.concat(chunks);
  if (normalized.startsWith("application/json")) {
    assertFieldsAllowed(parseJsonBody(body));
  } else if (normalized.startsWith("multipart/form-data")) {
    const form = await parseMultipartBody(body, contentType);
    let forbiddenField: string | null = null;
    form.forEach((_value, key) => {
      if (forbiddenField === null && isForbiddenModelField(key)) {
        forbiddenField = key;
      }
    });
    if (forbiddenField) {
      throw new CommercialApiError(`模型请求禁止字段 ${forbiddenField}`, {
        status: 400,
      });
    }
  }
  return body;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function parseJsonBody(body: Buffer): Record<string, unknown> | unknown[] | null {
  try {
    return JSON.parse(body.toString("utf8")) as Record<string, unknown> | unknown[] | null;
  } catch {
    throw new CommercialApiError("模型请求体不是有效 JSON", { status: 400 });
  }
}

function assertFieldsAllowed(payload: unknown): void {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  for (const key of Object.keys(payload)) {
    if (isForbiddenModelField(key)) {
      throw new CommercialApiError(`模型请求禁止字段 ${key}`, { status: 400 });
    }
  }
}

async function parseMultipartBody(
  body: Buffer,
  contentType: string,
): Promise<FormData> {
  try {
    return await new Request("http://model-proxy.local", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: body as unknown as BodyInit,
    }).formData();
  } catch {
    throw new CommercialApiError("模型 multipart 请求体无效", { status: 400 });
  }
}

export function normalizeRoleHeader(value: string | string[] | undefined): ByokModelRole | null {
  const normalized = Array.isArray(value) ? value[0]?.trim().toUpperCase() : value?.trim().toUpperCase();
  if (!normalized) return null;
  if (!(BYOK_MODEL_ROLES as readonly string[]).includes(normalized)) {
    throw new CommercialApiError("模型用途标头无效", { status: 400 });
  }
  return normalized as ByokModelRole;
}

export function normalizeModelSelectorHeader(
  value: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw ?? "").trim();
  if (!normalized) return null;
  if (
    normalized.length > MODEL_SELECTOR_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    !MODEL_SELECTOR_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  ) {
    throw new CommercialApiError("模型路由选择器无效", { status: 422 });
  }
  return normalized;
}

export function isCloudModelSelector(value: string): boolean {
  return value.startsWith(MODEL_SELECTOR_PREFIXES[0]);
}

export function assistantModelSelectorFromBody(
  rawBody: Buffer | undefined,
  contentType: string,
  requestSurface: string | string[] | undefined,
): string | null {
  return assistantModelSelectionFromBody(
    rawBody,
    contentType,
    requestSurface,
  )?.selector ?? null;
}

export function assistantModelSelectionFromBody(
  rawBody: Buffer | undefined,
  contentType: string,
  requestSurface: string | string[] | undefined,
): AssistantModelSelection | null {
  const surface = Array.isArray(requestSurface) ? requestSurface[0] : requestSurface;
  if (String(surface ?? "").trim().toLowerCase() !== "ai-assistant") return null;
  if (!rawBody || !contentType.trim().toLowerCase().startsWith("application/json")) {
    return null;
  }
  const payload = parseJsonBody(rawBody);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const model = typeof payload.model === "string" ? payload.model.trim() : "";
  const marker = model.indexOf(ASSISTANT_ROUTE_MODEL_PREFIX);
  let selector: string | null = null;
  let encodedEffort = "";
  if (marker >= 0) {
    const encodedAndSuffix = model.slice(
      marker + ASSISTANT_ROUTE_MODEL_PREFIX.length,
    );
    const effortMarker = encodedAndSuffix.indexOf(
      ASSISTANT_REASONING_EFFORT_MARKER,
    );
    const encodedSelector = effortMarker < 0
      ? encodedAndSuffix
      : encodedAndSuffix.slice(0, effortMarker);
    encodedEffort = effortMarker < 0
      ? ""
      : encodedAndSuffix.slice(
          effortMarker + ASSISTANT_REASONING_EFFORT_MARKER.length,
        );
    selector = normalizeModelSelectorHeader(
      decodeAssistantModelToken(encodedSelector, "当前对话模型路由无效"),
    );
  } else {
    const automaticMarker = model.indexOf(ASSISTANT_AUTOMATIC_MODEL_ID);
    if (automaticMarker < 0) return null;
    const suffix = model.slice(automaticMarker + ASSISTANT_AUTOMATIC_MODEL_ID.length);
    if (suffix && !suffix.startsWith(ASSISTANT_REASONING_EFFORT_MARKER)) {
      throw new CommercialApiError("当前对话模型路由无效", { status: 422 });
    }
    encodedEffort = suffix
      ? suffix.slice(ASSISTANT_REASONING_EFFORT_MARKER.length)
      : "";
  }
  const reasoningEffort = encodedEffort
    ? decodeAssistantModelToken(encodedEffort, "当前对话思考力度无效")
    : null;
  if (
    reasoningEffort
    && (reasoningEffort.length > 64 || /[\u0000-\u001f\u007f]/u.test(reasoningEffort))
  ) {
    throw new CommercialApiError("当前对话思考力度无效", { status: 422 });
  }
  return { selector, reasoningEffort };
}

function decodeAssistantModelToken(encoded: string, message: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    throw new CommercialApiError(message, { status: 422 });
  }
  try {
    return Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    throw new CommercialApiError(message, { status: 422 });
  }
}

export function inferModelRole(path: string): ByokModelRole | null {
  const pathname = new URL(path, "http://model-proxy.local").pathname.toLowerCase();
  if (pathname.endsWith("/embeddings")) return "EMBEDDING";
  if (pathname.endsWith("/images/generations")) return "IMAGE_GENERATION";
  if (pathname.endsWith("/images/edits")) return "IMAGE_EDIT";
  if (pathname.endsWith("/audio/music/generations")) return "AUDIO_MUSIC";
  if (pathname.endsWith("/audio/speech")) return "AUDIO_SPEECH";
  if (pathname.startsWith("/v1/videos")) return "VIDEO_TEXT_TO_VIDEO";
  if (
    pathname.endsWith("/chat/completions") ||
    pathname.endsWith("/responses") ||
    pathname.endsWith("/messages") ||
    pathname.endsWith("/completions")
  ) {
    return "TEXT";
  }
  return null;
}

export function videoTaskId(path: string): string | null {
  const pathname = new URL(path, "http://model-proxy.local").pathname;
  const match = /^\/v1\/videos\/([^/]+)(?:\/content)?$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/**
 * Only replay failures that could plausibly succeed on another attempt.
 *
 * Body parsing (`parseJsonBody`, `parseMultipartBody`), field screening and
 * protocol-header validation all raise CommercialApiError with a 4xx status.
 * Those verdicts are identical on every attempt and every route, so replaying
 * them multiplied latency and upstream load by MAX_ROUTE_ATTEMPTS × routes for
 * no chance of success. Transport failures from fetch surface as
 * CommercialApiError with status 0 and stay retryable.
 */
export function isRetryableRequestFailure(error: unknown): boolean {
  if (error instanceof CommercialApiError) {
    return !(error.status >= 400 && error.status < 500);
  }
  return true;
}

export function isTimeoutAbort(reason: unknown): boolean {
  return (
    reason instanceof Error &&
    (reason.name === "TimeoutError" || /timeout/i.test(reason.message))
  );
}

export function shouldFallback(route: ModelRoute, status: number): boolean {
  if (
    route.source === "byok" &&
    BYOK_CONFIGURATION_ERROR_STATUSES.has(status)
  ) {
    return false;
  }
  return FALLBACK_STATUSES.has(status) || status >= 500;
}

export function assertModelResponseContract(path: string, response: Response): void {
  const url = new URL(path, "http://model-proxy.local");
  const isVideoContent = /^\/v1\/videos\/[^/]+\/content$/.test(url.pathname);
  if (!isVideoContent || response.status < 200 || response.status >= 300) return;
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    contentType !== "video/mp4" &&
    contentType !== "application/mp4" &&
    contentType !== "application/octet-stream"
  ) {
    throw new CommercialApiError(
      `视频结果接口返回了非视频内容${contentType ? `：${contentType}` : ""}`,
      { status: 502 },
    );
  }
}

export function pipeModelResponse(
  method: string,
  upstream: Response,
  response: ServerResponse,
  route: ModelRoute,
  attempts: number,
): void {
  response.statusCode = upstream.status;
  response.setHeader("X-AI-Anime-Route-Source", route.source);
  response.setHeader("X-AI-Anime-Route-Model", route.modelId);
  response.setHeader("X-AI-Anime-Route-Role", route.role);
  response.setHeader("X-AI-Anime-Route-Attempts", String(attempts));
  const hasResponseBody = Boolean(upstream.body) && method !== "HEAD";
  for (const header of [
    "content-type",
    "content-disposition",
    "cache-control",
    "etag",
    "accept-ranges",
    "content-range",
    "location",
    "retry-after",
    "x-request-id",
    "x-ai-invocation-id",
    "x-ai-idempotency-key",
    "x-voice-id",
  ]) {
    const value = upstream.headers.get(header);
    if (value) response.setHeader(header, value);
  }
  if (!hasResponseBody) {
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) response.setHeader("content-length", contentLength);
    response.end();
    return;
  }
  const bodyStream = Readable.fromWeb(upstream.body as never);
  bodyStream.once("error", (error) => {
    if (!response.destroyed) response.destroy(error);
  });
  response.once("close", () => bodyStream.destroy());
  bodyStream.pipe(response);
}

function isForbiddenModelField(value: string): boolean {
  return FORBIDDEN_MODEL_FIELDS.has(
    value.toLowerCase().replaceAll("_", "").replaceAll("-", ""),
  );
}

export function assertLoopbackRequest(request: IncomingMessage): void {
  const address = request.socket.remoteAddress ?? "";
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
    throw new CommercialApiError("模型代理只接受本机请求", { status: 403 });
  }
}

export function assertLocalAuthorization(
  request: IncomingMessage,
  expectedToken: string,
): void {
  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    throw new CommercialApiError("模型代理认证失败", { status: 401 });
  }
}
