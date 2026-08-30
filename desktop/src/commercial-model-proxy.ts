import { randomBytes, randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { setTimeout as wait } from "node:timers/promises";

import type { CommercialDeviceSigner } from "./commercial-device.js";
import {
  BYOK_MODEL_ROLES,
  effectiveModelRuntimeSettings,
  type ByokModelAssignment,
  type ByokModelRole,
  type StoredCommercialModelAccess,
  type StoredByokProvider,
} from "./commercial-model-access.js";
import {
  CommercialApiClient,
  CommercialApiError,
  isModelWriteMethod,
} from "./commercial-api-client.js";
import type { CommercialModelCapabilitySnapshot } from "./commercial-contracts.js";
import {
  forwardedHeaders,
  requestByok,
} from "./commercial-model-protocols.js";
import {
  assertLocalAuthorization,
  assertLoopbackRequest,
  assertModelResponseContract,
  assistantModelSelectionFromBody,
  inferModelRole,
  isRetryableRequestFailure,
  isTimeoutAbort,
  isVideoCreatePath,
  normalizeModelSelectorHeader,
  normalizeRoleHeader,
  pipeModelResponse,
  prepareBodyForRoute,
  readModelRequestBody,
  shouldFallback,
  videoTaskId,
} from "./commercial-model-proxy-http.js";
import type { ModelRoute, PreparedBody } from "./commercial-model-route.js";

const RETRYABLE_ROUTE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ROUTE_ATTEMPTS = 3;
const MODEL_PROXY_REQUEST_TIMEOUT_MS = 30 * 60_000;

export interface CommercialModelRoutingConfiguration {
  access: StoredCommercialModelAccess;
  allowsCustomModels: boolean;
  cloudModelAssignments: readonly ByokModelAssignment[];
  explicitCloudModelAssignments?: readonly ByokModelAssignment[];
  modelCapabilities?: readonly CommercialModelCapabilitySnapshot[];
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

interface CommercialModelProxyOptions {
  requestTimeoutMs?: number;
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

function allowedVideoParameters(
  capability: CommercialModelCapabilitySnapshot | undefined,
): string[] {
  return [
    ...(capability?.videoExtraParameterNames ?? []),
    ...(capability?.videoSceneOptimizeOptions?.length
      ? ["scene_optimize"]
      : []),
    ...(capability?.videoSupportsHumanReview === true ? ["human_review"] : []),
  ];
}

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
    explicitCloudModelAssignments: [],
    modelCapabilities: [],
  };
  private readonly videoTaskRoutes = new Map<string, StickyVideoRoute>();
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly client: CommercialApiClient,
    private readonly deviceIdentity: CommercialDeviceSigner,
    private readonly audit: (entry: ModelRouteAuditEntry) => void = () => undefined,
    options: CommercialModelProxyOptions = {},
  ) {
    this.requestTimeoutMs = Math.max(
      1,
      Math.floor(options.requestTimeoutMs ?? MODEL_PROXY_REQUEST_TIMEOUT_MS),
    );
  }

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
      explicitCloudModelAssignments: (
        configuration.explicitCloudModelAssignments ?? []
      ).map((item) => ({ ...item })),
      modelCapabilities: (configuration.modelCapabilities ?? []).map((item) => ({
        ...item,
        ...(item.videoExtraParameterNames
          ? { videoExtraParameterNames: [...item.videoExtraParameterNames] }
          : {}),
      })),
    };
    const activeRoutes = BYOK_MODEL_ROLES.flatMap((role) =>
      configuredRoutes(this.routing, role),
    );
    const explicitCloudRoutes = BYOK_MODEL_ROLES.flatMap((role) =>
      configuredExplicitCloudRoutes(this.routing, role),
    );
    this.dropUnavailableVideoTaskRoutes([
      ...activeRoutes,
      ...explicitCloudRoutes,
    ]);
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
      const assistantSelection = assistantModelSelectionFromBody(
        rawBody,
        contentType,
        request.headers["x-ai-anime-request-surface"],
      );
      const assistantSelector = explicitSelector ?? assistantSelection?.selector ?? null;
      const role = explicitRole ?? inferModelRole(path);
      const requestedRoutes = this.routesForRequest(path, role, assistantSelector);
      const reasoningEffort = assistantSelection?.reasoningEffort ?? null;
      const routes = reasoningEffort
        ? requestedRoutes.filter((route) =>
            route.reasoningEfforts?.includes(reasoningEffort)
          )
        : requestedRoutes;
      if (routes.length === 0) {
        throw new CommercialApiError("当前模型不支持所选思考力度", {
          status: 422,
        });
      }
      const abortController = new AbortController();
      const abortUpstream = () => abortController.abort();
      request.once("aborted", abortUpstream);
      response.once("close", abortUpstream);
      const requestSignal = AbortSignal.any([
        abortController.signal,
        AbortSignal.timeout(this.requestTimeoutMs),
      ]);

      const upstream = await this.requestWithFallback({
        method,
        path,
        contentType,
        ...(rawBody === undefined ? {} : { rawBody }),
        routes,
        requestHeaders,
        reasoningEffort,
        signal: requestSignal,
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
    const selectable =
      selector?.startsWith("cloud:")
        ? uniqueRoutes([
            ...configured,
            ...configuredExplicitCloudRoutes(this.routing, role),
          ])
        : configured;
    const routes = selector
      ? selectable.filter((route) => route.selector === selector)
      : selectable;
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
    reasoningEffort: string | null;
    signal: AbortSignal;
  }): Promise<{ response: Response; route: ModelRoute; attempts: number }> {
    let lastError: unknown;
    let totalAttempts = 0;
    for (let index = 0; index < input.routes.length; index += 1) {
      const route = input.routes[index];
      if (!route) continue;
      const routeAttempts = isModelWriteMethod(input.method)
        ? 1
        : MAX_ROUTE_ATTEMPTS;
      for (let routeAttempt = 1; routeAttempt <= routeAttempts; routeAttempt += 1) {
        totalAttempts += 1;
        try {
          const prepared = await prepareBodyForRoute(
            input.rawBody,
            input.contentType,
            route.modelId,
            route.source === "cloud" && isVideoCreatePath(input.path),
            input.reasoningEffort,
            route.maxOutputTokens,
            allowedVideoParameters(
              this.routing.modelCapabilities?.find(
                (item) => item.modelId === route.modelId,
              ),
            ),
            route.parameterOverrides,
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
            routeAttempt < routeAttempts
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
          if (input.signal.aborted) {
            if (isTimeoutAbort(input.signal.reason)) {
              throw new CommercialApiError(
                `模型请求超过 ${Math.ceil(this.requestTimeoutMs / 60_000)} 分钟，已中止`,
                { status: 504, code: "MODEL_REQUEST_TIMEOUT" },
              );
            }
            throw error;
          }
          const thrownStatus =
            error instanceof CommercialApiError && error.status > 0
              ? error.status
              : undefined;
          const canFallbackBeforeRequest =
            route.source === "cloud" &&
            thrownStatus !== undefined &&
            index < input.routes.length - 1 &&
            shouldFallback(route, thrownStatus);
          if (canFallbackBeforeRequest) {
            // Cloud account/device authentication can fail before modelRequest
            // returns a Response. No provider invocation happened, so even a
            // write request can safely continue to the next configured route.
            this.auditRouteAttempt(
              route,
              totalAttempts,
              thrownStatus,
              "fallback",
              error,
            );
            break;
          }
          if (!isRetryableRequestFailure(error)) {
            // Deterministic client-side rejection (unparseable body, forbidden
            // field, bad protocol header). The body is identical on every
            // attempt and every route, so neither retrying nor falling back
            // can succeed — fail now instead of amplifying by 3×N.
            this.auditRouteAttempt(route, totalAttempts, undefined, "rejected", error);
            throw error;
          }
          if (routeAttempt < routeAttempts) {
            this.auditRouteAttempt(route, totalAttempts, undefined, "retry", error);
            await wait(150 * routeAttempt, undefined, { signal: input.signal });
            continue;
          }
          const canFallback =
            !isModelWriteMethod(input.method) &&
            index < input.routes.length - 1;
          this.auditRouteAttempt(
            route,
            totalAttempts,
            undefined,
            canFallback ? "fallback" : "error",
            error,
          );
          if (!canFallback) throw error;
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
      retryTransientFailures: false,
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
      ...effectiveModelRuntimeSettings(assignment),
    }));
  if (configuration.allowsCustomModels) {
    for (const provider of configuration.access.byokProviders) {
      if (!provider.enabled) continue;
      routes.push(...providerRoutes(provider, role));
    }
  }
  return routes.sort(compareModelRoutes);
}

function configuredExplicitCloudRoutes(
  configuration: CommercialModelRoutingConfiguration,
  role: ByokModelRole,
): ModelRoute[] {
  return (configuration.explicitCloudModelAssignments ?? [])
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
      ...effectiveModelRuntimeSettings(assignment),
    }))
    .sort(compareModelRoutes);
}

function uniqueRoutes(routes: readonly ModelRoute[]): ModelRoute[] {
  return Array.from(new Map(routes.map((route) => [route.key, route])).values());
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
        ...(route.contextWindow === undefined
          ? {}
          : { contextWindow: route.contextWindow }),
        ...(route.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: route.maxOutputTokens }),
        ...(route.reasoningEfforts?.length
          ? { reasoningEfforts: [...route.reasoningEfforts] }
          : {}),
        ...(route.defaultReasoningEffort
          ? { defaultReasoningEffort: route.defaultReasoningEffort }
          : {}),
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
      ...effectiveModelRuntimeSettings(assignment),
    }));
}
