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
  InMemoryModelInvocationStore,
  type ModelInvocationIdentity,
  type ModelInvocationStore,
  type StoredModelInvocation,
  type StoredModelResponse,
} from "./commercial-model-invocation-store.js";
import {
  assertLocalAuthorization,
  assertLoopbackRequest,
  assertModelResponseContract,
  assistantModelSelectionFromBody,
  inferModelRole,
  isCloudModelSelector,
  isRetryableRequestFailure,
  isTimeoutAbort,
  isVideoCreatePath,
  modelRequestFingerprint,
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

function isImageWrite(method: string, path: string): boolean {
  if (!isModelWriteMethod(method)) return false;
  const pathname = new URL(path, "http://model-proxy.local").pathname;
  return pathname === "/v1/images/generations" || pathname === "/v1/images/edits";
}

function isRecoverableCloudImageWrite(method: string, path: string): boolean {
  return isImageWrite(method, path);
}

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
  invocationStore?: ModelInvocationStore;
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
const MODEL_CONTROL_PATH_PREFIX = "/v1/_aigo/";
const MODEL_TASK_CANCEL_PATH = /^\/v1\/_aigo\/model-invocations\/tasks\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/cancel$/i;

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
  private readonly imageInvocations = new Map<
    string,
    Promise<{ response: Response; route: ModelRoute; attempts: number }>
  >();
  private readonly requestTimeoutMs: number;
  private readonly invocationStore: ModelInvocationStore;

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
    this.invocationStore = options.invocationStore ?? new InMemoryModelInvocationStore();
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
        ...(item.extraParameterNames
          ? { extraParameterNames: [...item.extraParameterNames] }
          : {}),
        ...(item.audioResponseFormats
          ? { audioResponseFormats: [...item.audioResponseFormats] }
          : {}),
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
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
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
      const requestUrl = new URL(path, "http://model-proxy.local");
      const contentType = String(request.headers["content-type"] ?? "");
      const rawBody =
        method === "GET" || method === "HEAD"
          ? undefined
          : await readModelRequestBody(request, contentType);
      if (requestUrl.pathname.startsWith(MODEL_CONTROL_PATH_PREFIX)) {
        if (
          requestUrl.search ||
          requestUrl.hash ||
          !MODEL_TASK_CANCEL_PATH.test(requestUrl.pathname)
        ) {
          throw new CommercialApiError("任务调用取消路径无效", { status: 400 });
        }
        if (method !== "POST") {
          throw new CommercialApiError("任务调用取消只接受 POST", { status: 405 });
        }
        await this.handleTaskCancellation(path, rawBody, response);
        return;
      }

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

      const imageWrite = isImageWrite(method, path);
      const abortController = new AbortController();
      const abortUpstream = () => abortController.abort();
      if (!imageWrite) {
        request.once("aborted", abortUpstream);
        response.once("close", abortUpstream);
      }
      const requestSignal = imageWrite
        ? AbortSignal.timeout(this.requestTimeoutMs)
        : AbortSignal.any([
            abortController.signal,
            AbortSignal.timeout(this.requestTimeoutMs),
          ]);
      const requestInput = {
        method,
        path,
        contentType,
        ...(rawBody === undefined ? {} : { rawBody }),
        routes,
        requestHeaders,
        reasoningEffort,
        signal: requestSignal,
      };
      const upstream = imageWrite
        ? await this.requestIdempotentImageWrite({
            ...requestInput,
            role,
            selector: assistantSelector ?? "",
            taskId: normalizeTaskIdHeader(request.headers["x-ai-anime-task-id"]),
          })
        : await this.requestWithFallback(requestInput);
      if (response.destroyed) return;
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
      if (response.destroyed) return;
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

  private async requestIdempotentImageWrite(input: {
    method: string;
    path: string;
    contentType: string;
    rawBody?: Buffer;
    routes: readonly ModelRoute[];
    requestHeaders: IncomingMessage["headers"];
    reasoningEffort: string | null;
    signal: AbortSignal;
    role: ByokModelRole | null;
    selector: string;
    taskId: string;
  }): Promise<{ response: Response; route: ModelRoute; attempts: number }> {
    const idempotencyKey = normalizeIdempotencyKeyHeader(
      input.requestHeaders["idempotency-key"],
    );
    const subject = await this.client.modelInvocationSubject();
    const requestHash = await modelRequestFingerprint(
      input.method,
      input.path,
      input.contentType,
      input.rawBody,
      {
        role: input.role ?? "",
        selector: input.selector,
        reasoningEffort: input.reasoningEffort ?? "",
      },
    );
    const identity: ModelInvocationIdentity = {
      subject,
      operation: "IMAGE",
      idempotencyKey,
    };
    const initialRoute = input.routes[0];
    if (!initialRoute) {
      throw new CommercialApiError("图片模型没有可用路由", { status: 422 });
    }
    const claim = await this.invocationStore.claim({
      ...identity,
      requestHash,
      taskId: input.taskId,
      routeKey: initialRoute.key,
      routeSource: initialRoute.source,
    });
    if (claim.kind === "conflict") {
      throw new CommercialApiError(
        "同一 Idempotency-Key 已用于不同的图片请求参数",
        { status: 409, code: "IDEMPOTENCY_KEY_REUSED" },
      );
    }

    const pinnedRoute = claim.record.routeKey
      ? input.routes.find((route) => route.key === claim.record.routeKey)
      : initialRoute;
    if (!pinnedRoute) {
      throw new CommercialApiError("原图片调用路由已不可用，禁止切换供应商重放", {
        status: 409,
        code: "IDEMPOTENT_ROUTE_UNAVAILABLE",
      });
    }
    const sharedKey = modelInvocationMapKey(identity);
    const active = this.imageInvocations.get(sharedKey);
    if (active) {
      const result = await active;
      return { ...result, response: result.response.clone() };
    }

    const taskCancellation = input.taskId
      ? await this.invocationStore.taskCancellation(subject, input.taskId)
      : null;
    if (taskCancellation) {
      const cancelled = await this.invocationStore.requestCancellation(
        identity,
        taskCancellation.reason,
      );
      return this.cancelledImageResult(identity, cancelled, pinnedRoute);
    }
    if (claim.record.cancellationRequested) {
      return this.cancelledImageResult(identity, claim.record, pinnedRoute);
    }
    if (claim.record.routeSource === "byok") {
      if (claim.record.response) {
        return {
          response: responseFromStored(claim.record.response),
          route: pinnedRoute,
          attempts: 0,
        };
      }
      if (claim.record.state !== "PENDING") {
        return {
          response: unavailableByokReplayResponse(identity, claim.record),
          route: pinnedRoute,
          attempts: 0,
        };
      }
    }

    const execution = this.executeIdempotentImageWrite(
      input,
      identity,
      claim.record.routeKey ? [pinnedRoute] : input.routes,
    );
    this.imageInvocations.set(sharedKey, execution);
    try {
      const result = await execution;
      return { ...result, response: result.response.clone() };
    } finally {
      if (this.imageInvocations.get(sharedKey) === execution) {
        this.imageInvocations.delete(sharedKey);
      }
    }
  }

  private async executeIdempotentImageWrite(
    input: {
      method: string;
      path: string;
      contentType: string;
      rawBody?: Buffer;
      requestHeaders: IncomingMessage["headers"];
      reasoningEffort: string | null;
      signal: AbortSignal;
    },
    identity: ModelInvocationIdentity,
    routes: readonly ModelRoute[],
  ): Promise<{ response: Response; route: ModelRoute; attempts: number }> {
    const attempt: { route?: ModelRoute } = {};
    try {
      const upstream = await this.requestWithFallback({
        ...input,
        routes,
        beforeRouteRequest: async (route) => {
          attempt.route = route;
          const record = await this.invocationStore.markStarted(identity, route);
          if (record.cancellationRequested) {
            throw new CommercialApiError("图片调用已收到显式取消，未提交供应商", {
              status: 409,
              code: "INVOCATION_CANCELLED_BEFORE_DISPATCH",
            });
          }
        },
      });
      const buffered = await bufferRouteResponse(upstream);
      const stored = await storedResponse(buffered.response.clone());
      if (buffered.route.source === "cloud") {
        await this.invocationStore.complete(
          identity,
          buffered.response.ok
            ? "SUCCEEDED"
            : buffered.response.status >= 500
              ? "OUTCOME_UNKNOWN"
              : "FAILED",
          null,
        );
        return buffered;
      }
      if (buffered.response.status >= 500) {
        const unknown = byokOutcomeUnknownResponse(
          identity,
          buffered.response.status,
        );
        await this.invocationStore.complete(
          identity,
          "OUTCOME_UNKNOWN",
          await storedResponse(unknown.clone()),
        );
        return { ...buffered, response: unknown };
      }
      await this.invocationStore.complete(
        identity,
        buffered.response.ok ? "SUCCEEDED" : "FAILED",
        stored,
      );
      return buffered;
    } catch (error) {
      const activeRoute = attempt.route;
      if (activeRoute?.source === "byok" && isRetryableRequestFailure(error)) {
        const unknown = byokOutcomeUnknownResponse(identity, 0);
        await this.invocationStore.complete(
          identity,
          "OUTCOME_UNKNOWN",
          await storedResponse(unknown.clone()),
        );
        return { response: unknown, route: activeRoute, attempts: 1 };
      }
      throw error;
    }
  }

  private async cancelledImageResult(
    identity: ModelInvocationIdentity,
    record: StoredModelInvocation,
    route: ModelRoute,
  ): Promise<{ response: Response; route: ModelRoute; attempts: number }> {
    if (route.source === "cloud") {
      const state = await this.client.cancelInvocationByIdempotencyKey(
        identity.operation,
        identity.idempotencyKey,
        record.cancellationReason || "local project task was explicitly cancelled",
      );
      return {
        response: cancellationStateResponse(identity, "cloud", state.invocation?.status ?? "PENDING_CREATION", state.invocation?.quotaStatus ?? "NONE"),
        route,
        attempts: 0,
      };
    }
    return {
      response: cancellationStateResponse(identity, "byok", record.state, "PROVIDER_MANAGED"),
      route,
      attempts: 0,
    };
  }

  private async handleTaskCancellation(
    path: string,
    rawBody: Buffer | undefined,
    response: ServerResponse,
  ): Promise<void> {
    const pathname = new URL(path, "http://model-proxy.local").pathname;
    const match = MODEL_TASK_CANCEL_PATH.exec(pathname);
    if (!match?.[1]) {
      throw new CommercialApiError("本地任务 ID 无效", { status: 400 });
    }
    const taskId = match[1].toLowerCase();
    const body = parseControlBody(rawBody);
    const reason = requiredControlText(body.reason, "reason", 500);
    const subject = await this.client.modelInvocationSubject();
    await this.invocationStore.requestTaskCancellation(subject, taskId, reason);
    const records = await this.invocationStore.recordsForTask(subject, taskId);
    const states = [];
    for (const record of records) {
      const cancelled = await this.invocationStore.requestCancellation(record, reason);
      if (record.routeSource === "cloud") {
        try {
          const cloud = await this.client.cancelInvocationByIdempotencyKey(
            record.operation,
            record.idempotencyKey,
            reason,
          );
          states.push({
            idempotencyKey: record.idempotencyKey,
            source: "cloud",
            cancellationRequested: cloud.cancellationRequested,
            executionStatus: cloud.invocation?.status ?? "PENDING_CREATION",
            quotaStatus: cloud.invocation?.quotaStatus ?? "NONE",
            remoteCancellationStatus: "REQUESTED",
          });
        } catch (error) {
          states.push({
            idempotencyKey: record.idempotencyKey,
            source: "cloud",
            cancellationRequested: true,
            executionStatus: "CANCEL_REQUEST_FAILED",
            quotaStatus: "UNKNOWN",
            remoteCancellationStatus: "REQUEST_FAILED",
            error: error instanceof Error ? error.message : "cloud cancellation failed",
          });
        }
        continue;
      }
      states.push({
        idempotencyKey: cancelled.idempotencyKey,
        source: cancelled.routeSource || "pending",
        cancellationRequested: true,
        executionStatus: cancelled.state,
        quotaStatus: cancelled.routeSource === "byok" ? "PROVIDER_MANAGED" : "NONE",
        remoteCancellationStatus:
          cancelled.routeSource === "byok" ? "UNSUPPORTED_BY_PROXY" : "NOT_DISPATCHED",
      });
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ taskId, cancellationRequested: true, invocations: states }));
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
      selector && isCloudModelSelector(selector)
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
    beforeRouteRequest?: (route: ModelRoute) => Promise<void>;
  }): Promise<{ response: Response; route: ModelRoute; attempts: number }> {
    let lastError: unknown;
    let totalAttempts = 0;
    for (let index = 0; index < input.routes.length; index += 1) {
      const route = input.routes[index];
      if (!route) continue;
      const recoverableCloudImageWrite =
        route.source === "cloud" && isImageWrite(input.method, input.path);
      const routeAttempts =
        !isModelWriteMethod(input.method) || recoverableCloudImageWrite
          ? MAX_ROUTE_ATTEMPTS
          : 1;
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
          await input.beforeRouteRequest?.(route);
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
            shouldFallback(route, upstream.status) &&
            !(
              recoverableCloudImageWrite &&
              RETRYABLE_ROUTE_STATUSES.has(upstream.status)
            );
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
          // A BYOK transport failure has no response proving the request failed.
          // Do not replay an ambiguous write: provider idempotency is not guaranteed.
          const canRetryTransport =
            route.source === "cloud" || !isModelWriteMethod(input.method);
          if (canRetryTransport && routeAttempt < routeAttempts) {
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

function modelInvocationMapKey(identity: ModelInvocationIdentity): string {
  return `${identity.subject}\0${identity.operation}\0${identity.idempotencyKey}`;
}

function normalizeIdempotencyKeyHeader(
  value: string | string[] | undefined,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const key = String(raw ?? "").trim();
  if (!key || [...key].length > 255 || /[\u0000-\u001f\u007f]/u.test(key)) {
    throw new CommercialApiError("Idempotency-Key 无效", {
      status: 400,
      code: "INVALID_IDEMPOTENCY_KEY",
    });
  }
  return key;
}

function normalizeTaskIdHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const taskId = String(raw ?? "").trim().toLowerCase();
  if (!taskId) return "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(taskId)) {
    throw new CommercialApiError("本地任务 ID 无效", {
      status: 400,
      code: "INVALID_TASK_ID",
    });
  }
  return taskId;
}

function parseControlBody(rawBody: Buffer | undefined): Record<string, unknown> {
  if (!rawBody) {
    throw new CommercialApiError("任务取消请求体不能为空", { status: 400 });
  }
  try {
    const value = JSON.parse(rawBody.toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new CommercialApiError("任务取消请求体不是有效 JSON 对象", {
      status: 400,
    });
  }
}

function requiredControlText(
  value: unknown,
  name: string,
  maxLength: number,
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || [...text].length > maxLength) {
    throw new CommercialApiError(`${name} 必须为 1 到 ${maxLength} 个字符`, {
      status: 400,
    });
  }
  return text;
}

async function bufferRouteResponse(input: {
  response: Response;
  route: ModelRoute;
  attempts: number;
}): Promise<{ response: Response; route: ModelRoute; attempts: number }> {
  const body = Buffer.from(await input.response.arrayBuffer());
  return {
    ...input,
    response: new Response(body, {
      status: input.response.status,
      statusText: input.response.statusText,
      headers: input.response.headers,
    }),
  };
}

async function storedResponse(response: Response): Promise<StoredModelResponse> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    bodyBase64: Buffer.from(await response.arrayBuffer()).toString("base64"),
  };
}

