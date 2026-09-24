// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";

import {
  parseCommercialAuthorizationWire,
  type CommercialAuthorizationWire,
} from "./commercial-contracts.js";
import { CommercialApiError } from "./commercial-api-error.js";
import { requiredText } from "./commercial-api-validation.js";
import {
  assertSuccessfulResponse,
  isAuthenticationFailure,
  isPermanentLoginFailure,
  normalizeGatewayBaseUrl,
  parseLoginResponse,
  parseLogoutResponse,
  parseRefreshResponse,
} from "./commercial-api-response.js";
import type {
  CommercialClientOptions,
  CommercialModelRequest,
  CommercialRememberedLoginStore,
  CommercialSessionStore,
  LoginResponse,
  RememberedCommercialLogin,
  RequestOptions,
  StoredCommercialRememberedLogin,
  StoredCommercialSession,
} from "./commercial-api-types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MODEL_TIMEOUT_MS = 30 * 60_000;
const MODEL_TRANSIENT_MAX_ATTEMPTS = 3;
const MODEL_TRANSIENT_STATUSES = new Set([502, 503, 504]);
export const REFRESH_SKEW_MS = 60_000;

export class CommercialApiTransport {
  readonly baseUrl: string;
  protected readonly sessionStore: CommercialSessionStore;
  protected readonly rememberedLoginStore: CommercialRememberedLoginStore | undefined;
  protected readonly fetchImpl: typeof fetch;
  protected readonly now: () => number;
  protected sessionCache: StoredCommercialSession | null | undefined;
  protected rememberedLoginCache: StoredCommercialRememberedLogin | null | undefined;
  protected sessionGeneration = 0;
  private refreshInFlight: {
    generation: number;
    promise: Promise<StoredCommercialSession>;
  } | null = null;
  private persistenceInFlight: Promise<void> = Promise.resolve();
  protected activeDeviceId: string | null = null;

  constructor(options: CommercialClientOptions) {
    this.baseUrl = normalizeGatewayBaseUrl(options.baseUrl);
    this.sessionStore = options.sessionStore;
    this.rememberedLoginStore = options.rememberedLoginStore;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  currentLicense(
    devicePublicKeyHash: string,
  ): Promise<CommercialAuthorizationWire> {
    return this.loadCurrentLicense(devicePublicKeyHash);
  }

  get currentSessionGeneration(): number {
    return this.sessionGeneration;
  }

  async modelInvocationSubject(): Promise<string> {
    const generation = this.sessionGeneration;
    const session = await this.requireSession();
    this.assertSessionGeneration(generation);
    return `${session.gatewayOrigin}|${session.tenant.id}|${session.user.id}`;
  }

  protected async loadCurrentLicense(
    devicePublicKeyHash: string,
  ): Promise<CommercialAuthorizationWire> {
    const generation = this.sessionGeneration;
    const value = parseCommercialAuthorizationWire(
      await this.authenticatedJson("GET", "/api/v1/client/licenses/current", {
        query: {
          devicePublicKeyHash: requiredText(
            devicePublicKeyHash,
            "devicePublicKeyHash",
          ),
        },
      }),
    );
    this.assertSessionGeneration(generation);
    this.activeDeviceId = value.device?.id ?? null;
    return value;
  }

  async modelRequest(input: CommercialModelRequest): Promise<Response> {
    const generation = this.sessionGeneration;
    const method = requiredText(input.method, "method").toUpperCase();
    const path = normalizeModelPath(input.path);
    let session = await this.requireFreshSession(generation);
    const requiresActivatedDevice = isModelWriteMethod(method)
      || isModelCatalogRead(method, path);
    if (requiresActivatedDevice && this.activeDeviceId === null) {
      await this.loadCurrentLicense(input.devicePublicKeyHash);
    }
    this.assertSessionGeneration(generation);
    const deviceId = this.activeDeviceId;
    if (requiresActivatedDevice && deviceId === null) {
      throw new CommercialApiError("当前设备尚未激活", { status: 403 });
    }
    const idempotencyKey = isModelWriteMethod(method)
      ? normalizeIdempotencyKey(
          new Headers(input.headers).get("Idempotency-Key") ?? randomUUID(),
        )
      : null;
    const execute = async (token: string) => {
      let response: Response | null = null;
      // 模型写请求已经进入服务端幂等协议，但重放策略由上层模型代理统一掌握：
      // 图片生成会以同一请求体和 Idempotency-Key 恢复原 Invocation，其他写请求
      // 仍保持单次。这里不做嵌套重试；无副作用的读取可独立重试。
      const maxAttempts =
        isModelWriteMethod(method) || input.retryTransientFailures === false
          ? 1
          : MODEL_TRANSIENT_MAX_ATTEMPTS;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        this.assertSessionGeneration(generation);
        response = await this.requestModelResponse({
          ...input,
          method,
          path,
          token,
          deviceId,
          idempotencyKey,
        });
        await this.checkResponseSession(response, generation);
        if (
          !MODEL_TRANSIENT_STATUSES.has(response.status) ||
          attempt === maxAttempts
        ) {
          return response;
        }
        await response.body?.cancel();
      }
      if (response === null) {
        throw new CommercialApiError("云端模型请求未执行");
      }
      return response;
    };
    let response = await execute(session.accessToken);
    if (response.status !== 401) return response;

    await response.body?.cancel();
    session = await this.refreshSession(session, generation);
    response = await execute(session.accessToken);
    if (response.status === 401 && this.sessionCache?.accessToken === session.accessToken) {
      await this.clearSession(generation);
    }
    return response;
  }

