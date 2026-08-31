// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";

import { CommercialApiError } from "./commercial-api-error.js";
import { CommercialApiTransport, REFRESH_SKEW_MS } from "./commercial-api-transport.js";
import {
  optionalText,
  requiredIdentifier,
  requiredRawText,
  requiredRecord,
  requiredText,
} from "./commercial-api-validation.js";
import {
  AVATAR_CONTENT_TYPES,
  MAX_AVATAR_BYTES,
  assertSuccessfulResponse,
  boundedText,
  isAuthenticationFailure,
  isPermanentLoginFailure,
  parseLoginResponse,
  parseUserProfile,
  profileGender,
  protectedImageData,
  requirePositiveNumber,
  toSessionSummary,
} from "./commercial-api-response.js";
import type {
  CommercialAvatarUploadInput,
  CommercialBootstrapRequestQuery,
  CommercialCaptcha,
  CommercialInvocationQuery,
  CommercialLicenseActivationInput,
  CommercialLoginInput,
  CommercialModelCatalogQuery,
  CommercialPasswordResetVerification,
  CommercialProfileUpdateInput,
  CommercialProtectedImage,
  CommercialPublicLogo,
  CommercialRegistrationInput,
  CommercialReleaseQuery,
  CommercialReleaseUpdateFeed,
  CommercialRememberedLoginInput,
  CommercialRememberedLoginSummary,
  CommercialSessionSummary,
  CommercialUserProfile,
  Identifier,
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
  requiredIdentifier,
  requiredInteger,
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
      expiresIn: requirePositiveNumber(response.expiresIn, "expiresIn"),
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
        catalogVersion: optionalText(query.catalogVersion),
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
