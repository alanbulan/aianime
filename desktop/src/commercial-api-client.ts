// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";

import type { CommercialDeviceSigner } from "./commercial-device.js";
import { authorizationDeviceId } from "./commercial-contracts.js";
import {
  clearEncryptedFile,
  readEncryptedJsonFile,
  writeEncryptedJsonFile,
  type SecureStorageAdapter,
} from "./secure-file-store.js";

export type { SecureStorageAdapter } from "./secure-file-store.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MODEL_TIMEOUT_MS = 30 * 60_000;
const MODEL_TRANSIENT_MAX_ATTEMPTS = 3;
const MODEL_TRANSIENT_STATUSES = new Set([502, 503, 504]);
const REFRESH_SKEW_MS = 60_000;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_CAPTCHA_BYTES = 512 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const COMMERCIAL_GATEWAY_URL = "https://aianime.122-193-11-199.sslip.io";
export const COMMERCIAL_RUNTIME_DEPENDENCIES_URL =
  `${COMMERCIAL_GATEWAY_URL}/api/v1/client/runtime-dependencies`;

type Identifier = string | number;
type QueryValue = string | number | boolean | null | undefined;

export interface CommercialUser {
  id: Identifier;
  username: string;
  nickname?: string;
  email?: string;
  avatar?: string;
}

export interface CommercialUserProfile {
  id: Identifier;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  gender: 0 | 1 | 2;
  avatar: string;
  status: number;
  deptId: Identifier;
  deptName: string;
  profileDescription: string;
}

export interface CommercialProfileUpdateInput {
  nickname: string;
  email: string;
  phone: string;
  gender: 0 | 1 | 2;
  profileDescription: string;
}

export interface CommercialAvatarUploadInput {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface CommercialProtectedImage {
  contentType: string;
  dataUrl: string;
}

export interface CommercialPasswordResetVerification {
  resetTicket: string;
  expiresIn: number;
}

export interface CommercialTenant {
  id: Identifier;
  code: string;
  name: string;
  isSystem?: boolean;
}

export interface CommercialSessionSummary {
  authenticated: true;
  expiresAtEpochMs: number;
  user: CommercialUser;
  tenant: CommercialTenant;
}

export interface CommercialLoginInput {
  tenantCode: string;
  username: string;
  password: string;
  rememberMe?: boolean;
  captchaKey?: string;
  captchaCode?: string;
}

export interface CommercialRememberedLoginInput {
  rememberMe?: boolean;
  captchaKey?: string;
  captchaCode?: string;
}

export interface CommercialRememberedLoginSummary {
  tenantCode: string;
  username: string;
  hasPassword: true;
}

export interface CommercialRegistrationInput {
  tenantCode: string;
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  captchaKey?: string;
  captchaCode?: string;
}

export interface CommercialBootstrapQuery {
  modelOperation?: string;
  currentVersion?: string;
  target?: string;
  arch?: string;
}

interface CommercialBootstrapRequestQuery extends CommercialBootstrapQuery {
  devicePublicKeyHash: string;
}

export interface CommercialModelCatalogQuery {
  operation?: string;
  catalogVersion?: string;
}

export interface CommercialInvocationQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  operation?: string;
  modelSkuCode?: string;
}

export interface CommercialReleaseQuery {
  currentVersion: string;
  target: string;
  arch: string;
}

export interface CommercialReleaseUpdateFeed {
  url: string;
  requestHeaders: Readonly<Record<string, string>>;
}

export interface CommercialLicenseActivationInput {
  licenseId: Identifier;
  device: CommercialDeviceSigner;
  deviceName: string;
  platform: string;
  arch: string;
  clientVersion: string;
}

export interface CommercialPublicLogo {
  contentType: string;
  dataUrl: string;
}

export interface CommercialCaptcha {
  key: string;
  imageDataUrl: string;
}

export interface CommercialGatewayStatus {
  configured: boolean;
  gatewayOrigin: string;
}

interface RememberedCommercialLogin {
  tenantCode: string;
  username: string;
  password: string;
}

export interface StoredCommercialRememberedLogin {
  schemaVersion: 1;
  gatewayOrigin: string;
  tenantCode: string;
  username: string;
  password: string;
}

export interface StoredCommercialSession {
  schemaVersion: 1;
  gatewayOrigin: string;
  accessToken: string;
  expiresAtEpochMs: number;
  user: CommercialUser;
  tenant: CommercialTenant;
  rememberMe?: boolean;
  rememberedLogin?: RememberedCommercialLogin;
}

export interface CommercialSessionStore {
  load(): Promise<StoredCommercialSession | null>;
  save(session: StoredCommercialSession): Promise<void>;
  clear(): Promise<void>;
}

export interface CommercialRememberedLoginStore {
  load(): Promise<StoredCommercialRememberedLogin | null>;
  save(login: StoredCommercialRememberedLogin): Promise<void>;
  clear(): Promise<void>;
}

interface CommercialClientOptions {
  baseUrl: string;
  sessionStore: CommercialSessionStore;
  rememberedLoginStore?: CommercialRememberedLoginStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: CommercialUser;
  tenant: CommercialTenant;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
  user?: CommercialUser;
  tenant?: CommercialTenant;
}

interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  rawBody?: Uint8Array;
  formData?: FormData;
  contentType?: string;
  token?: string;
  deviceId?: Identifier;
  accept?: string;
}

export interface CommercialModelRequest {
  method: string;
  path: string;
  headers?: HeadersInit;
  body?: BodyInit;
  devicePublicKeyHash: string;
  signal?: AbortSignal;
}

export class CommercialApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    message: string,
    options: { status?: number; code?: string | null; requestId?: string | null } = {},
  ) {
    super(message);
    this.name = "CommercialApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? null;
    this.requestId = options.requestId ?? null;
  }
}

export class EncryptedFileCommercialSessionStore
  implements CommercialSessionStore
{
  constructor(
    private readonly filePath: string,
    private readonly secureStorage: SecureStorageAdapter,
  ) {}

  async load(): Promise<StoredCommercialSession | null> {
    try {
      return await readEncryptedJsonFile(
        this.filePath,
        this.secureStorage,
        parseStoredSession,
      );
    } catch (error) {
      if (error instanceof CommercialApiError) throw error;
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法读取云端会话",
      );
    }
  }

  async save(session: StoredCommercialSession): Promise<void> {
    try {
      await writeEncryptedJsonFile(this.filePath, this.secureStorage, session);
    } catch (error) {
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法保存云端会话",
      );
    }
  }

  async clear(): Promise<void> {
    await clearEncryptedFile(this.filePath);
  }
}

export class EncryptedFileCommercialRememberedLoginStore
  implements CommercialRememberedLoginStore
{
  constructor(
    private readonly filePath: string,
    private readonly secureStorage: SecureStorageAdapter,
  ) {}

  async load(): Promise<StoredCommercialRememberedLogin | null> {
    try {
      return await readEncryptedJsonFile(
        this.filePath,
        this.secureStorage,
        parseStoredRememberedLogin,
      );
    } catch (error) {
      if (error instanceof CommercialApiError) throw error;
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法读取已记住的登录信息",
      );
    }
  }

  async save(login: StoredCommercialRememberedLogin): Promise<void> {
    try {
      await writeEncryptedJsonFile(this.filePath, this.secureStorage, login);
    } catch (error) {
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法保存登录信息",
      );
    }
  }

  async clear(): Promise<void> {
    await clearEncryptedFile(this.filePath);
  }
}

export class CommercialApiClient {
  readonly baseUrl: string;
  private readonly sessionStore: CommercialSessionStore;
  private readonly rememberedLoginStore: CommercialRememberedLoginStore | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private sessionCache: StoredCommercialSession | null | undefined;
  private rememberedLoginCache: StoredCommercialRememberedLogin | null | undefined;
  private refreshInFlight: Promise<StoredCommercialSession> | null = null;
  private activeDeviceId: Identifier | null = null;