function responseFromStored(response: StoredModelResponse): Response {
  return new Response(Buffer.from(response.bodyBase64, "base64"), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function unavailableByokReplayResponse(
  identity: ModelInvocationIdentity,
  record: StoredModelInvocation,
): Response {
  const outcomeUnknown =
    record.state === "IN_FLIGHT" || record.state === "OUTCOME_UNKNOWN";
  return modelInvocationErrorResponse(
    outcomeUnknown ? 502 : 409,
    outcomeUnknown
      ? "BYOK_EXECUTION_OUTCOME_UNKNOWN"
      : "IDEMPOTENT_RESULT_EXPIRED",
    outcomeUnknown
      ? "BYOK 图片调用的远端执行结果未知，已禁止自动重发或切换供应商"
      : "图片调用结果已过本地保留期，已禁止使用相同幂等键重新执行",
    identity,
    record.routeSource,
    record.state,
    record.routeSource === "byok" ? "PROVIDER_MANAGED" : "NONE",
  );
}

function byokOutcomeUnknownResponse(
  identity: ModelInvocationIdentity,
  upstreamStatus: number,
): Response {
  return modelInvocationErrorResponse(
    502,
    "BYOK_EXECUTION_OUTCOME_UNKNOWN",
    upstreamStatus > 0
      ? `BYOK 图片供应商返回 ${upstreamStatus}，执行结果可能已产生，已禁止自动重发`
      : "BYOK 图片请求在提交后失去明确响应，已禁止自动重发",
    identity,
    "byok",
    "OUTCOME_UNKNOWN",
    "PROVIDER_MANAGED",
  );
}

function cancellationStateResponse(
  identity: ModelInvocationIdentity,
  source: "cloud" | "byok",
  executionStatus: string,
  quotaStatus: string,
): Response {
  return modelInvocationErrorResponse(
    409,
    source === "cloud"
      ? "INVOCATION_CANCEL_REQUESTED"
      : "BYOK_REMOTE_CANCEL_UNSUPPORTED",
    source === "cloud"
      ? "图片调用已记录显式取消意图"
      : "图片调用已在本地标记取消；BYOK 供应商不保证远端终止",
    identity,
    source,
    executionStatus,
    quotaStatus,
  );
}

function modelInvocationErrorResponse(
  status: number,
  code: string,
  message: string,
  identity: ModelInvocationIdentity,
  source: string,
  executionStatus: string,
  quotaStatus: string,
): Response {
  return new Response(
    JSON.stringify({
      error: { message, type: "invocation_state_error", code },
      invocation: {
        operation: identity.operation,
        idempotencyKey: identity.idempotencyKey,
        source,
        executionStatus,
        quotaStatus,
      },
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-AI-Idempotency-Key": identity.idempotencyKey,
      },
    },
  );
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
