// Copyright (c) 2026 AI anime

import { CommercialApiError } from "./commercial-api-error.js";
import {
  optionalRecord,
  optionalText,
  requiredBoolean,
  requiredInteger,
  requiredRawText,
  requiredString,
  requiredUUID,
  strictRecord,
  requiredRecord,
  requiredText,
} from "./commercial-api-validation.js";
import type {
  CommercialAnnouncementList,
  CommercialAvatarUploadResponse,
  CommercialBaseResponse,
  CommercialDesktopPublicConfig,
  CommercialLogoutResult,
  CommercialPasswordChangeResponse,
  CommercialPasswordResetResponse,
  CommercialProtectedImage,
  CommercialSessionSummary,
  CommercialSuccessMessageResponse,
  CommercialTenant,
  CommercialUser,
  CommercialUserProfile,
  LoginResponse,
  RefreshResponse,
  RememberedCommercialLogin,
  StoredCommercialRememberedLogin,
  StoredCommercialSession,
} from "./commercial-api-types.js";

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function requirePositiveNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new CommercialApiError(`${name} 必须是正数`);
  }
  return value;
}

export function parseLoginResponse(value: unknown): LoginResponse {
  const response = strictRecord(value, "login response", [
    "accessToken",
    "expiresIn",
    "user",
    "tenant",
  ]);
  return {
    accessToken: requiredText(response.accessToken, "accessToken"),
    expiresIn: requirePositiveNumber(response.expiresIn, "expiresIn"),
    user: parseUser(response.user),
    tenant: parseTenant(response.tenant),
  };
}

export function parseRefreshResponse(value: unknown): RefreshResponse {
  const response = strictRecord(value, "refresh response", [
    "accessToken",
    "expiresIn",
  ]);
  return {
    accessToken: requiredText(response.accessToken, "accessToken"),
    expiresIn: requirePositiveNumber(response.expiresIn, "expiresIn"),
  };
}

export function parseStoredSession(value: unknown): StoredCommercialSession {
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
    expiresAtEpochMs: requirePositiveNumber(
      session.expiresAtEpochMs,
      "expiresAtEpochMs",
    ),
    user: parseUser(session.user),
    tenant: parseTenant(session.tenant),
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(rememberedLogin ? { rememberedLogin } : {}),
  };
}

export function parseStoredRememberedLogin(
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
  const user = strictRecord(value, "user", [
    "id",
    "username",
    "nickname",
    "email",
    "avatar",
  ]);
  return {
    id: positiveInteger(user.id, "user.id"),
    username: requiredText(user.username, "user.username"),
    nickname: requiredString(user.nickname, "user.nickname"),
    email: requiredString(user.email, "user.email"),
    avatar: requiredString(user.avatar, "user.avatar"),
  };
}

function parseTenant(value: unknown): CommercialTenant {
  const tenant = strictRecord(value, "tenant", [
    "id",
    "code",
    "name",
    "isSystem",
  ]);
  return {
    id: positiveInteger(tenant.id, "tenant.id"),
    code: requiredText(tenant.code, "tenant.code"),
    name: requiredText(tenant.name, "tenant.name"),
    isSystem: requiredBoolean(tenant.isSystem, "tenant.isSystem"),
  };
}

export function parseUserProfile(value: unknown): CommercialUserProfile {
  const profile = strictRecord(value, "user profile", [
    "id",
    "username",
    "nickname",
    "email",
    "phone",
    "gender",
    "avatar",
    "status",
    "deptId",
    "deptName",
    "profileDescription",
  ]);
  return {
    id: positiveInteger(profile.id, "profile.id"),
    username: requiredText(profile.username, "profile.username"),
    nickname: stringValue(profile.nickname, "profile.nickname"),
    email: stringValue(profile.email, "profile.email"),
    phone: stringValue(profile.phone, "profile.phone"),
    gender: profileGender(profile.gender),
    avatar: stringValue(profile.avatar, "profile.avatar"),
    status: requiredInteger(profile.status, "profile.status"),
    deptId: requiredInteger(profile.deptId, "profile.deptId"),
    deptName: stringValue(profile.deptName, "profile.deptName"),
    profileDescription: stringValue(
      profile.profileDescription,
      "profile.profileDescription",
    ),
  };
}