  constructor(options: CommercialClientOptions) {
    this.baseUrl = normalizeGatewayBaseUrl(options.baseUrl);
    this.sessionStore = options.sessionStore;
    this.rememberedLoginStore = options.rememberedLoginStore;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async publicConfig(tenantCode: string): Promise<unknown> {
    return this.requestJson("GET", "/api/v1/config/public", {
      query: { tenantCode: requiredText(tenantCode, "tenantCode") },
    });
  }

  async publicLogo(tenantCode: string): Promise<CommercialPublicLogo> {
    const response = await this.requestResponse("GET", "/api/v1/config/logo", {
      query: { tenantCode: requiredText(tenantCode, "tenantCode") },
      accept: "image/*",
    });
    await assertSuccessfulResponse(response);
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim();
    if (!contentType?.startsWith("image/")) {
      throw new CommercialApiError("Gateway 返回的 Logo 不是图片", {
        status: response.status,
      });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) {
      throw new CommercialApiError("Gateway 返回的 Logo 大小无效", {
        status: response.status,
      });
    }
    return {
      contentType,
      dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
    };
  }

  async publicCaptcha(tenantCode: string): Promise<CommercialCaptcha> {
    const value = requiredRecord(
      await this.requestJson("GET", "/api/v1/auth/captcha", {
        query: { tenantCode: requiredText(tenantCode, "tenantCode") },
      }),
      "captcha response",
    );
    const key = requiredText(value.key, "captcha.key");
    const svg = requiredText(value.svg, "captcha.svg");
    if (
      Buffer.byteLength(svg, "utf8") > MAX_CAPTCHA_BYTES ||
      !/^\s*<svg(?:\s|>)/i.test(svg)
    ) {
      throw new CommercialApiError("Gateway 返回了无效的图形验证码");
    }
    return {
      key,
      imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    };
  }

  async login(input: CommercialLoginInput): Promise<CommercialSessionSummary> {
    const tenantCode = requiredText(input.tenantCode, "tenantCode");
    const username = requiredText(input.username, "username");
    const password = requiredRawText(input.password, "password");
    const body = compactObject({
      tenantCode,
      username,
      password,
      rememberMe: input.rememberMe,
      captchaKey: optionalText(input.captchaKey),
      captchaCode: optionalText(input.captchaCode),
    });
    const value = await this.requestJson("POST", "/api/v1/client/auth/login", {
      body,
    });
    const response = parseLoginResponse(value);
    const session = this.createStoredSession(
      response,
      input.rememberMe === true
        ? { tenantCode, username, password }
        : undefined,
    );
    try {
      await this.replaceSession(session);
      if (session.rememberedLogin) {
        await this.saveRememberedLogin(session.rememberedLogin);
      } else {
        await this.clearRememberedLogin();
      }
    } catch (error) {
      await this.clearSession().catch(() => undefined);
      await this.revokeToken(response.accessToken).catch(() => undefined);
      throw error;
    }
    return toSessionSummary(session);
  }

  async rememberedLogin(): Promise<CommercialRememberedLoginSummary | null> {
    const remembered = await this.loadRememberedLogin();
    if (!remembered) return null;
    return {
      tenantCode: remembered.tenantCode,
      username: remembered.username,
      hasPassword: true,
    };
  }

  async loginRemembered(
    input: CommercialRememberedLoginInput = {},
  ): Promise<CommercialSessionSummary> {
    const remembered = await this.loadRememberedLogin();
    if (!remembered) {
      throw new CommercialApiError("没有可用的已保存登录信息", { status: 401 });
    }
    try {
      return await this.login({
        tenantCode: remembered.tenantCode,
        username: remembered.username,
        password: remembered.password,
        rememberMe: input.rememberMe !== false,
        ...(input.captchaKey === undefined
          ? {}
          : { captchaKey: input.captchaKey }),
        ...(input.captchaCode === undefined
          ? {}
          : { captchaCode: input.captchaCode }),
      });
    } catch (error) {
      if (isPermanentLoginFailure(error)) {
        await this.clearRememberedLogin();
      }
      throw error;
    }
  }

  async register(input: CommercialRegistrationInput): Promise<void> {
    await this.requestJson("POST", "/api/v1/auth/register", {
      body: compactObject({
        tenantCode: requiredText(input.tenantCode, "tenantCode"),
        username: requiredText(input.username, "username"),
        password: requiredRawText(input.password, "password"),
        nickname: optionalText(input.nickname),
        email: optionalText(input.email),
        captchaKey: optionalText(input.captchaKey),
        captchaCode: optionalText(input.captchaCode),
      }),
    });
  }

  async restoreSession(): Promise<CommercialSessionSummary | null> {
    const session = await this.loadSession();
    if (!session) return null;
    if (session.expiresAtEpochMs > this.now() + REFRESH_SKEW_MS) {
      return toSessionSummary(session);
    }
    try {
      return toSessionSummary(await this.refreshSession(session));
    } catch (error) {
      if (isAuthenticationFailure(error) || isPermanentLoginFailure(error)) {
        await this.clearSession();
        if (isPermanentLoginFailure(error)) {
          await this.clearRememberedLogin();
        }
        return null;
      }
      return toSessionSummary(session);
    }
  }

  async logout(): Promise<{ remoteRevoked: boolean }> {
    const session = await this.loadSession();
    let remoteRevoked = false;
    try {
      if (session) {
        await this.requestJson("POST", "/api/v1/client/auth/logout", {
          token: session.accessToken,
        });
        remoteRevoked = true;
      }
    } catch {
      remoteRevoked = false;
    } finally {
      if (session?.rememberedLogin) {
        await this.saveRememberedLogin(session.rememberedLogin);
      }
      await this.clearSession();
    }
    return { remoteRevoked };
  }

  async currentProfile(): Promise<CommercialUserProfile> {
    const profile = parseUserProfile(
      await this.authenticatedJson("GET", "/api/v1/user/profile"),
    );
    const session = await this.requireSession();
    await this.replaceSession({
      ...session,
      user: {
        id: profile.id,
        username: profile.username,
        ...(profile.nickname ? { nickname: profile.nickname } : {}),
        ...(profile.email ? { email: profile.email } : {}),
        ...(profile.avatar ? { avatar: profile.avatar } : {}),
      },
    });
    return profile;
  }

  async updateProfile(
    input: CommercialProfileUpdateInput,
  ): Promise<CommercialUserProfile> {
    await this.authenticatedJson("PUT", "/api/v1/user/profile", {
      body: {
        nickname: boundedText(input.nickname, "nickname", 64),
        email: boundedText(input.email, "email", 255),
        phone: boundedText(input.phone, "phone", 32),
        gender: profileGender(input.gender),
        profileDescription: boundedText(
          input.profileDescription,
          "profileDescription",
          1_000,
        ),
      },
    });
    return this.currentProfile();
  }

  async currentAvatar(): Promise<CommercialProtectedImage> {
    const response = await this.authenticatedResponse(
      "GET",
      "/api/v1/user/avatar",
      { accept: "image/*" },
    );
    await assertSuccessfulResponse(response);
    return protectedImageData(response, "头像");
  }

  async uploadAvatar(input: CommercialAvatarUploadInput): Promise<unknown> {
    const contentType = requiredText(input.contentType, "contentType").toLowerCase();
    if (!AVATAR_CONTENT_TYPES.has(contentType)) {
      throw new CommercialApiError("头像只支持 JPEG、PNG 或 WebP");
    }
    const bytes = Buffer.from(input.bytes);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
      throw new CommercialApiError("头像大小必须在 1 字节到 5 MiB 之间");
    }
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([bytes], { type: contentType }),
      requiredText(input.fileName, "fileName"),
    );
    return this.authenticatedJson("POST", "/api/v1/user/avatar", { formData });
  }

  async deleteAvatar(): Promise<void> {
    await this.authenticatedJson("DELETE", "/api/v1/user/avatar");
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const session = await this.requireSession();
    const remembered = await this.loadRememberedLogin();
    const normalizedNewPassword = requiredRawText(newPassword, "newPassword");
    await this.authenticatedJson("PUT", "/api/v1/user/password", {
      body: {
        oldPassword: requiredRawText(oldPassword, "oldPassword"),
        newPassword: normalizedNewPassword,
      },
    });
    if (
      remembered
      && remembered.tenantCode === session.tenant.code
      && remembered.username === session.user.username
    ) {
      await this.saveRememberedLogin({
        tenantCode: remembered.tenantCode,
        username: remembered.username,
        password: normalizedNewPassword,
      });
    }
    await this.clearSession();
  }

  async sendPasswordResetCode(tenantCode: string, email: string): Promise<void> {
    await this.requestJson("POST", "/api/v1/auth/email-code", {
      body: {
        tenantCode: requiredText(tenantCode, "tenantCode"),
        email: requiredText(email, "email"),
        scene: "reset",
      },
    });
  }

  async verifyPasswordResetCode(
    tenantCode: string,
    email: string,
    code: string,
  ): Promise<CommercialPasswordResetVerification> {
    const response = requiredRecord(
      await this.requestJson("POST", "/api/v1/auth/reset-password/verify", {
        body: {
          tenantCode: requiredText(tenantCode, "tenantCode"),
          email: requiredText(email, "email"),
          code: requiredText(code, "code"),
        },
      }),
      "password reset verification",
    );
    return {
      resetTicket: requiredText(response.resetTicket, "resetTicket"),
      expiresIn: positiveNumber(response.expiresIn, "expiresIn"),
    };
  }

  async resetPassword(
    tenantCode: string,
    resetTicket: string,
    newPassword: string,
  ): Promise<void> {
    await this.requestJson("POST", "/api/v1/auth/reset-password", {
      body: {
        tenantCode: requiredText(tenantCode, "tenantCode"),
        resetTicket: requiredText(resetTicket, "resetTicket"),
        newPassword: requiredRawText(newPassword, "newPassword"),
      },
    });
    const remembered = await this.loadRememberedLogin();
    if (remembered?.tenantCode === tenantCode.trim()) {
      await this.clearRememberedLogin();
    }
  }

  bootstrap(
    query: CommercialBootstrapRequestQuery,
    deviceId?: Identifier,
  ): Promise<unknown> {
    return this.authenticatedJson("GET", "/api/v1/client/bootstrap", {
      query: compactObject({
        devicePublicKeyHash: optionalText(query.devicePublicKeyHash),
        modelOperation: optionalText(query.modelOperation),
        currentVersion: optionalText(query.currentVersion),
        target: optionalText(query.target),
        arch: optionalText(query.arch),
      }),
      ...(deviceId === undefined ? {} : { deviceId }),
    });
  }

  quotaBalance(): Promise<unknown> {
    return this.authenticatedJson("GET", "/api/v1/client/quota/balance");
  }

  modelCatalog(
    query: CommercialModelCatalogQuery = {},
    deviceId?: Identifier,
  ): Promise<unknown> {
    return this.authenticatedJson("GET", "/api/v1/client/models", {
      query: compactObject({
        operation: optionalText(query.operation),
        catalogVersion: optionalText(query.catalogVersion),
      }),
      ...(deviceId === undefined ? {} : { deviceId }),
    });
  }

  modelDetails(sku: string, deviceId?: Identifier): Promise<unknown> {
    return this.authenticatedJson(
      "GET",
      `/api/v1/client/models/${encodeURIComponent(requiredText(sku, "sku"))}`,
      deviceId === undefined ? {} : { deviceId },
    );
  }

  currentLicense(devicePublicKeyHash: string): Promise<unknown> {
    return this.loadCurrentLicense(devicePublicKeyHash);
  }

  private async loadCurrentLicense(devicePublicKeyHash: string): Promise<unknown> {
    const value = await this.authenticatedJson("GET", "/api/v1/client/licenses/current", {
      query: {
        devicePublicKeyHash: requiredText(
          devicePublicKeyHash,
          "devicePublicKeyHash",
        ),
      },
    });
    try {
      this.activeDeviceId = authorizationDeviceId(value);
    } catch {
      this.activeDeviceId = null;
    }
    return value;
  }

  async activateLicense(input: CommercialLicenseActivationInput): Promise<unknown> {
    const requestId = randomUUID();
    const device = await input.device.summary();
    const challengeValue = requiredRecord(
      await this.authenticatedJson(
        "POST",
        "/api/v1/client/licenses/challenge",
        {
          body: {
            licenseId: input.licenseId,
            publicKeyHash: device.publicKeyHash,
            requestId,
          },
        },
      ),
      "license challenge",
    );
    const signatureAlgorithm = requiredText(
      challengeValue.signatureAlgorithm,
      "challenge.signatureAlgorithm",
    );
    if (signatureAlgorithm !== "Ed25519") {
      throw new CommercialApiError(
        `不支持的设备签名算法：${signatureAlgorithm}`,
      );
    }
    const message = requiredRawText(challengeValue.message, "challenge.message");
    const challengeSignature = await input.device.signMessage(message);
    return this.authenticatedJson(
      "POST",
      "/api/v1/client/licenses/activate",
      {
        body: {
          licenseId: input.licenseId,
          publicKey: device.publicKey,
          publicKeyHash: device.publicKeyHash,
          deviceName: requiredText(input.deviceName, "deviceName"),
          platform: requiredText(input.platform, "platform"),
          arch: requiredText(input.arch, "arch"),
          clientVersion: requiredText(input.clientVersion, "clientVersion"),
          challengeId: requiredText(challengeValue.id, "challenge.id"),
          challenge: requiredText(
            challengeValue.challenge,
            "challenge.challenge",
          ),
          challengeSignature,
          requestId,
        },
      },
    );
  }

  refreshLicenseLease(activationId: Identifier): Promise<unknown> {
    return this.authenticatedJson(
      "POST",
      "/api/v1/client/licenses/lease/refresh",
      { body: { activationId } },
    );
  }

  deactivateLicense(activationId: Identifier, reason: string): Promise<unknown> {
    return this.authenticatedJson(
      "POST",
      "/api/v1/client/licenses/deactivate",
      {
        body: {
          activationId: requiredIdentifier(activationId, "activationId"),
          reason: requiredText(reason, "reason"),
          confirmed: true,
        },
      },
    );
  }

  async modelRequest(input: CommercialModelRequest): Promise<Response> {
    const method = requiredText(input.method, "method").toUpperCase();
    const path = normalizeModelPath(input.path);
    let session = await this.requireFreshSession();
    if (isModelWriteMethod(method) && this.activeDeviceId === null) {
      await this.loadCurrentLicense(input.devicePublicKeyHash);
    }
    const deviceId = this.activeDeviceId;
    if (isModelWriteMethod(method) && deviceId === null) {
      throw new CommercialApiError("当前设备尚未激活", { status: 403 });
    }
    const idempotencyKey = isModelWriteMethod(method)
      ? normalizeIdempotencyKey(
          new Headers(input.headers).get("Idempotency-Key") ?? randomUUID(),
        )
      : null;
    const execute = async (token: string) => {
      let response: Response | null = null;
      // 模型写请求已经进入服务端幂等协议。收到 502/503/504 后直接重放，
      // 可能命中仍在处理且尚无可复用结果的 Invocation，并把原始故障覆盖成 409。
      // 写请求保留原始响应，由上层决定是否按 Invocation 状态恢复；
      // 只有无副作用的读取可以自动重试。
      const maxAttempts = isModelWriteMethod(method)
        ? 1
        : MODEL_TRANSIENT_MAX_ATTEMPTS;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        response = await this.requestModelResponse({
          ...input,
          method,
          path,
          token,
          deviceId,
          idempotencyKey,
        });
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

    const latest = await this.loadSession();
    session =
      latest && latest.accessToken !== session.accessToken
        ? latest
        : await this.refreshSession(session);
    response = await execute(session.accessToken);
    if (response.status === 401) await this.clearSession();
    return response;
  }

  announcements(limit = 20): Promise<unknown> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new CommercialApiError("limit 必须是 1 到 100 之间的整数");
    }
    return this.authenticatedJson(
      "GET",
      "/api/v1/client/announcements/active",
      { query: { limit } },
    );
  }

  listInvocations(query: CommercialInvocationQuery = {}): Promise<unknown> {
    return this.authenticatedJson(
      "GET",
      "/api/v1/client/relay/invocations",
      {
        query: compactObject({
          page: query.page,
          pageSize: query.pageSize,
          status: optionalText(query.status),
          operation: optionalText(query.operation),
          modelSkuCode: optionalText(query.modelSkuCode),
        }),
      },
    );
  }

  invocationDetails(id: Identifier): Promise<unknown> {
    return this.authenticatedJson(
      "GET",
      `/api/v1/client/relay/invocations/${encodeURIComponent(String(requiredIdentifier(id, "id")))}`,
    );
  }

  cancelInvocation(id: Identifier, reason: string): Promise<unknown> {
    return this.authenticatedJson(
      "POST",
      `/api/v1/client/relay/invocations/${encodeURIComponent(String(requiredIdentifier(id, "id")))}/cancel`,
      { body: { reason: requiredText(reason, "reason") } },
    );
  }

  async invocationResult(id: Identifier): Promise<Response> {
    const response = await this.authenticatedResponse(
      "GET",
      `/api/v1/client/relay/invocations/${encodeURIComponent(String(requiredIdentifier(id, "id")))}/result`,
      { accept: "application/octet-stream" },
    );
    await assertSuccessfulResponse(response);
    return response;
  }

  checkRelease(query: CommercialReleaseQuery): Promise<unknown> {
    return this.authenticatedJson("GET", "/api/v1/client/releases/check", {
      query: {
        currentVersion: requiredText(query.currentVersion, "currentVersion"),
        target: requiredText(query.target, "target"),
        arch: requiredText(query.arch, "arch"),
      },
    });
  }

  async releaseUpdateFeed(
    artifactId: Identifier,
  ): Promise<CommercialReleaseUpdateFeed> {
    const session = await this.requireFreshSession();
    const url = new URL("/api/v1/client/releases/updater/", `${this.baseUrl}/`);
    url.searchParams.set(
      "artifactId",
      String(requiredIdentifier(artifactId, "artifactId")),
    );
    return {
      url: url.toString(),
      requestHeaders: {
        Authorization: `Bearer ${session.accessToken}`,
        "Cache-Control": "no-cache",
      },
    };
  }

  private async authenticatedJson(
    method: string,
    path: string,
    options: Omit<RequestOptions, "token"> = {},
  ): Promise<unknown> {
    const response = await this.authenticatedResponse(method, path, options);
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

  private async authenticatedResponse(
    method: string,
    path: string,
    options: Omit<RequestOptions, "token"> = {},
  ): Promise<Response> {
    let session = await this.requireSession();
    if (session.expiresAtEpochMs <= this.now() + REFRESH_SKEW_MS) {
      session = await this.refreshSession(session);
    }

    const execute = (token: string) =>
      this.requestResponse(method, path, {
        ...options,
        token,
      });
    let response = await execute(session.accessToken);
    if (response.status !== 401) return response;

    const latest = await this.loadSession();
    session =
      latest && latest.accessToken !== session.accessToken
        ? latest
        : await this.refreshSession(session);
    response = await execute(session.accessToken);
    if (response.status === 401) {
      await this.clearSession();
    }
    return response;
  }

  private async requireFreshSession(): Promise<StoredCommercialSession> {
    let session = await this.requireSession();
    if (session.expiresAtEpochMs <= this.now() + REFRESH_SKEW_MS) {
      session = await this.refreshSession(session);
    }
    return session;
  }

  private async requestModelResponse(
    input: CommercialModelRequest & {
      token: string;
      deviceId: Identifier | null;
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
      );
    }
  }

  private async refreshSession(
    previous: StoredCommercialSession,
  ): Promise<StoredCommercialSession> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
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
          user: response.user ?? previous.user,
          tenant: response.tenant ?? previous.tenant,
          ...(previous.rememberMe === undefined
            ? {}
            : { rememberMe: previous.rememberMe }),
          ...(previous.rememberedLogin
            ? { rememberedLogin: previous.rememberedLogin }
            : {}),
        };
        await this.replaceSession(session);
        return session;
      } catch (error) {
        if (!isAuthenticationFailure(error)) throw error;
        const storedRememberedLogin = await this.loadRememberedLogin();
        const rememberedLogin = previous.rememberedLogin
          ?? (storedRememberedLogin
            ? {
                tenantCode: storedRememberedLogin.tenantCode,
                username: storedRememberedLogin.username,
                password: storedRememberedLogin.password,
              }
            : undefined);
        if (!rememberedLogin) {
          await this.clearSession();
          throw error;
        }
        try {
          return await this.reauthenticate(rememberedLogin);
        } catch (reauthenticationError) {
          if (isPermanentLoginFailure(reauthenticationError)) {
            await this.clearSession();
            await this.clearRememberedLogin();
          }
          throw reauthenticationError;
        }
      }
    })();
    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async reauthenticate(
    rememberedLogin: RememberedCommercialLogin,
  ): Promise<StoredCommercialSession> {
    const value = await this.requestJson("POST", "/api/v1/client/auth/login", {
      body: {
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
    await this.replaceSession(session);
    await this.saveRememberedLogin(rememberedLogin);
    return session;
  }

  private async revokeToken(token: string): Promise<void> {
    await this.requestJson("POST", "/api/v1/client/auth/logout", { token });
  }

  private createStoredSession(
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

  private async requireSession(): Promise<StoredCommercialSession> {
    const session = await this.loadSession();
    if (!session) throw new CommercialApiError("云端账户尚未登录", { status: 401 });
    return session;
  }

  private async loadSession(): Promise<StoredCommercialSession | null> {
    if (this.sessionCache !== undefined) return this.sessionCache;
    const session = await this.sessionStore.load();
    if (session && session.gatewayOrigin !== this.baseUrl) {
      await this.sessionStore.clear();
      this.sessionCache = null;
      return null;
    }
    this.sessionCache = session;
    if (session?.rememberedLogin) {
      await this.saveRememberedLogin(session.rememberedLogin);
    }
    return session;
  }

  private async loadRememberedLogin(): Promise<StoredCommercialRememberedLogin | null> {
    if (!this.rememberedLoginStore) return null;
    if (this.rememberedLoginCache !== undefined) return this.rememberedLoginCache;
    const remembered = await this.rememberedLoginStore.load();
    if (remembered && remembered.gatewayOrigin !== this.baseUrl) {
      await this.rememberedLoginStore.clear();
      this.rememberedLoginCache = null;
      return null;
    }
    this.rememberedLoginCache = remembered;
    return remembered;
  }

  private async saveRememberedLogin(
    login: RememberedCommercialLogin,
  ): Promise<void> {
    if (!this.rememberedLoginStore) return;
    const stored: StoredCommercialRememberedLogin = {
      schemaVersion: 1,
      gatewayOrigin: this.baseUrl,
      tenantCode: login.tenantCode,
      username: login.username,
      password: login.password,
    };
    await this.rememberedLoginStore.save(stored);
    this.rememberedLoginCache = stored;
  }

  private async clearRememberedLogin(): Promise<void> {
    this.rememberedLoginCache = null;
    await this.rememberedLoginStore?.clear();
  }

  private async replaceSession(session: StoredCommercialSession): Promise<void> {
    if (session.rememberMe === false) {
      await this.sessionStore.clear();
    } else {
      await this.sessionStore.save(session);
    }
    this.sessionCache = session;
  }

  private async clearSession(): Promise<void> {
    this.sessionCache = null;
    this.activeDeviceId = null;
    await this.sessionStore.clear();
  }

  private async requestJson(
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

  private async requestResponse(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({ Accept: options.accept ?? "application/json" });
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
      body = options.rawBody;
    } else if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }
    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      throw new CommercialApiError(
        error instanceof Error ? error.message : "无法连接 Commercial Gateway",
      );
    }
  }
}

export function resolveCommercialGatewayUrl(): string {
  return COMMERCIAL_GATEWAY_URL;
}

function parseLoginResponse(value: unknown): LoginResponse {
  const response = requiredRecord(value, "login response");
  return {
    accessToken: requiredText(response.accessToken, "accessToken"),
    expiresIn: positiveNumber(response.expiresIn, "expiresIn"),
    user: parseUser(response.user),
    tenant: parseTenant(response.tenant),
  };
}

function parseRefreshResponse(value: unknown): RefreshResponse {
  const response = requiredRecord(value, "refresh response");
  return {
    accessToken: requiredText(response.accessToken, "accessToken"),
    expiresIn: positiveNumber(response.expiresIn, "expiresIn"),
    ...(response.user === undefined ? {} : { user: parseUser(response.user) }),
    ...(response.tenant === undefined
      ? {}
      : { tenant: parseTenant(response.tenant) }),
  };
}

function parseStoredSession(value: unknown): StoredCommercialSession {
  const session = requiredRecord(value, "stored session");
  if (session.schemaVersion !== 1) {
    throw new CommercialApiError("不支持的云端会话存储版本");
  }
  const rememberMe = session.rememberMe;
  if (rememberMe !== undefined && typeof rememberMe !== "boolean") {
    throw new CommercialApiError("stored session.rememberMe 必须是布尔值");
  }
  const rememberedLogin = parseRememberedLogin(session.rememberedLogin);
  return {
    schemaVersion: 1,
    gatewayOrigin: requiredText(session.gatewayOrigin, "gatewayOrigin"),
    accessToken: requiredText(session.accessToken, "accessToken"),
    expiresAtEpochMs: positiveNumber(session.expiresAtEpochMs, "expiresAtEpochMs"),
    user: parseUser(session.user),
    tenant: parseTenant(session.tenant),
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(rememberedLogin ? { rememberedLogin } : {}),
  };
}

function parseStoredRememberedLogin(
  value: unknown,
): StoredCommercialRememberedLogin {
  const login = requiredRecord(value, "stored remembered login");
  if (login.schemaVersion !== 1) {
    throw new CommercialApiError("不支持的已记住登录信息版本");
  }
  return {
    schemaVersion: 1,
    gatewayOrigin: requiredText(login.gatewayOrigin, "gatewayOrigin"),
    tenantCode: requiredText(login.tenantCode, "tenantCode"),
    username: requiredText(login.username, "username"),
    password: requiredRawText(login.password, "password"),
  };
}

function parseRememberedLogin(value: unknown): RememberedCommercialLogin | undefined {
  if (value === undefined) return undefined;
  const login = requiredRecord(value, "stored session.rememberedLogin");
  return {
    tenantCode: requiredText(login.tenantCode, "rememberedLogin.tenantCode"),
    username: requiredText(login.username, "rememberedLogin.username"),
    password: requiredRawText(login.password, "rememberedLogin.password"),
  };
}

function parseUser(value: unknown): CommercialUser {
  const user = requiredRecord(value, "user");
  const nickname = optionalText(user.nickname);
  const email = optionalText(user.email);
  const avatar = optionalText(user.avatar);
  return {
    id: requiredIdentifier(user.id, "user.id"),
    username: requiredText(user.username, "user.username"),
    ...(nickname ? { nickname } : {}),
    ...(email ? { email } : {}),
    ...(avatar ? { avatar } : {}),
  };
}

function parseTenant(value: unknown): CommercialTenant {
  const tenant = requiredRecord(value, "tenant");
  if (tenant.isSystem !== undefined && typeof tenant.isSystem !== "boolean") {
    throw new CommercialApiError("tenant.isSystem 必须是布尔值");
  }
  return {
    id: requiredIdentifier(tenant.id, "tenant.id"),
    code: requiredText(tenant.code, "tenant.code"),
    name: requiredText(tenant.name, "tenant.name"),
    ...(tenant.isSystem === undefined ? {} : { isSystem: tenant.isSystem }),
  };
}

function parseUserProfile(value: unknown): CommercialUserProfile {
  const profile = requiredRecord(value, "user profile");
  return {
    id: requiredIdentifier(profile.id, "profile.id"),
    username: requiredText(profile.username, "profile.username"),
    nickname: stringValue(profile.nickname, "profile.nickname"),
    email: stringValue(profile.email, "profile.email"),
    phone: stringValue(profile.phone, "profile.phone"),
    gender: profileGender(profile.gender),
    avatar: stringValue(profile.avatar, "profile.avatar"),
    status: requiredInteger(profile.status, "profile.status"),
    deptId: requiredIdentifier(profile.deptId, "profile.deptId"),
    deptName: stringValue(profile.deptName, "profile.deptName"),
    profileDescription: stringValue(
      profile.profileDescription,
      "profile.profileDescription",
    ),
  };
}

async function protectedImageData(
  response: Response,
  name: string,
): Promise<CommercialProtectedImage> {
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!contentType || !AVATAR_CONTENT_TYPES.has(contentType)) {
    throw new CommercialApiError(`Gateway 返回的${name}格式无效`, {
      status: response.status,
    });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new CommercialApiError(`Gateway 返回的${name}大小无效`, {
      status: response.status,
    });
  }
  return {
    contentType,
    dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
  };
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new CommercialApiError(`${name} 必须是字符串`);
  }
  return value;
}

