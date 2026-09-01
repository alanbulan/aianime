// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";

import { CommercialApiError } from "./commercial-api-error.js";
import {
  parseCommercialAuthorizationWire,
  parseCommercialBootstrapWire,
  projectCommercialInvocation,
  projectCommercialInvocationDetails,
  projectCommercialInvocationList,
  projectCommercialModelCatalog,
  projectCommercialModelCatalogItem,
  projectCommercialQuota,
  projectCommercialRelease,
  type CommercialAuthorizationWire,
  type CommercialBootstrapWire,
  type CommercialInvocationListSnapshot,
  type CommercialInvocationSnapshot,
  type CommercialModelCatalogItemSnapshot,
  type CommercialModelCatalogSnapshot,
  type CommercialQuotaSnapshot,
  type CommercialReleaseSnapshot,
} from "./commercial-contracts.js";
import { CommercialApiTransport, REFRESH_SKEW_MS } from "./commercial-api-transport.js";
import {
  optionalText,
  requiredRawText,
  requiredRecord,
  requiredText,
  requiredUUID,
  strictRecord,
} from "./commercial-api-validation.js";
import {
  AVATAR_CONTENT_TYPES,
  MAX_AVATAR_BYTES,
  assertSuccessfulResponse,
  boundedText,
  isAuthenticationFailure,
  isPermanentLoginFailure,
  parseAnnouncementList,
  parseAvatarUploadResponse,
  parseBaseResponse,
  parseDesktopPublicConfig,
  parseLoginResponse,
  parseLogoutResponse,
  parsePasswordChangeResponse,
  parsePasswordResetResponse,
  parseSuccessMessageResponse,
  parseUserProfile,
  profileGender,
  protectedImageData,
  requirePositiveNumber,
  toSessionSummary,
} from "./commercial-api-response.js";
import type {
  CommercialAnnouncementList,
  CommercialAvatarUploadInput,
  CommercialAvatarUploadResponse,
  CommercialBaseResponse,
  CommercialBootstrapRequestQuery,
  CommercialCaptcha,
  CommercialDesktopPublicConfig,
  CommercialInvocationQuery,
  CommercialLicenseActivationInput,
  CommercialLicenseActivationResponse,
  CommercialLicenseDeactivationResponse,
  CommercialLicenseLeaseRefreshResponse,
  CommercialLoginInput,
  CommercialLogoutResult,
  CommercialModelCatalogQuery,
  CommercialPasswordChangeResponse,
  CommercialPasswordResetResponse,
  CommercialPasswordResetVerification,
  CommercialProfileUpdateInput,
  CommercialProtectedImage,
  CommercialPublicLogo,
  CommercialReleaseQuery,
  CommercialReleaseUpdateFeed,
  CommercialRememberedLoginInput,
  CommercialRememberedLoginSummary,
  CommercialSessionSummary,
  CommercialSuccessMessageResponse,
  CommercialUserProfile,
  QueryValue,
} from "./commercial-api-types.js";
export type { SecureStorageAdapter } from "./secure-file-store.js";
export type * from "./commercial-api-types.js";
export { CommercialApiError } from "./commercial-api-error.js";
export { isModelWriteMethod } from "./commercial-api-transport.js";
export {
  EncryptedFileCommercialRememberedLoginStore,
  EncryptedFileCommercialSessionStore,
} from "./commercial-session-store.js";
export {
  optionalRecord,
  optionalText,
  requiredInteger,
  requiredUUID,
  requiredRawText,
  requiredRecord,
  requiredText,
} from "./commercial-api-validation.js";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_CAPTCHA_BYTES = 512 * 1024;
export const COMMERCIAL_GATEWAY_URL = "https://aianime.mingcw.com";
export const COMMERCIAL_RUNTIME_DEPENDENCIES_URL =
  `${COMMERCIAL_GATEWAY_URL}/api/v1/client/runtime-dependencies`;