export function parseDesktopPublicConfig(
  value: unknown,
): CommercialDesktopPublicConfig {
  const root = strictRecord(value, "desktop public config", [
    "brand",
    "login",
    "password",
  ]);
  const brand = strictRecord(root.brand, "desktop brand config", [
    "siteName",
    "siteDescription",
  ]);
  const login = strictRecord(root.login, "desktop login config", [
    "captchaEnabled",
    "rememberMe",
    "smsLoginEnabled",
  ]);
  const password = strictRecord(root.password, "desktop password config", [
    "minLength",
    "maxLength",
    "requireUppercase",
    "requireLowercase",
    "requireNumber",
    "requireSpecial",
  ]);
  return {
    brand: {
      siteName: requiredText(brand.siteName, "brand.siteName"),
      siteDescription: requiredString(
        brand.siteDescription,
        "brand.siteDescription",
      ),
    },
    login: {
      captchaEnabled: requiredBoolean(
        login.captchaEnabled,
        "login.captchaEnabled",
      ),
      rememberMe: requiredBoolean(login.rememberMe, "login.rememberMe"),
      smsLoginEnabled: requiredBoolean(
        login.smsLoginEnabled,
        "login.smsLoginEnabled",
      ),
    },
    password: {
      minLength: positiveInteger(password.minLength, "password.minLength"),
      maxLength: positiveInteger(password.maxLength, "password.maxLength"),
      requireUppercase: requiredBoolean(
        password.requireUppercase,
        "password.requireUppercase",
      ),
      requireLowercase: requiredBoolean(
        password.requireLowercase,
        "password.requireLowercase",
      ),
      requireNumber: requiredBoolean(
        password.requireNumber,
        "password.requireNumber",
      ),
      requireSpecial: requiredBoolean(
        password.requireSpecial,
        "password.requireSpecial",
      ),
    },
  };
}

export function parseBaseResponse(value: unknown): CommercialBaseResponse {
  const response = strictRecord(value, "base response", ["code", "message"]);
  return {
    code: requiredInteger(response.code, "code"),
    message: requiredString(response.message, "message"),
  };
}

export function parseSuccessMessageResponse(
  value: unknown,
): CommercialSuccessMessageResponse {
  const response = strictRecord(value, "success response", [
    "success",
    "message",
  ]);
  return {
    success: requiredBoolean(response.success, "success"),
    message: requiredString(response.message, "message"),
  };
}

export function parseAvatarUploadResponse(
  value: unknown,
): CommercialAvatarUploadResponse {
  const response = strictRecord(value, "avatar upload response", [
    "avatar",
    "contentType",
    "sizeBytes",
  ]);
  const sizeBytes = requiredInteger(response.sizeBytes, "sizeBytes");
  if (sizeBytes <= 0 || sizeBytes > MAX_AVATAR_BYTES) {
    throw new CommercialApiError("sizeBytes 超出头像合同范围");
  }
  return {
    avatar: requiredText(response.avatar, "avatar"),
    contentType: requiredText(response.contentType, "contentType"),
    sizeBytes,
  };
}

export function parsePasswordChangeResponse(
  value: unknown,
): CommercialPasswordChangeResponse {
  const response = strictRecord(value, "password change response", [
    "success",
    "sessionsRevoked",
    "tokenReissued",
  ]);
  return {
    success: requiredBoolean(response.success, "success"),
    sessionsRevoked: requiredBoolean(
      response.sessionsRevoked,
      "sessionsRevoked",
    ),
    tokenReissued: requiredBoolean(response.tokenReissued, "tokenReissued"),
  };
}