function boundedText(value: unknown, name: string, maxLength: number): string {
  const text = stringValue(value, name).trim();
  if (text.length > maxLength) {
    throw new CommercialApiError(`${name} 不能超过 ${maxLength} 个字符`);
  }
  return text;
}

function profileGender(value: unknown): 0 | 1 | 2 {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new CommercialApiError("gender 只能为 0、1 或 2");
}

function toSessionSummary(session: StoredCommercialSession): CommercialSessionSummary {
  return {
    authenticated: true,
    expiresAtEpochMs: session.expiresAtEpochMs,
    user: session.user,
    tenant: session.tenant,
  };
}

function isAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof CommercialApiError &&
    (error.status === 401 || error.status === 403)
  );
}

function isPermanentLoginFailure(error: unknown): boolean {
  return (
    error instanceof CommercialApiError &&
    (error.status === 400 ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 422)
  );
}

function normalizeGatewayBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(requiredText(value, "Gateway URL"));
  } catch {
    throw new CommercialApiError("Commercial Gateway 地址无效");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new CommercialApiError("Commercial Gateway 地址不能包含凭据、查询或片段");
  }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  const approvedCurrentGateway = url.origin === COMMERCIAL_GATEWAY_URL;
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && (loopback || approvedCurrentGateway))
  ) {
    throw new CommercialApiError(
      "Commercial Gateway 必须使用 HTTPS；HTTP 只允许 loopback 或当前唯一网关",
    );
  }
  return url.href.replace(/\/+$/, "");
}

