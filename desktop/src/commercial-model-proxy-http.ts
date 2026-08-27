// Copyright (c) 2026 AI anime

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
const CLOUD_VIDEO_TEXT_FIELDS = new Set(["model", "prompt", "seconds", "size"]);
const CLOUD_VIDEO_MEDIA_FIELD_ALIASES = new Map([
  ["reference_images", "reference_image"],
  ["reference_images[]", "reference_image"],
  ["reference_videos", "reference_video"],
  ["reference_videos[]", "reference_video"],
  ["reference_audios", "reference_audio"],
  ["reference_audios[]", "reference_audio"],
]);

export async function prepareBodyForRoute(
  rawBody: Buffer | undefined,
  contentType: string,
  modelId: string,
  cloudVideo: boolean,
): Promise<PreparedBody> {
  if (rawBody === undefined) return {};
  const normalized = contentType.trim().toLowerCase();
  if (normalized.startsWith("application/json")) {
    const payload = parseJsonBody(rawBody);
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const routedPayload = cloudVideo
        ? Object.fromEntries(
            Object.entries(payload).filter(([key]) =>
              CLOUD_VIDEO_TEXT_FIELDS.has(key.toLowerCase()),
            ),
          )
        : payload;
      return {
        body: JSON.stringify({ ...routedPayload, model: modelId }),
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
        if (cloudVideo && !CLOUD_VIDEO_TEXT_FIELDS.has(normalizedKey)) return;
        target.append(key, value);
        return;
      }
      const targetKey = cloudVideo
        ? (CLOUD_VIDEO_MEDIA_FIELD_ALIASES.get(normalizedKey) ?? key)
        : key;
      target.append(targetKey, value, value.name);
    });
    target.set("model", modelId);
    return { body: target };
  }
  return {
    body: rawBody as unknown as BodyInit,
    ...(contentType ? { contentType } : {}),
  };
}

export function isVideoCreatePath(path: string): boolean {
  return new URL(path, "http://model-proxy.local").pathname === "/v1/videos";
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
    normalized.length > 768 ||
    /[\u0000-\u001f\u007f]/u.test(normalized) ||
    (!normalized.startsWith("cloud:") && !normalized.startsWith("byok:"))
  ) {
    throw new CommercialApiError("模型路由选择器无效", { status: 422 });
  }
  return normalized;
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
