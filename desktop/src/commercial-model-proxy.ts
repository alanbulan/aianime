import { randomBytes, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Readable } from "node:stream";
import { setTimeout as wait } from "node:timers/promises";

import type { CommercialDeviceSigner } from "./commercial-device.js";
import {
  BYOK_MODEL_ROLES,
  type ByokModelAssignment,
  type ByokModelRole,
  type ByokProviderProtocol,
  type StoredCommercialModelAccess,
  type StoredByokProvider,
} from "./commercial-model-access.js";
import { CommercialApiClient, CommercialApiError } from "./commercial.js";

const MAX_MODEL_JSON_BODY_BYTES = 4 * 1024 * 1024;
const MAX_MODEL_MULTIPART_BODY_BYTES = 108 * 1024 * 1024;
const FALLBACK_STATUSES = new Set([401, 403, 404, 408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ROUTE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ROUTE_ATTEMPTS = 3;
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

export interface CommercialModelRoutingConfiguration {
  access: StoredCommercialModelAccess;
  allowsCustomModels: boolean;
  cloudModelAssignments: readonly ByokModelAssignment[];
}

export interface ModelRouteAuditEntry {
  timestamp: string;
  event: "routing_configured" | "route_attempt" | "video_task_route_unrecorded";
  role?: ByokModelRole;
  source?: "cloud" | "byok";
  provider?: string;
  modelId?: string;
  modelPriority?: number;
  providerPriority?: number;
  attempt?: number;
  status?: number;
  outcome?: "selected" | "retry" | "fallback" | "rejected" | "error";
  error?: string;
  routes?: Array<{
    role: ByokModelRole;
    source: "cloud" | "byok";
    provider: string;
    modelId: string;
    modelPriority: number;
    providerPriority: number;
  }>;
}

interface ModelRoute {
  key: string;
  selector: string;
  source: "cloud" | "byok";
  label: string;
  role: ByokModelRole;
  modelId: string;
  priority: number;
  providerPriority: number;
  baseUrl?: string;
  apiKey?: string;
  protocol?: ByokProviderProtocol;
}

interface PreparedBody {
  body?: BodyInit;
  contentType?: string;
}

/**
 * A video task pinned to the provider that created it.
 *
 * Polling `GET /v1/videos/{id}` only works against the originating provider,
 * so the route is remembered. The snapshot holds the provider's apiKey and
 * baseUrl, so it is bounded in both time and count rather than kept for the
 * lifetime of the process.
 */
interface StickyVideoRoute {
  route: ModelRoute;
  expiresAt: number;
}

/** Long enough for any realistic video job, short enough to bound key residency. */
const VIDEO_TASK_ROUTE_TTL_MS = 6 * 60 * 60_000;
const VIDEO_TASK_ROUTE_CAPACITY = 500;

const EMPTY_MODEL_ACCESS: StoredCommercialModelAccess = {
  schemaVersion: 5,
  cloudModelAssignments: [],
  byokProviders: [],
};

export class CommercialModelProxy {
  readonly token = randomBytes(32).toString("hex");
  private server: Server | null = null;
  private origin: string | null = null;
  private routing: CommercialModelRoutingConfiguration = {
    access: EMPTY_MODEL_ACCESS,
    allowsCustomModels: false,
    cloudModelAssignments: [],
  };
  private readonly videoTaskRoutes = new Map<string, StickyVideoRoute>();

  constructor(
    private readonly client: CommercialApiClient,
    private readonly deviceIdentity: CommercialDeviceSigner,
    private readonly audit: (entry: ModelRouteAuditEntry) => void = () => undefined,
  ) {}

  get baseUrl(): string {
    if (!this.origin) throw new Error("commercial model proxy has not started");
    return `${this.origin}/v1`;
  }

  configureRouting(configuration: CommercialModelRoutingConfiguration): void {
    this.routing = {
      access: configuration.access,
      allowsCustomModels: configuration.allowsCustomModels,
      cloudModelAssignments: configuration.cloudModelAssignments.map((item) => ({
        ...item,
      })),
    };
    const activeRoutes = BYOK_MODEL_ROLES.flatMap((role) =>
      configuredRoutes(this.routing, role),
    );
    this.dropUnavailableVideoTaskRoutes(activeRoutes);
    this.audit({
      timestamp: new Date().toISOString(),
      event: "routing_configured",
      routes: activeRoutes.map((route) => ({
        role: route.role,
        source: route.source,
        provider: route.label,
        modelId: route.modelId,
        modelPriority: route.priority,
        providerPriority: route.providerPriority,
      })),
    });
  }

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("commercial model proxy failed to bind a TCP port");
      }
      this.origin = `http://127.0.0.1:${address.port}`;
    } catch (error) {
      // Leave nothing behind: a retained `server` would make every later
      // start() return early against a proxy that never bound a port.
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.origin = null;
    this.videoTaskRoutes.clear();
    if (!server) return;
    // close() only stops accepting new sockets; idle keep-alive connections
    // would hold the server open for seconds during shutdown.
    server.closeIdleConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      assertLoopbackRequest(request);
      assertLocalAuthorization(request, this.token);
      const method = String(request.method ?? "GET").toUpperCase();
      if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) {
        throw new CommercialApiError("不支持的模型代理方法", { status: 405 });
      }
      const path = request.url ?? "/";
      const contentType = String(request.headers["content-type"] ?? "");
      const rawBody =
        method === "GET" || method === "HEAD"
          ? undefined
          : await readModelRequestBody(request, contentType);
      const requestHeaders = { ...request.headers };
      if (isModelWriteMethod(method) && !requestHeaders["idempotency-key"]) {
        requestHeaders["idempotency-key"] = randomUUID();
      }
      const explicitRole = normalizeRoleHeader(request.headers["x-ai-anime-model-role"]);
      const explicitSelector = normalizeModelSelectorHeader(
        request.headers["x-ai-anime-model-selector"],
      );
      const role = explicitRole ?? inferModelRole(path);
      const routes = this.routesForRequest(path, role, explicitSelector);
      const abortController = new AbortController();
      const abortUpstream = () => abortController.abort();
      request.once("aborted", abortUpstream);
      response.once("close", abortUpstream);

      const upstream = await this.requestWithFallback({
        method,
        path,
        contentType,
        ...(rawBody === undefined ? {} : { rawBody }),
        routes,
        requestHeaders,
        signal: abortController.signal,
      });
      assertModelResponseContract(path, upstream.response);
      await this.rememberVideoTaskRoute(
        method,
        path,
        upstream.route,
        upstream.response,
      );
      pipeModelResponse(
        method,
        upstream.response,
        response,
        upstream.route,
        upstream.attempts,
      );
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const status =
        error instanceof CommercialApiError && error.status > 0
          ? error.status
          : 502;
      response.statusCode = status;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : "模型路由失败",
            type: status === 401 ? "authentication_error" : "proxy_error",
            code: error instanceof CommercialApiError ? error.code : null,
          },
        }),
      );
    }
  }

  private routesForRequest(
    path: string,
    role: ByokModelRole | null,
    selector: string | null,
  ): ModelRoute[] {
    const taskId = videoTaskId(path);
    const stickyRoute = taskId ? this.stickyVideoRoute(taskId) : undefined;
    if (stickyRoute) return [stickyRoute];
    if (!role) {
      throw new CommercialApiError("无法确定模型用途，已拒绝绕过统一路由", {
        status: 422,
      });
    }
    const configured = configuredRoutes(this.routing, role);
    const routes = selector
      ? configured.filter((route) => route.selector === selector)
      : configured;
    if (routes.length === 0) {
      const detail = selector ? `（选择器 ${selector}）` : "";
      throw new CommercialApiError(`模型用途 ${role} 没有可用路由${detail}`, {
        status: 422,
      });
    }
    return routes;
  }

  private async requestWithFallback(input: {
    method: string;
    path: string;
    contentType: string;
    rawBody?: Buffer;
    routes: readonly ModelRoute[];
    requestHeaders: IncomingMessage["headers"];
    signal: AbortSignal;
  }): Promise<{ response: Response; route: ModelRoute; attempts: number }> {
    let lastError: unknown;
    let totalAttempts = 0;
    for (let index = 0; index < input.routes.length; index += 1) {
      const route = input.routes[index];
      if (!route) continue;
      for (let routeAttempt = 1; routeAttempt <= MAX_ROUTE_ATTEMPTS; routeAttempt += 1) {
        totalAttempts += 1;
        try {
          const prepared = await prepareBodyForRoute(
            input.rawBody,
            input.contentType,
            route.modelId,
            route.source === "cloud" && isVideoCreatePath(input.path),
          );
          const upstream =
            route.source === "cloud"
              ? await this.requestCloud(route, input, prepared)
              : await requestByok(route, input, prepared);
          const responseError = upstream.ok
            ? undefined
            : await responseErrorForRouteAudit(upstream);
          if (
            RETRYABLE_ROUTE_STATUSES.has(upstream.status) &&
            routeAttempt < MAX_ROUTE_ATTEMPTS
          ) {
            this.auditRouteAttempt(
              route,
              totalAttempts,
              upstream.status,
              "retry",
              responseError,
            );
            await upstream.body?.cancel().catch(() => undefined);
            await wait(150 * routeAttempt, undefined, { signal: input.signal });
            continue;
          }
          const canFallback =
            index < input.routes.length - 1 &&
            shouldFallback(route, upstream.status);
          if (!canFallback) {
            this.auditRouteAttempt(
              route,
              totalAttempts,
              upstream.status,
              upstream.ok ? "selected" : "rejected",
              responseError,
            );
            return { response: upstream, route, attempts: totalAttempts };
          }
          this.auditRouteAttempt(
            route,
            totalAttempts,
            upstream.status,
            "fallback",
            responseError,
          );
          await upstream.body?.cancel().catch(() => undefined);
          break;
        } catch (error) {
          lastError = error;
          if (input.signal.aborted) throw error;
          if (!isRetryableRequestFailure(error)) {
            // Deterministic client-side rejection (unparseable body, forbidden
            // field, bad protocol header). The body is identical on every
            // attempt and every route, so neither retrying nor falling back
            // can succeed — fail now instead of amplifying by 3×N.
            this.auditRouteAttempt(route, totalAttempts, undefined, "rejected", error);
            throw error;
          }
          if (routeAttempt < MAX_ROUTE_ATTEMPTS) {
            this.auditRouteAttempt(route, totalAttempts, undefined, "retry", error);
            await wait(150 * routeAttempt, undefined, { signal: input.signal });
            continue;
          }
          this.auditRouteAttempt(
            route,
            totalAttempts,
            undefined,
            index === input.routes.length - 1 ? "error" : "fallback",
            error,
          );
          if (index === input.routes.length - 1) throw error;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new CommercialApiError("没有可用的模型路由");
  }

  private auditRouteAttempt(
    route: ModelRoute,
    attempt: number,
    status: number | undefined,
    outcome: NonNullable<ModelRouteAuditEntry["outcome"]>,
    error?: unknown,
  ): void {
    this.audit({
      timestamp: new Date().toISOString(),
      event: "route_attempt",
      role: route.role,
      source: route.source,
      provider: route.label,
      modelId: route.modelId,
      modelPriority: route.priority,
      providerPriority: route.providerPriority,
      attempt,
      ...(status === undefined ? {} : { status }),
      outcome,
      ...(error === undefined
        ? {}
        : { error: error instanceof Error ? error.message : String(error) }),
    });
  }

  private async requestCloud(
    _route: ModelRoute,
    input: {
      method: string;
      path: string;
      requestHeaders: IncomingMessage["headers"];
      signal: AbortSignal;
    },
    prepared: PreparedBody,
  ): Promise<Response> {
    const device = await this.deviceIdentity.summary();
    return this.client.modelRequest({
      method: input.method,
      path: input.path,
      headers: forwardedHeaders(input.requestHeaders, prepared.contentType),
      ...(prepared.body === undefined ? {} : { body: prepared.body }),
      devicePublicKeyHash: device.publicKeyHash,
      signal: input.signal,
    });
  }

  private async rememberVideoTaskRoute(
    method: string,
    path: string,
    route: ModelRoute,
    response: Response,
  ): Promise<void> {
    const pathname = new URL(path, "http://model-proxy.local").pathname;
    if (method !== "POST" || pathname !== "/v1/videos" || !response.ok) return;
    try {
      const payload = (await response.clone().json()) as { id?: unknown };
      const id = typeof payload.id === "string" ? payload.id.trim() : "";
      if (!id) return;
      const now = Date.now();
      this.pruneVideoTaskRoutes(now);
      // Re-inserting moves the entry to the end, keeping Map iteration order
      // usable as an eviction order.
      this.videoTaskRoutes.delete(id);
      this.videoTaskRoutes.set(id, {
        route,
        expiresAt: now + VIDEO_TASK_ROUTE_TTL_MS,
      });
      while (this.videoTaskRoutes.size > VIDEO_TASK_ROUTE_CAPACITY) {
        const oldest = this.videoTaskRoutes.keys().next();
        if (oldest.done) break;
        this.videoTaskRoutes.delete(oldest.value);
      }
    } catch (error) {
      // A /v1/videos success without a parseable id means later polls fall back
      // to role routing. Surface it: silent failure here looks like a routing
      // bug much further downstream.
      this.audit({
        timestamp: new Date().toISOString(),
        event: "video_task_route_unrecorded",
        routes: [
          {
            role: route.role,
            source: route.source,
            provider: route.label,
            modelId: route.modelId,
            modelPriority: route.priority,
            providerPriority: route.providerPriority,
          },
        ],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Resolve a still-valid sticky route, dropping it once expired. */
  private stickyVideoRoute(taskId: string): ModelRoute | undefined {
    const entry = this.videoTaskRoutes.get(taskId);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.videoTaskRoutes.delete(taskId);
      return undefined;
    }
    return entry.route;
  }

  private pruneVideoTaskRoutes(now: number): void {
    for (const [taskId, entry] of this.videoTaskRoutes) {
      if (entry.expiresAt <= now) this.videoTaskRoutes.delete(taskId);
    }
  }

  /**
   * Forget tasks pinned to a route the user has since removed or disabled.
   *
   * Without this, polling keeps targeting a dead provider (and keeps its
   * apiKey resident) until the process restarts. Dropping the pin lets the
   * request fall back to normal role-based routing.
   */
  private dropUnavailableVideoTaskRoutes(activeRoutes: readonly ModelRoute[]): void {
    const availableKeys = new Set(activeRoutes.map((route) => route.key));
    for (const [taskId, entry] of this.videoTaskRoutes) {
      if (!availableKeys.has(entry.route.key)) this.videoTaskRoutes.delete(taskId);
    }
  }
}

async function responseErrorForRouteAudit(
  response: Response,
): Promise<string | undefined> {
  try {
    const clone = response.clone();
    const reader = clone.body?.getReader();
    if (!reader) return undefined;
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (byteLength < 8192) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = 8192 - byteLength;
      chunks.push(value.subarray(0, remaining));
      byteLength += Math.min(value.byteLength, remaining);
      if (value.byteLength > remaining) break;
    }
    await reader.cancel().catch(() => undefined);
    if (byteLength === 0) return undefined;
    const merged = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const raw = new TextDecoder().decode(merged).trim();
    if (!raw) return undefined;
    let detail = raw;
    try {
      const payload = JSON.parse(raw) as unknown;
      if (payload && typeof payload === "object") {
        const record = payload as Record<string, unknown>;
        const nestedError = record.error;
        if (nestedError && typeof nestedError === "object") {
          const message = (nestedError as Record<string, unknown>).message;
          if (typeof message === "string") detail = message;
        } else if (typeof nestedError === "string") {
          detail = nestedError;
        } else if (typeof record.message === "string") {
          detail = record.message;
        } else if (typeof record.detail === "string") {
          detail = record.detail;
        }
      }
    } catch {
      // Non-JSON upstream errors are still useful as a bounded audit snippet.
    }
    return redactRouteAuditError(detail);
  } catch {
    return undefined;
  }
}

function redactRouteAuditError(value: string): string {
  return value
    .replace(
      /\b(api[_-]?key|token|authorization|password|secret)(\s*[:=]\s*)[^\s,;}]+/gi,
      "$1$2***",
    )
    .replace(/\b(bearer\s+)[a-z0-9._~+/=-]+/gi, "$1***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function configuredRoutes(
  configuration: CommercialModelRoutingConfiguration,
  role: ByokModelRole,
): ModelRoute[] {
  const routes: ModelRoute[] = configuration.cloudModelAssignments
    .filter((assignment) => assignment.enabled && assignment.role === role)
    .map((assignment) => ({
      key: `cloud:${assignment.role}:${assignment.modelId}`,
      selector: `cloud:${assignment.modelId}`,
      source: "cloud" as const,
      label: "云端",
      role,
      modelId: assignment.modelId,
      priority: assignment.priority,
      providerPriority: 0,
    }));
  if (configuration.allowsCustomModels) {
    for (const provider of configuration.access.byokProviders) {
      if (!provider.enabled) continue;
      routes.push(...providerRoutes(provider, role));
    }
  }
  return routes.sort(compareModelRoutes);
}

function compareModelRoutes(left: ModelRoute, right: ModelRoute): number {
  return (
    left.priority - right.priority ||
    left.providerPriority - right.providerPriority ||
    (left.source === right.source ? 0 : left.source === "cloud" ? -1 : 1) ||
    left.label.localeCompare(right.label) ||
    left.modelId.localeCompare(right.modelId)
  );
}

export function modelRoutingSnapshot(
  configuration: CommercialModelRoutingConfiguration,
): ByokModelAssignment[] {
  const assignments: ByokModelAssignment[] = [];
  for (const role of BYOK_MODEL_ROLES) {
    const seenModels = new Set<string>();
    let routeRank = 1;
    for (const route of configuredRoutes(configuration, role)) {
      if (seenModels.has(route.modelId)) continue;
      seenModels.add(route.modelId);
      assignments.push({
        modelId: route.modelId,
        role,
        priority: routeRank,
        enabled: true,
      });
      routeRank += 1;
    }
  }
  return assignments;
}

function providerRoutes(
  provider: StoredByokProvider,
  role: ByokModelRole,
): ModelRoute[] {
  return provider.modelAssignments
    .filter((assignment) => assignment.enabled && assignment.role === role)
    .map((assignment) => ({
      key: `byok:${provider.id}:${assignment.role}:${assignment.modelId}`,
      selector: `byok:${provider.id}:${assignment.modelId}`,
      source: "byok" as const,
      label: provider.name,
      role,
      modelId: assignment.modelId,
      priority: assignment.priority,
      providerPriority: provider.priority,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      protocol: provider.protocol,
    }));
}

async function requestByok(
  route: ModelRoute,
  input: {
    method: string;
    path: string;
    requestHeaders: IncomingMessage["headers"];
    signal: AbortSignal;
  },
  prepared: PreparedBody,
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("BYOK Base URL 缺失");
  if (route.protocol === "ANTHROPIC") {
    return requestAnthropic(route, input, prepared);
  }
  if (route.protocol === "GEMINI") {
    return requestGemini(route, input, prepared);
  }
  const localUrl = new URL(input.path, "http://model-proxy.local");
  const relativePath = localUrl.pathname.replace(/^\/v1(?=\/|$)/, "") || "/";
  const upstreamUrl = new URL(`${route.baseUrl}${relativePath}`);
  upstreamUrl.search = localUrl.search;
  const headers = forwardedHeaders(input.requestHeaders, prepared.contentType);
  if (route.apiKey) headers.set("Authorization", `Bearer ${route.apiKey}`);
  if (isModelWriteMethod(input.method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", randomUUID());
  }
  try {
    return await fetch(upstreamUrl, {
      method: input.method,
      headers,
      ...(prepared.body === undefined ? {} : { body: prepared.body }),
      signal: input.signal,
    });
  } catch (error) {
    throw new CommercialApiError(
      `${route.label} 请求失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function requestAnthropic(
  route: ModelRoute,
  input: {
    method: string;
    path: string;
    requestHeaders: IncomingMessage["headers"];
    signal: AbortSignal;
  },
  prepared: PreparedBody,
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("Anthropic Base URL 缺失");
  const localUrl = new URL(input.path, "http://model-proxy.local");
  if (input.method !== "POST" || !localUrl.pathname.endsWith("/chat/completions")) {
    throw new CommercialApiError("Anthropic 原生协议仅支持文本对话", { status: 400 });
  }
  const payload = preparedJsonObject(prepared);
  const stream = payload.stream === true;
  const upstreamPayload = {
    ...openAiToAnthropicPayload(payload, route.modelId),
    ...(stream ? { stream: true } : {}),
  };
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "Anthropic-Version": "2023-06-01",
  });
  const beta = input.requestHeaders["anthropic-beta"];
  if (beta) headers.set("Anthropic-Beta", String(beta));
  if (route.apiKey) headers.set("X-Api-Key", route.apiKey);
  const response = await fetchByokUpstream(
    route,
    new URL("messages", `${route.baseUrl}/`),
    {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamPayload),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;
  return stream
    ? anthropicStreamToOpenAiResponse(response, route.modelId)
    : anthropicToOpenAiResponse(response, route.modelId);
}

async function requestGemini(
  route: ModelRoute,
  input: {
    method: string;
    path: string;
    requestHeaders: IncomingMessage["headers"];
    signal: AbortSignal;
  },
  prepared: PreparedBody,
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("Gemini Base URL 缺失");
  const localUrl = new URL(input.path, "http://model-proxy.local");
  if (input.method !== "POST" || !localUrl.pathname.endsWith("/chat/completions")) {
    throw new CommercialApiError("Gemini 原生协议仅支持文本对话", { status: 400 });
  }
  const payload = preparedJsonObject(prepared);
  const stream = payload.stream === true;
  const upstreamPayload = openAiToGeminiPayload(payload);
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  if (route.apiKey) headers.set("X-Goog-Api-Key", route.apiKey);
  const modelPath = route.modelId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const action = stream ? "streamGenerateContent" : "generateContent";
  const upstreamUrl = new URL(`models/${modelPath}:${action}`, `${route.baseUrl}/`);
  if (stream) upstreamUrl.searchParams.set("alt", "sse");
  const response = await fetchByokUpstream(
    route,
    upstreamUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamPayload),
      signal: input.signal,
    },
  );
  if (!response.ok) return response;
  return stream
    ? geminiStreamToOpenAiResponse(response, route.modelId)
    : geminiToOpenAiResponse(response, route.modelId);
}

async function fetchByokUpstream(
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

function preparedJsonObject(prepared: PreparedBody): Record<string, unknown> {
  if (typeof prepared.body !== "string") {
    throw new CommercialApiError("原生模型协议要求 JSON 请求体", { status: 400 });
  }
  const payload = JSON.parse(prepared.body) as unknown;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new CommercialApiError("原生模型协议请求体必须是对象", { status: 400 });
  }
  return payload as Record<string, unknown>;
}

function openAiToAnthropicPayload(
  payload: Record<string, unknown>,
  modelId: string,
): Record<string, unknown> {
  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const system: string[] = [];
  const messages: Array<Record<string, unknown>> = [];
  for (const value of rawMessages) {
    const message = objectValue(value, "OpenAI message");
    const role = String(message.role ?? "").trim();
    if (role === "system" || role === "developer") {
      const text = textContent(message.content);
      if (text) system.push(text);
      continue;
    }
    if (role === "tool") {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: String(message.tool_call_id ?? ""),
            content: textContent(message.content),
          },
        ],
      });
      continue;
    }
    if (role !== "user" && role !== "assistant") continue;
    const content = anthropicContent(message.content);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const callValue of toolCalls) {
      const call = objectValue(callValue, "OpenAI tool call");
      const fn = objectValue(call.function, "OpenAI tool function");
      content.push({
        type: "tool_use",
        id: String(call.id ?? randomUUID()),
        name: String(fn.name ?? ""),
        input: parseJsonArguments(fn.arguments),
      });
    }
    messages.push({ role, content });
  }
  const result: Record<string, unknown> = {
    model: modelId,
    max_tokens: positiveNumber(payload.max_tokens ?? payload.max_completion_tokens, 4096),
    messages,
  };
  if (system.length > 0) result.system = system.join("\n\n");
  if (typeof payload.temperature === "number") result.temperature = payload.temperature;
  if (typeof payload.top_p === "number") result.top_p = payload.top_p;
  if (typeof payload.stop === "string") result.stop_sequences = [payload.stop];
  if (Array.isArray(payload.stop)) result.stop_sequences = payload.stop;
  if (Array.isArray(payload.tools)) {
    result.tools = payload.tools.map((value) => {
      const tool = objectValue(value, "OpenAI tool");
      const fn = objectValue(tool.function, "OpenAI tool function");
      return {
        name: String(fn.name ?? ""),
        ...(fn.description ? { description: String(fn.description) } : {}),
        input_schema: fn.parameters ?? { type: "object", properties: {} },
      };
    });
  }
  return result;
}

function openAiToGeminiPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  const system: string[] = [];
  const contents: Array<Record<string, unknown>> = [];
  const toolNames = new Map<string, string>();
  for (const value of rawMessages) {
    const message = objectValue(value, "OpenAI message");
    const role = String(message.role ?? "").trim();
    if (role === "system" || role === "developer") {
      const text = textContent(message.content);
      if (text) system.push(text);
      continue;
    }
    if (role === "tool") {
      const callId = String(message.tool_call_id ?? "");
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: toolNames.get(callId) ?? (callId || "tool"),
              response: { result: textContent(message.content) },
            },
          },
        ],
      });
      continue;
    }
    if (role !== "user" && role !== "assistant") continue;
    const parts = geminiParts(message.content);
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const callValue of toolCalls) {
      const call = objectValue(callValue, "OpenAI tool call");
      const fn = objectValue(call.function, "OpenAI tool function");
      toolNames.set(String(call.id ?? ""), String(fn.name ?? ""));
      parts.push({
        functionCall: {
          name: String(fn.name ?? ""),
          args: parseJsonArguments(fn.arguments),
        },
      });
    }
    contents.push({ role: role === "assistant" ? "model" : "user", parts });
  }
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: positiveNumber(
      payload.max_tokens ?? payload.max_completion_tokens,
      4096,
    ),
  };
  if (typeof payload.temperature === "number") {
    generationConfig.temperature = payload.temperature;
  }
  if (typeof payload.top_p === "number") generationConfig.topP = payload.top_p;
  if (typeof payload.stop === "string") generationConfig.stopSequences = [payload.stop];
  if (Array.isArray(payload.stop)) generationConfig.stopSequences = payload.stop;
  const responseFormat = payload.response_format;
  if (
    responseFormat &&
    typeof responseFormat === "object" &&
    !Array.isArray(responseFormat) &&
    (responseFormat as Record<string, unknown>).type === "json_object"
  ) {
    generationConfig.responseMimeType = "application/json";
  }
  const result: Record<string, unknown> = { contents, generationConfig };
  if (system.length > 0) {
    result.systemInstruction = { parts: [{ text: system.join("\n\n") }] };
  }
  if (Array.isArray(payload.tools)) {
    result.tools = [
      {
        functionDeclarations: payload.tools.map((value) => {
          const tool = objectValue(value, "OpenAI tool");
          const fn = objectValue(tool.function, "OpenAI tool function");
          return {
            name: String(fn.name ?? ""),
            ...(fn.description ? { description: String(fn.description) } : {}),
            parameters: fn.parameters ?? { type: "object", properties: {} },
          };
        }),
      },
    ];
  }
  return result;
}

function anthropicContent(value: unknown): Array<Record<string, unknown>> {
  if (typeof value === "string") return [{ type: "text", text: value }];
  if (!Array.isArray(value)) return [];
  return value.flatMap<Record<string, unknown>>((partValue) => {
    const part = objectValue(partValue, "OpenAI content part");
    if (part.type === "text") return [{ type: "text", text: String(part.text ?? "") }];
    if (part.type !== "image_url") return [];
    const image = objectValue(part.image_url, "OpenAI image URL");
    const url = String(image.url ?? "");
    const data = /^data:([^;,]+);base64,(.+)$/s.exec(url);
    return [
      {
        type: "image",
        source: data
          ? { type: "base64", media_type: data[1], data: data[2] }
          : { type: "url", url },
      },
    ];
  });
}

function geminiParts(value: unknown): Array<Record<string, unknown>> {
  if (typeof value === "string") return [{ text: value }];
  if (!Array.isArray(value)) return [];
  return value.flatMap<Record<string, unknown>>((partValue) => {
    const part = objectValue(partValue, "OpenAI content part");
    if (part.type === "text") return [{ text: String(part.text ?? "") }];
    if (part.type !== "image_url") return [];
    const image = objectValue(part.image_url, "OpenAI image URL");
    const url = String(image.url ?? "");
    const data = /^data:([^;,]+);base64,(.+)$/s.exec(url);
    if (!data) {
      throw new CommercialApiError("Gemini 原生协议的图片输入必须是 data URL", {
        status: 400,
      });
    }
    return [{ inlineData: { mimeType: data[1], data: data[2] } }];
  });
}

async function anthropicToOpenAiResponse(
  response: Response,
  modelId: string,
): Promise<Response> {
  const payload = objectValue(await response.json(), "Anthropic response");
  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const text = blocks
    .map((value) => objectValue(value, "Anthropic content block"))
    .filter((value) => value.type === "text")
    .map((value) => String(value.text ?? ""))
    .join("");
  const toolCalls = blocks
    .map((value) => objectValue(value, "Anthropic content block"))
    .filter((value) => value.type === "tool_use")
    .map((value) => ({
      id: String(value.id ?? randomUUID()),
      type: "function",
      function: {
        name: String(value.name ?? ""),
        arguments: JSON.stringify(value.input ?? {}),
      },
    }));
  const usage = objectValue(payload.usage ?? {}, "Anthropic usage");
  return jsonResponseLike(response, {
    id: String(payload.id ?? `chatcmpl-${randomUUID()}`),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: String(payload.model ?? modelId),
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: anthropicFinishReason(payload.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: Number(usage.input_tokens ?? 0),
      completion_tokens: Number(usage.output_tokens ?? 0),
      total_tokens:
        Number(usage.input_tokens ?? 0) + Number(usage.output_tokens ?? 0),
    },
  });
}

async function geminiToOpenAiResponse(
  response: Response,
  modelId: string,
): Promise<Response> {
  const payload = objectValue(await response.json(), "Gemini response");
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidate = candidates[0] ? objectValue(candidates[0], "Gemini candidate") : {};
  const content = objectValue(candidate.content ?? {}, "Gemini content");
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((value) => objectValue(value, "Gemini part"))
    .map((value) => (typeof value.text === "string" ? value.text : ""))
    .join("");
  const toolCalls = parts
    .map((value) => objectValue(value, "Gemini part"))
    .filter((value) => value.functionCall && typeof value.functionCall === "object")
    .map((value) => {
      const call = objectValue(value.functionCall, "Gemini function call");
      return {
        id: `call-${randomUUID()}`,
        type: "function",
        function: {
          name: String(call.name ?? ""),
          arguments: JSON.stringify(call.args ?? {}),
        },
      };
    });
  const usage = objectValue(payload.usageMetadata ?? {}, "Gemini usage");
  return jsonResponseLike(response, {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: geminiFinishReason(candidate.finishReason),
      },
    ],
    usage: {
      prompt_tokens: Number(usage.promptTokenCount ?? 0),
      completion_tokens: Number(usage.candidatesTokenCount ?? 0),
      total_tokens: Number(usage.totalTokenCount ?? 0),
    },
  });
}

function anthropicStreamToOpenAiResponse(
  response: Response,
  fallbackModelId: string,
): Response {
  let completionId = `chatcmpl-${randomUUID()}`;
  let modelId = fallbackModelId;
  let roleSent = false;
  let finished = false;
  const toolIndexes = new Map<number, number>();
  let nextToolIndex = 0;

  return translateEventStream(
    response,
    (_eventName, data) => {
      const payload = parseEventPayload(data, "Anthropic stream event");
      const type = String(payload.type ?? "");
      const chunks: string[] = [];
      if (type === "message_start") {
        const message = objectValue(payload.message, "Anthropic stream message");
        completionId = String(message.id ?? completionId);
        modelId = String(message.model ?? modelId);
      }
      if (!roleSent && type !== "ping") {
        chunks.push(openAiEventChunk(completionId, modelId, { role: "assistant" }));
        roleSent = true;
      }
      if (type === "content_block_start") {
        const block = objectValue(payload.content_block, "Anthropic content block");
        if (block.type === "tool_use") {
          const sourceIndex = Number(payload.index ?? 0);
          const toolIndex = nextToolIndex++;
          toolIndexes.set(sourceIndex, toolIndex);
          chunks.push(
            openAiEventChunk(completionId, modelId, {
              tool_calls: [
                {
                  index: toolIndex,
                  id: String(block.id ?? `call-${randomUUID()}`),
                  type: "function",
                  function: { name: String(block.name ?? ""), arguments: "" },
                },
              ],
            }),
          );
        }
      } else if (type === "content_block_delta") {
        const delta = objectValue(payload.delta, "Anthropic content delta");
        if (delta.type === "text_delta") {
          chunks.push(
            openAiEventChunk(completionId, modelId, {
              content: String(delta.text ?? ""),
            }),
          );
        } else if (delta.type === "input_json_delta") {
          const sourceIndex = Number(payload.index ?? 0);
          chunks.push(
            openAiEventChunk(completionId, modelId, {
              tool_calls: [
                {
                  index: toolIndexes.get(sourceIndex) ?? sourceIndex,
                  function: { arguments: String(delta.partial_json ?? "") },
                },
              ],
            }),
          );
        }
      } else if (type === "message_delta") {
        const delta = objectValue(payload.delta, "Anthropic message delta");
        chunks.push(
          openAiEventChunk(
            completionId,
            modelId,
            {},
            anthropicFinishReason(delta.stop_reason),
          ),
        );
        finished = true;
      } else if (type === "message_stop") {
        if (!finished) {
          chunks.push(openAiEventChunk(completionId, modelId, {}, "stop"));
          finished = true;
        }
        chunks.push("data: [DONE]\n\n");
      }
      return chunks;
    },
    () => {
      if (finished) return [];
      finished = true;
      return [
        openAiEventChunk(completionId, modelId, {}, "stop"),
        "data: [DONE]\n\n",
      ];
    },
  );
}

function geminiStreamToOpenAiResponse(
  response: Response,
  modelId: string,
): Response {
  const completionId = `chatcmpl-${randomUUID()}`;
  let roleSent = false;
  let finished = false;

  return translateEventStream(
    response,
    (_eventName, data) => {
      const payload = parseEventPayload(data, "Gemini stream event");
      const chunks: string[] = [];
      if (!roleSent) {
        chunks.push(openAiEventChunk(completionId, modelId, { role: "assistant" }));
        roleSent = true;
      }
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      const candidate = candidates[0]
        ? objectValue(candidates[0], "Gemini stream candidate")
        : {};
      const content = objectValue(candidate.content ?? {}, "Gemini stream content");
      const parts = Array.isArray(content.parts) ? content.parts : [];
      parts.forEach((value, index) => {
        const part = objectValue(value, "Gemini stream part");
        if (typeof part.text === "string" && part.text) {
          chunks.push(
            openAiEventChunk(completionId, modelId, { content: part.text }),
          );
        }
        if (part.functionCall && typeof part.functionCall === "object") {
          const call = objectValue(part.functionCall, "Gemini function call");
          chunks.push(
            openAiEventChunk(completionId, modelId, {
              tool_calls: [
                {
                  index,
                  id: `call-${randomUUID()}`,
                  type: "function",
                  function: {
                    name: String(call.name ?? ""),
                    arguments: JSON.stringify(call.args ?? {}),
                  },
                },
              ],
            }),
          );
        }
      });
      if (candidate.finishReason) {
        chunks.push(
          openAiEventChunk(
            completionId,
            modelId,
            {},
            geminiFinishReason(candidate.finishReason),
          ),
        );
        chunks.push("data: [DONE]\n\n");
        finished = true;
      }
      return chunks;
    },
    () => {
      if (finished) return [];
      finished = true;
      return [
        openAiEventChunk(completionId, modelId, {}, "stop"),
        "data: [DONE]\n\n",
      ];
    },
  );
}

function translateEventStream(
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

function parseEventPayload(data: string, name: string): Record<string, unknown> {
  try {
    return objectValue(JSON.parse(data) as unknown, name);
  } catch (error) {
    if (error instanceof CommercialApiError) throw error;
    throw new CommercialApiError(`${name} 不是有效 JSON`, { status: 502 });
  }
}

function openAiEventChunk(
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

function jsonResponseLike(source: Response, payload: unknown): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  for (const name of ["x-request-id", "request-id"]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(JSON.stringify(payload), { status: source.status, headers });
}

function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommercialApiError(`${name} 必须是对象`, { status: 502 });
  }
  return value as Record<string, unknown>;
}

function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((partValue) => objectValue(partValue, "OpenAI content part"))
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("\n");
}

function parseJsonArguments(value: unknown): Record<string, unknown> {
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

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function anthropicFinishReason(value: unknown): string {
  if (value === "max_tokens") return "length";
  if (value === "tool_use") return "tool_calls";
  return "stop";
}

function geminiFinishReason(value: unknown): string {
  if (value === "MAX_TOKENS") return "length";
  return "stop";
}

function forwardedHeaders(
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

async function prepareBodyForRoute(
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

function isVideoCreatePath(path: string): boolean {
  return new URL(path, "http://model-proxy.local").pathname === "/v1/videos";
}

async function readModelRequestBody(
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

function normalizeRoleHeader(value: string | string[] | undefined): ByokModelRole | null {
  const normalized = Array.isArray(value) ? value[0]?.trim().toUpperCase() : value?.trim().toUpperCase();
  if (!normalized) return null;
  if (!(BYOK_MODEL_ROLES as readonly string[]).includes(normalized)) {
    throw new CommercialApiError("模型用途标头无效", { status: 400 });
  }
  return normalized as ByokModelRole;
}

function normalizeModelSelectorHeader(
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

function inferModelRole(path: string): ByokModelRole | null {
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

function videoTaskId(path: string): string | null {
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
function isRetryableRequestFailure(error: unknown): boolean {
  if (error instanceof CommercialApiError) {
    return !(error.status >= 400 && error.status < 500);
  }
  return true;
}

function shouldFallback(route: ModelRoute, status: number): boolean {
  if (
    route.source === "byok" &&
    BYOK_CONFIGURATION_ERROR_STATUSES.has(status)
  ) {
    return false;
  }
  return FALLBACK_STATUSES.has(status) || status >= 500;
}

function isModelWriteMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function assertModelResponseContract(path: string, response: Response): void {
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

function pipeModelResponse(
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

function assertLoopbackRequest(request: IncomingMessage): void {
  const address = request.socket.remoteAddress ?? "";
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
    throw new CommercialApiError("模型代理只接受本机请求", { status: 403 });
  }
}

function assertLocalAuthorization(
  request: IncomingMessage,
  expectedToken: string,
): void {
  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    throw new CommercialApiError("模型代理认证失败", { status: 401 });
  }
}