  protected async authenticatedJson(
    method: string,
    path: string,
    options: Omit<RequestOptions, "token"> = {},
  ): Promise<unknown> {
    const generation = this.sessionGeneration;
    const response = await this.authenticatedResponse(method, path, options);
    await assertSuccessfulResponse(response);
    this.assertSessionGeneration(generation);
    if (response.status === 204) return undefined;
    const text = await response.text();
    this.assertSessionGeneration(generation);
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CommercialApiError("Gateway 返回了无效 JSON", {
        status: response.status,
      });
    }
  }

  protected async authenticatedResponse(
    method: string,
    path: string,
    options: Omit<RequestOptions, "token"> = {},
  ): Promise<Response> {
    const generation = this.sessionGeneration;
    let session = await this.requireFreshSession(generation);

    const execute = async (token: string) => {
      this.assertSessionGeneration(generation);
      const response = await this.requestResponse(method, path, {
        ...options,
        token,
      });
      await this.checkResponseSession(response, generation);
      return response;
    };
    let response = await execute(session.accessToken);
    if (response.status !== 401) return response;

    await response.body?.cancel();
    session = await this.refreshSession(session, generation);
    response = await execute(session.accessToken);
    if (response.status === 401 && this.sessionCache?.accessToken === session.accessToken) {
      await this.clearSession(generation);
    }
    return response;
  }

  protected async requireFreshSession(
    generation = this.sessionGeneration,
  ): Promise<StoredCommercialSession> {
    let session = await this.requireSession();
    this.assertSessionGeneration(generation);
    if (session.expiresAtEpochMs <= this.now() + REFRESH_SKEW_MS) {
      session = await this.refreshSession(session, generation);
    }
    this.assertSessionGeneration(generation);
    return session;
  }

  protected assertSessionGeneration(generation: number): void {
    if (generation !== this.sessionGeneration) {
      throw new CommercialApiError("登录状态已变更，请重新操作", {
        status: 409,
        code: "SESSION_CHANGED",
      });
    }
  }

  private async checkResponseSession(response: Response, generation: number): Promise<void> {
    if (generation === this.sessionGeneration) return;
    await response.body?.cancel().catch(() => undefined);
    this.assertSessionGeneration(generation);
  }

  protected async requestModelResponse(
    input: CommercialModelRequest & {
      token: string;
      deviceId: string | null;
      idempotencyKey: string | null;
    },
  ): Promise<Response> {
    const url = new URL(input.path, `${this.baseUrl}/`);
    const sourceHeaders = new Headers(input.headers);
    const headers = new Headers();
    for (const name of [
      "accept",
      "content-type",
      "range",
      "anthropic-version",
      "anthropic-beta",
    ]) {
      const value = sourceHeaders.get(name);
      if (value) headers.set(name, value);
    }
    validateModelProtocolHeaders(input.method, input.path, headers);
    headers.set("Authorization", `Bearer ${input.token}`);
    if (input.deviceId !== null) {
      headers.set("X-Device-Id", String(input.deviceId));
    }
    if (input.idempotencyKey) {
      headers.set("Idempotency-Key", input.idempotencyKey);
    }
    const requestInit = {
      method: input.method,
      headers,
      ...(input.body === undefined ? {} : { body: input.body, duplex: "half" }),
      // Combine rather than fall back: callers always pass a signal, so a bare
      // `??` made the ceiling dead code and a hung cloud request had no
      // client-side backstop at all. Either source can now abort the request.
      signal: input.signal
        ? AbortSignal.any([input.signal, AbortSignal.timeout(MODEL_TIMEOUT_MS)])
        : AbortSignal.timeout(MODEL_TIMEOUT_MS),
    } as RequestInit & { duplex?: "half" };
    try {
      return await this.fetchImpl(url, requestInit);
    } catch (error) {
      throw new CommercialApiError(
        error instanceof Error ? error.message : "云端模型请求失败",
        { status: 0 },
      );
    }
  }

  protected async refreshSession(
    previous: StoredCommercialSession,
    generation = this.sessionGeneration,
  ): Promise<StoredCommercialSession> {
    this.assertSessionGeneration(generation);
    const current = await this.requireSession();
    this.assertSessionGeneration(generation);
    if (current.accessToken !== previous.accessToken) return current;
    if (this.refreshInFlight?.generation === generation) return this.refreshInFlight.promise;
    const promise = (async () => {
      try {
        const value = await this.requestJson(
          "POST",
          "/api/v1/client/auth/refresh",
          {
            token: previous.accessToken,
            body: { accessToken: previous.accessToken },
          },
        );
        const response = parseRefreshResponse(value);
        const session: StoredCommercialSession = {
          schemaVersion: 1,
          gatewayOrigin: this.baseUrl,
          accessToken: response.accessToken,
          expiresAtEpochMs: this.now() + response.expiresIn * 1000,
          user: previous.user,
          tenant: previous.tenant,
          ...(previous.rememberMe === undefined
            ? {}
            : { rememberMe: previous.rememberMe }),
          ...(previous.rememberedLogin
            ? { rememberedLogin: previous.rememberedLogin }
            : {}),
        };
        await this.replaceSession(session, generation);
        return session;
      } catch (error) {
        this.assertSessionGeneration(generation);
        if (!isAuthenticationFailure(error)) throw error;
        const storedRememberedLogin = await this.loadRememberedLogin();
        this.assertSessionGeneration(generation);
        const rememberedLogin = previous.rememberedLogin
          ?? (storedRememberedLogin
            && storedRememberedLogin.tenantCode === previous.tenant.code
            && storedRememberedLogin.username === previous.user.username
            ? {
                tenantCode: storedRememberedLogin.tenantCode,
                username: storedRememberedLogin.username,
                password: storedRememberedLogin.password,
              }
            : undefined);
        if (!rememberedLogin) {
          await this.clearSession(generation);
          throw error;
        }
        try {
          return await this.reauthenticate(rememberedLogin, previous, generation);
        } catch (reauthenticationError) {
          if (isPermanentLoginFailure(reauthenticationError)) {
            await this.clearSession(generation);
          }
          throw reauthenticationError;
        }
      }
    })();
    const flight = { generation, promise };
    this.refreshInFlight = flight;
    try {
      return await promise;
    } finally {
      if (this.refreshInFlight === flight) this.refreshInFlight = null;
    }
  }

  protected async reauthenticate(
    rememberedLogin: RememberedCommercialLogin,
    previous: StoredCommercialSession,
    generation: number,
  ): Promise<StoredCommercialSession> {
    this.assertSessionGeneration(generation);
    const value = await this.requestJson("POST", "/api/v1/client/auth/login", {
      body: {
        loginType: "PASSWORD",
        tenantCode: rememberedLogin.tenantCode,
        username: rememberedLogin.username,
        password: rememberedLogin.password,
        rememberMe: true,
      },
    });
    const session = this.createStoredSession(
      parseLoginResponse(value),
      rememberedLogin,
    );
    if (session.user.id !== previous.user.id || session.tenant.id !== previous.tenant.id) {
      await this.revokeToken(session.accessToken).catch(() => undefined);
      throw new CommercialApiError("自动登录账户与原会话不一致", { status: 401 });
    }
    await this.replaceSession(session, generation);
    await this.saveRememberedLogin(rememberedLogin, generation);
    return session;
  }

  protected async revokeToken(token: string): Promise<void> {
    parseLogoutResponse(
      await this.requestJson("POST", "/api/v1/client/auth/logout", { token }),
    );
  }

  protected createStoredSession(
    response: LoginResponse,
    rememberedLogin?: RememberedCommercialLogin,
  ): StoredCommercialSession {
    return {
      schemaVersion: 1,
      gatewayOrigin: this.baseUrl,
      accessToken: response.accessToken,
      expiresAtEpochMs: this.now() + response.expiresIn * 1000,
      user: response.user,
      tenant: response.tenant,
      rememberMe: Boolean(rememberedLogin),
      ...(rememberedLogin ? { rememberedLogin } : {}),
    };
  }

  protected async requireSession(): Promise<StoredCommercialSession> {
    const session = await this.loadSession();
    if (!session) throw new CommercialApiError("云端账户尚未登录", { status: 401 });
    return session;
  }

  protected async loadSession(): Promise<StoredCommercialSession | null> {
    if (this.sessionCache !== undefined) return this.sessionCache;
    const generation = this.sessionGeneration;
    const session = await this.sessionStore.load();
    if (generation !== this.sessionGeneration || this.sessionCache !== undefined) {
      return this.sessionCache ?? null;
    }
    if (session && session.gatewayOrigin !== this.baseUrl) {
      await this.clearSession(generation);
      return null;
    }
    this.sessionCache = session;
    if (session?.rememberedLogin) {
      await this.saveRememberedLogin(session.rememberedLogin, generation);
    }
    return session;
  }

  protected async loadRememberedLogin(): Promise<StoredCommercialRememberedLogin | null> {
    if (!this.rememberedLoginStore) return null;
    if (this.rememberedLoginCache !== undefined) return this.rememberedLoginCache;
    const generation = this.sessionGeneration;
    const remembered = await this.rememberedLoginStore.load();
    if (generation !== this.sessionGeneration || this.rememberedLoginCache !== undefined) {
      return this.rememberedLoginCache ?? null;
    }
    if (remembered && remembered.gatewayOrigin !== this.baseUrl) {
      await this.clearRememberedLogin(generation);
      return null;
    }
    this.rememberedLoginCache = remembered;
    return remembered;
  }

  protected async saveRememberedLogin(
    login: RememberedCommercialLogin,
    generation = this.sessionGeneration,
  ): Promise<void> {
    this.assertSessionGeneration(generation);
    if (!this.rememberedLoginStore) return;
    const stored: StoredCommercialRememberedLogin = {
      schemaVersion: 1,
      gatewayOrigin: this.baseUrl,
      tenantCode: login.tenantCode,
      username: login.username,
      password: login.password,
    };
    this.rememberedLoginCache = stored;
    await this.persist(() => this.rememberedLoginStore!.save(stored));
    this.assertSessionGeneration(generation);
  }

  protected async clearRememberedLogin(generation = this.sessionGeneration): Promise<void> {
    this.assertSessionGeneration(generation);
    this.rememberedLoginCache = null;
    await this.persist(async () => { await this.rememberedLoginStore?.clear(); });
    this.assertSessionGeneration(generation);
  }

  protected async replaceSession(
    session: StoredCommercialSession,
    generation = this.sessionGeneration,
  ): Promise<void> {
    this.assertSessionGeneration(generation);
    this.sessionCache = session;
    await this.persist(() => session.rememberMe === false
      ? this.sessionStore.clear()
      : this.sessionStore.save(session));
    this.assertSessionGeneration(generation);
  }

  protected async clearSession(generation = this.sessionGeneration): Promise<void> {
    if (generation !== this.sessionGeneration) return;
    // 登录/退出立即使旧请求失效；磁盘操作串行，避免慢写入覆盖较新的退出或登录。
    this.sessionGeneration += 1;
    this.sessionCache = null;
    this.activeDeviceId = null;
    this.refreshInFlight = null;
    await this.persist(() => this.sessionStore.clear());
  }

  private persist(operation: () => Promise<void>): Promise<void> {
    const pending = this.persistenceInFlight.then(operation);
    this.persistenceInFlight = pending.catch(() => undefined);
    return pending;
  }

  protected async requestJson(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const response = await this.requestResponse(method, path, options);
    await assertSuccessfulResponse(response);
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CommercialApiError("Gateway 返回了无效 JSON", {
        status: response.status,
      });
    }
  }

  protected async requestResponse(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ Accept: options.accept ?? "application/json" });
    if (options.billingClientVersion !== undefined) headers.set("X-Aigo-Client-Version", options.billingClientVersion);
    if (options.billingMaximumMicroPoints !== undefined) headers.set("X-Aigo-Max-Cost-Micro-Points", options.billingMaximumMicroPoints);
    if (options.billingOriginInvocationId !== undefined) headers.set("X-Aigo-Origin-Invocation-Id", options.billingOriginInvocationId);
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
    if (options.deviceId !== undefined) {
      headers.set("X-Device-Id", String(options.deviceId));
    }
    let body: BodyInit | undefined;
    if (options.formData !== undefined) {
      body = options.formData;
    } else if (options.rawBody !== undefined) {
      headers.set(
        "Content-Type",
        options.contentType ?? "application/octet-stream",
      );
      const rawBody = new ArrayBuffer(options.rawBody.byteLength);
      new Uint8Array(rawBody).set(options.rawBody);
      body = rawBody;
    } else if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }
    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)]) : AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法连接 Commercial Gateway",
      );
    }
  }
}