async function assertSuccessfulResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const text = await response.text().catch(() => "");
  let body: unknown = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  const record = optionalRecord(body);
  const nestedError = optionalRecord(record.error);
  const message =
    optionalText(record.message) ??
    optionalText(record.detail) ??
    optionalText(record.error) ??
    optionalText(nestedError.message) ??
    `Commercial Gateway 请求失败 (${response.status})`;
  const code = optionalText(record.code) ?? optionalText(nestedError.code) ?? null;
  const requestId =
    response.headers.get("x-request-id") ?? optionalText(record.requestId) ?? null;
  throw new CommercialApiError(message, { status: response.status, code, requestId });
}

export function requiredRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CommercialApiError(`${name} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

export function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function requiredText(value: unknown, name: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new CommercialApiError(`${name} 不能为空`);
  return text;
}

export function requiredRawText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CommercialApiError(`${name} 不能为空`);
  }
  return value;
}

function normalizeModelPath(value: string): string {
  const path = requiredText(value, "model path");
  let url: URL;
  try {
    url = new URL(path, "http://model-proxy.local");
  } catch {
    throw new CommercialApiError("模型请求路径无效");
  }
  if (
    url.origin !== "http://model-proxy.local" ||
    (!url.pathname.startsWith("/v1/") &&
      url.pathname !== "/v1" &&
      !url.pathname.startsWith("/v1beta/") &&
      url.pathname !== "/v1beta")
  ) {
    throw new CommercialApiError("模型请求只能访问 Gateway /v1 或 /v1beta");
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
      throw new CommercialApiError(`云端模型请求禁止查询参数 ${key}`);
    }
  }
  return `${url.pathname}${url.search}`;
}

function isModelWriteMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH";
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
  const normalized = requiredText(value, "Idempotency-Key");
  if (normalized.length > 255) {
    throw new CommercialApiError("Idempotency-Key 长度不能超过 255");
  }
  return normalized;
}

export function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

export function requiredIdentifier(value: unknown, name: string): Identifier {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new CommercialApiError(`${name} 必须是字符串或安全整数`);
}

function positiveNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new CommercialApiError(`${name} 必须是正数`);
  }
  return value;
}

export function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new CommercialApiError(`${name} 必须是整数`);
  }
  return value;
}

function compactObject(
  value: Record<string, QueryValue>,
): Record<string, Exclude<QueryValue, undefined>> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Record<string, Exclude<QueryValue, undefined>>;
}