export class CommercialApiClient extends CommercialApiTransport {
  async publicConfig(
    tenantCode: string,
  ): Promise<CommercialDesktopPublicConfig> {
    return parseDesktopPublicConfig(
      await this.requestJson("GET", "/api/v1/client/config/public", {
        query: { tenantCode: requiredText(tenantCode, "tenantCode") },
      }),
    );
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
    const value = strictRecord(
      await this.requestJson("GET", "/api/v1/auth/captcha", {
        query: { tenantCode: requiredText(tenantCode, "tenantCode") },
      }),
      "captcha response",
      ["key", "svg"],
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
    if (input.loginType !== "PASSWORD" && input.loginType !== "SMS") {
      throw new CommercialApiError("loginType 必须是 PASSWORD 或 SMS");
    }
    const tenantCode = requiredText(input.tenantCode, "tenantCode");
    const passwordCredentials =
      input.loginType === "PASSWORD"
        ? {
            username: requiredText(input.username, "username"),
            password: requiredRawText(input.password, "password"),
          }
        : null;
    const body =
      input.loginType === "PASSWORD"
        ? compactObject({
            loginType: "PASSWORD",
            tenantCode,
            username: passwordCredentials!.username,
            password: passwordCredentials!.password,
            rememberMe: input.rememberMe,
            captchaKey: optionalText(input.captchaKey),
            captchaCode: optionalText(input.captchaCode),
          })
        : compactObject({
            loginType: "SMS",
            tenantCode,
            phone: requiredText(input.phone, "phone"),
            smsCode: requiredText(input.smsCode, "smsCode"),
            rememberMe: input.rememberMe,
          });
    const value = await this.requestJson("POST", "/api/v1/client/auth/login", {
      body,
    });
    const response = parseLoginResponse(value);
    const session = this.createStoredSession(
      response,
      input.loginType === "PASSWORD" && input.rememberMe === true
        ? {
            tenantCode,
            username: passwordCredentials!.username,
            password: passwordCredentials!.password,
          }
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

  async revealRememberedPassword(): Promise<string> {
    const remembered = await this.loadRememberedLogin();
    if (!remembered) {
      throw new CommercialApiError("没有可用的已保存登录信息", { status: 401 });
    }
    return remembered.password;
  }

  async loginRemembered(
    input: CommercialRememberedLoginInput = {},
  ): Promise<CommercialSessionSummary> {
    const remembered = await this.loadRememberedLogin();
    if (!remembered) {
      throw new CommercialApiError("没有可用的已保存登录信息", { status: 401 });
    }
    return this.login({
      loginType: "PASSWORD",
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
        return null;
      }
      return toSessionSummary(session);
    }
  }

  async logout(): Promise<CommercialLogoutResult> {
    const session = await this.loadSession();
    let remoteRevoked = false;
    let success = true;
    try {
      if (session) {
        const response = parseLogoutResponse(
          await this.requestJson("POST", "/api/v1/client/auth/logout", {
            token: session.accessToken,
          }),
        );
        remoteRevoked = response.success;
        success = response.success;
      }
    } catch {
      success = false;
      remoteRevoked = false;
    } finally {
      if (session?.rememberedLogin) {
        await this.saveRememberedLogin(session.rememberedLogin);
      }
      await this.clearSession();
    }
    return { remoteRevoked, success };
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
        nickname: profile.nickname,
        email: profile.email,
        avatar: profile.avatar,
      },
    });
    return profile;
  }