function normalizeModelPath(value: string): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path) {
    throw new CommercialApiError("模型请求路径无效", { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(path, "http://model-proxy.local");
  } catch {
    throw new CommercialApiError("模型请求路径无效", { status: 400 });
  }
  if (
    url.origin !== "http://model-proxy.local" ||
    (!url.pathname.startsWith("/v1/") &&
      url.pathname !== "/v1" &&
      !url.pathname.startsWith("/v1beta/") &&
      url.pathname !== "/v1beta")
  ) {
    throw new CommercialApiError("模型请求只能访问 Gateway /v1 或 /v1beta", {
      status: 400,
    });
  }
  for (const key of url.searchParams.keys()) {
    if (
      [
        "api_key",
        "apikey",
        "base_url",
        "authorization",
        "key",
        "x-goog-api-key",
      ].includes(key.toLowerCase())
    ) {
      throw new CommercialApiError(`云端模型请求禁止查询参数 ${key}`, {
        status: 400,
      });
    }
  }
  return `${url.pathname}${url.search}`;
}

export function isModelWriteMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

function isModelCatalogRead(method: string, path: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  const pathname = new URL(path, "http://model-proxy.local").pathname;
  return pathname === "/v1/models"
    || pathname.startsWith("/v1/models/")
    || pathname === "/v1beta/models"
    || pathname.startsWith("/v1beta/models/");
}

function validateModelProtocolHeaders(
  method: string,
  path: string,
  headers: Headers,
): void {
  const range = headers.get("range");
  if (range) {
    if (!new Set(["GET", "HEAD"]).has(method)) {
      throw new CommercialApiError("Range 只允许用于模型结果读取", {
        status: 400,
      });
    }
    if (!/^bytes=\d*-\d*$/.test(range.trim())) {
      throw new CommercialApiError("模型 Range 请求头无效", { status: 400 });
    }
  }

  const anthropicVersion = headers.get("anthropic-version");
  const anthropicBeta = headers.get("anthropic-beta");
  if (!anthropicVersion && !anthropicBeta) return;
  if (new URL(path, "http://model-proxy.local").pathname !== "/v1/messages") {
    throw new CommercialApiError("Anthropic 协议头只允许用于 /v1/messages", {
      status: 400,
    });
  }
  if (!anthropicVersion || !/^\d{4}-\d{2}-\d{2}$/.test(anthropicVersion)) {
    throw new CommercialApiError("anthropic-version 请求头无效", {
      status: 400,
    });
  }
  if (
    anthropicBeta &&
    (anthropicBeta.length > 512 ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:,\s*[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(
        anthropicBeta,
      ))
  ) {
    throw new CommercialApiError("anthropic-beta 请求头无效", {
      status: 400,
    });
  }
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new CommercialApiError("Idempotency-Key 不能为空", { status: 400 });
  }
  if (normalized.length > 255) {
    throw new CommercialApiError("Idempotency-Key 长度不能超过 255", {
      status: 400,
    });
  }
  return normalized;
}