export function parsePasswordResetResponse(
  value: unknown,
): CommercialPasswordResetResponse {
  const response = strictRecord(value, "password reset response", [
    "success",
    "message",
    "sessionsRevoked",
    "tokenReissued",
  ]);
  return {
    success: requiredBoolean(response.success, "success"),
    message: requiredString(response.message, "message"),
    sessionsRevoked: requiredBoolean(
      response.sessionsRevoked,
      "sessionsRevoked",
    ),
    tokenReissued: requiredBoolean(response.tokenReissued, "tokenReissued"),
  };
}

export function parseLogoutResponse(value: unknown): Omit<CommercialLogoutResult, "remoteRevoked"> {
  const response = strictRecord(value, "logout response", ["success"]);
  return { success: requiredBoolean(response.success, "success") };
}

export function parseAnnouncementList(value: unknown): CommercialAnnouncementList {
  const response = strictRecord(value, "announcement list", ["items", "total"]);
  if (!Array.isArray(response.items)) {
    throw new CommercialApiError("announcement list.items 必须是数组");
  }
  return {
    items: response.items.map((value, index) => {
      const item = strictRecord(value, `announcements[${index}]`, [
        "id",
        "title",
        "body",
        "level",
        "pinned",
        "publishAt",
        "expiresAt",
      ]);
      return {
        id: requiredUUID(item.id, `announcements[${index}].id`),
        title: requiredText(item.title, `announcements[${index}].title`),
        body: requiredString(item.body, `announcements[${index}].body`),
        level: requiredText(item.level, `announcements[${index}].level`),
        pinned: requiredBoolean(item.pinned, `announcements[${index}].pinned`),
        publishAt: requiredString(
          item.publishAt,
          `announcements[${index}].publishAt`,
        ),
        expiresAt: requiredString(
          item.expiresAt,
          `announcements[${index}].expiresAt`,
        ),
      };
    }),
    total: nonNegativeInteger(response.total, "total"),
  };
}

export async function protectedImageData(
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

function positiveInteger(value: unknown, name: string): number {
  const integer = requiredInteger(value, name);
  if (!Number.isSafeInteger(integer) || integer <= 0) {
    throw new CommercialApiError(`${name} 必须是正整数`);
  }
  return integer;
}

function nonNegativeInteger(value: unknown, name: string): number {
  const integer = requiredInteger(value, name);
  if (!Number.isSafeInteger(integer) || integer < 0) {
    throw new CommercialApiError(`${name} 必须是非负整数`);
  }
  return integer;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new CommercialApiError(`${name} 必须是字符串`);
  }
  return value;
}

export function boundedText(value: unknown, name: string, maxLength: number): string {
  const text = stringValue(value, name).trim();
  if (text.length > maxLength) {
    throw new CommercialApiError(`${name} 不能超过 ${maxLength} 个字符`);
  }
  return text;
}

export function profileGender(value: unknown): 0 | 1 | 2 {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new CommercialApiError("gender 只能为 0、1 或 2");
}

export function toSessionSummary(session: StoredCommercialSession): CommercialSessionSummary {
  return {
    authenticated: true,
    expiresAtEpochMs: session.expiresAtEpochMs,
    user: session.user,
    tenant: session.tenant,
  };
}

export function isAuthenticationFailure(error: unknown): boolean {
  return (
    error instanceof CommercialApiError &&
    (error.status === 401 || error.status === 403)
  );
}

export function isPermanentLoginFailure(error: unknown): boolean {
  return (
    error instanceof CommercialApiError &&
    (error.status === 400 ||
      error.status === 401 ||
      error.status === 403 ||
      error.status === 422)
  );
}

export function normalizeGatewayBaseUrl(value: string): string {
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
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && loopback)
  ) {
    throw new CommercialApiError(
      "Commercial Gateway 必须使用 HTTPS；HTTP 只允许 loopback",
    );
  }
  return url.href.replace(/\/+$/, "");
}

export async function assertSuccessfulResponse(response: Response): Promise<void> {
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