  async updateProfile(
    input: CommercialProfileUpdateInput,
  ): Promise<CommercialUserProfile> {
    const result = parseBaseResponse(
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
      }),
    );
    requireSuccessfulBaseResponse(result, "更新资料");
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

  async uploadAvatar(
    input: CommercialAvatarUploadInput,
  ): Promise<CommercialAvatarUploadResponse> {
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
    return parseAvatarUploadResponse(
      await this.authenticatedJson("POST", "/api/v1/user/avatar", { formData }),
    );
  }

  async deleteAvatar(): Promise<CommercialBaseResponse> {
    const result = parseBaseResponse(
      await this.authenticatedJson("DELETE", "/api/v1/user/avatar"),
    );
    requireSuccessfulBaseResponse(result, "删除头像");
    return result;
  }

  async changePassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<CommercialPasswordChangeResponse> {
    const session = await this.requireSession();
    const remembered = await this.loadRememberedLogin();
    const normalizedNewPassword = requiredRawText(newPassword, "newPassword");
    const result = parsePasswordChangeResponse(
      await this.authenticatedJson("PUT", "/api/v1/user/password", {
        body: {
          oldPassword: requiredRawText(oldPassword, "oldPassword"),
          newPassword: normalizedNewPassword,
        },
      }),
    );
    requireSuccessfulCommand(result, "修改密码");
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
    return result;
  }

  async sendPasswordResetCode(
    tenantCode: string,
    email: string,
  ): Promise<CommercialSuccessMessageResponse> {
    const result = parseSuccessMessageResponse(
      await this.requestJson("POST", "/api/v1/auth/email-code", {
        body: {
          tenantCode: requiredText(tenantCode, "tenantCode"),
          email: requiredText(email, "email"),
          scene: "reset",
        },
      }),
    );
    requireSuccessfulCommand(result, "发送密码重置验证码");
    return result;
  }

  async sendSmsLoginCode(
    tenantCode: string,
    phone: string,
  ): Promise<CommercialSuccessMessageResponse> {
    const result = parseSuccessMessageResponse(
      await this.requestJson("POST", "/api/v1/auth/sms-code", {
        body: {
          tenantCode: requiredText(tenantCode, "tenantCode"),
          phone: requiredText(phone, "phone"),
          scene: "login",
        },
      }),
    );
    requireSuccessfulCommand(result, "发送短信登录验证码");
    return result;
  }

  async verifyPasswordResetCode(
    tenantCode: string,
    email: string,
    code: string,
  ): Promise<CommercialPasswordResetVerification> {
    const response = strictRecord(
      await this.requestJson("POST", "/api/v1/auth/reset-password/verify", {
        body: {
          tenantCode: requiredText(tenantCode, "tenantCode"),
          email: requiredText(email, "email"),
          code: requiredText(code, "code"),
        },
      }),
      "password reset verification",
      ["resetTicket", "expiresIn"],
    );
    return {
      resetTicket: requiredText(response.resetTicket, "resetTicket"),
      expiresIn: requirePositiveNumber(response.expiresIn, "expiresIn"),
    };
  }

  async resetPassword(
    tenantCode: string,
    resetTicket: string,
    newPassword: string,
  ): Promise<CommercialPasswordResetResponse> {
    const result = parsePasswordResetResponse(
      await this.requestJson("POST", "/api/v1/auth/reset-password", {
        body: {
          tenantCode: requiredText(tenantCode, "tenantCode"),
          resetTicket: requiredText(resetTicket, "resetTicket"),
          newPassword: requiredRawText(newPassword, "newPassword"),
        },
      }),
    );
    requireSuccessfulCommand(result, "重置密码");
    const remembered = await this.loadRememberedLogin();
    if (remembered?.tenantCode === tenantCode.trim()) {
      await this.clearRememberedLogin();
    }
    return result;
  }

  async bootstrap(
    query: CommercialBootstrapRequestQuery,
    deviceId?: string,
  ): Promise<CommercialBootstrapWire> {
    return parseCommercialBootstrapWire(
      await this.authenticatedJson("GET", "/api/v1/client/bootstrap", {
      query: compactObject({
        devicePublicKeyHash: optionalText(query.devicePublicKeyHash),
        modelOperation: optionalText(query.modelOperation),
        catalogVersion: optionalText(query.catalogVersion),
        currentVersion: optionalText(query.currentVersion),
        target: optionalText(query.target),
        arch: optionalText(query.arch),
      }),
        ...(deviceId === undefined
          ? {}
          : { deviceId: requiredUUID(deviceId, "deviceId") }),
      }),
    );
  }

  async quotaBalance(): Promise<CommercialQuotaSnapshot> {
    return projectCommercialQuota(
      await this.authenticatedJson("GET", "/api/v1/client/quota/balance"),
    );
  }

  async modelCatalog(
    query: CommercialModelCatalogQuery = {},
    deviceId?: string,
  ): Promise<CommercialModelCatalogSnapshot> {
    return projectCommercialModelCatalog(
      await this.authenticatedJson("GET", "/api/v1/client/models", {
      query: compactObject({
        operation: optionalText(query.operation),
        catalogVersion: optionalText(query.catalogVersion),
      }),
        ...(deviceId === undefined
          ? {}
          : { deviceId: requiredUUID(deviceId, "deviceId") }),
      }),
    );
  }

  async modelDetails(
    sku: string,
    deviceId?: string,
  ): Promise<CommercialModelCatalogItemSnapshot> {
    return projectCommercialModelCatalogItem(
      await this.authenticatedJson(
        "GET",
        `/api/v1/client/models/${encodeURIComponent(requiredText(sku, "sku"))}`,
        deviceId === undefined
          ? {}
          : { deviceId: requiredUUID(deviceId, "deviceId") },
      ),
    );
  }

  async activateLicense(
    input: CommercialLicenseActivationInput,
  ): Promise<CommercialLicenseActivationResponse> {
    const licenseId = requiredUUID(input.licenseId, "licenseId");
    const requestId = randomUUID();
    const device = await input.device.summary();
    const challengeValue = strictRecord(
      await this.authenticatedJson(
        "POST",
        "/api/v1/client/licenses/challenge",
        {
          body: {
            licenseId,
            publicKeyHash: device.publicKeyHash,
            requestId,
          },
        },
      ),
      "license challenge",
      [
        "id",
        "licenseId",
        "publicKeyHash",
        "challenge",
        "message",
        "expiresAt",
        "signatureAlgorithm",
      ],
    );
    requiredUUID(challengeValue.id, "challenge.id");
    requiredUUID(challengeValue.licenseId, "challenge.licenseId");
    requiredText(challengeValue.publicKeyHash, "challenge.publicKeyHash");
    requiredText(challengeValue.challenge, "challenge.challenge");
    requiredText(challengeValue.expiresAt, "challenge.expiresAt");
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
    const response = strictRecord(
      await this.authenticatedJson(
        "POST",
        "/api/v1/client/licenses/activate",
        {
          body: {
          licenseId,
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
      ),
      "license activation response",
      ["activationId", "leaseId", "expiresAt"],
    );
    return {
      activationId: requiredUUID(response.activationId, "activationId"),
      leaseId: requiredUUID(response.leaseId, "leaseId"),
      expiresAt: requiredText(response.expiresAt, "expiresAt"),
    };
  }

  async refreshLicenseLease(
    activationId: string,
  ): Promise<CommercialLicenseLeaseRefreshResponse> {
    const response = strictRecord(
      await this.authenticatedJson(
        "POST",
        "/api/v1/client/licenses/lease/refresh",
        { body: { activationId: requiredUUID(activationId, "activationId") } },
      ),
      "license lease refresh response",
      ["leaseId", "issuedAt", "expiresAt", "keyId"],
    );
    return {
      leaseId: requiredUUID(response.leaseId, "leaseId"),
      issuedAt: requiredText(response.issuedAt, "issuedAt"),
      expiresAt: requiredText(response.expiresAt, "expiresAt"),
      keyId: requiredText(response.keyId, "keyId"),
    };
  }

  async deactivateLicense(
    activationId: string,
    reason: string,
  ): Promise<CommercialLicenseDeactivationResponse> {
    const response = strictRecord(
      await this.authenticatedJson(
        "POST",
        "/api/v1/client/licenses/deactivate",
        {
          body: {
            activationId: requiredUUID(activationId, "activationId"),
            reason: requiredText(reason, "reason"),
            confirmed: true,
          },
        },
      ),
      "license deactivation response",
      ["activationId", "status", "endedAt", "endReason"],
    );
    return {
      activationId: requiredUUID(response.activationId, "activationId"),
      status: requiredText(response.status, "status"),
      endedAt: requiredText(response.endedAt, "endedAt"),
      endReason: requiredText(response.endReason, "endReason"),
    };
  }

  async announcements(limit = 20): Promise<CommercialAnnouncementList> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new CommercialApiError("limit 必须是 1 到 100 之间的整数");
    }
    return parseAnnouncementList(
      await this.authenticatedJson(
        "GET",
        "/api/v1/client/announcements/active",
        { query: { limit } },
      ),
    );
  }

  async listInvocations(
    query: CommercialInvocationQuery = {},
  ): Promise<CommercialInvocationListSnapshot> {
    return projectCommercialInvocationList(
      await this.authenticatedJson(
        "GET",
        "/api/v1/client/relay/invocations",
        {
          query: compactObject({
            status: optionalText(query.status),
            operation: optionalText(query.operation),
            modelCode: optionalText(query.modelCode),
            limit: query.limit,
            offset: query.offset,
          }),
        },
      ),
    );
  }

  async invocationDetails(
    id: string,
  ): Promise<{ invocation: CommercialInvocationSnapshot }> {
    return projectCommercialInvocationDetails(
      await this.authenticatedJson(
        "GET",
        `/api/v1/client/relay/invocations/${encodeURIComponent(requiredUUID(id, "id"))}`,
      ),
    );
  }

  async cancelInvocation(
    id: string,
    reason: string,
  ): Promise<CommercialInvocationSnapshot> {
    const invocationId = requiredUUID(id, "id");
    return projectCommercialInvocation(
      await this.authenticatedJson(
        "POST",
        `/api/v1/client/relay/invocations/${encodeURIComponent(invocationId)}/cancel`,
        { body: { reason: requiredText(reason, "reason") } },
      ),
    );
  }

  async invocationResult(id: string): Promise<Response> {
    const response = await this.authenticatedResponse(
      "GET",
      `/api/v1/client/relay/invocations/${encodeURIComponent(requiredUUID(id, "id"))}/result`,
      { accept: "application/octet-stream" },
    );
    await assertSuccessfulResponse(response);
    return response;
  }

  async checkRelease(
    query: CommercialReleaseQuery,
  ): Promise<CommercialReleaseSnapshot> {
    return projectCommercialRelease(
      await this.authenticatedJson("GET", "/api/v1/client/releases/check", {
        query: {
          currentVersion: requiredText(query.currentVersion, "currentVersion"),
          target: requiredText(query.target, "target"),
          arch: requiredText(query.arch, "arch"),
        },
      }),
    );
  }

  async releaseUpdateFeed(
    artifactId: string,
  ): Promise<CommercialReleaseUpdateFeed> {
    const session = await this.requireFreshSession();
    const url = new URL("/api/v1/client/releases/updater/", `${this.baseUrl}/`);
    url.searchParams.set(
      "artifactId",
      requiredUUID(artifactId, "artifactId"),
    );
    return {
      url: url.toString(),
      requestHeaders: {
        Authorization: `Bearer ${session.accessToken}`,
        "Cache-Control": "no-cache",
      },
    };
  }

}

function requireSuccessfulCommand(
  result: { success: boolean; message?: string },
  action: string,
): void {
  if (!result.success) {
    throw new CommercialApiError(result.message?.trim() || `${action}失败`);
  }
}

function requireSuccessfulBaseResponse(
  result: CommercialBaseResponse,
  action: string,
): void {
  if (result.code !== 0) {
    throw new CommercialApiError(result.message.trim() || `${action}失败`);
  }
}

export function resolveCommercialGatewayUrl(): string {
  return COMMERCIAL_GATEWAY_URL;
}

function compactObject(
  value: Record<string, QueryValue>,
): Record<string, Exclude<QueryValue, undefined>> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Record<string, Exclude<QueryValue, undefined>>;
}
