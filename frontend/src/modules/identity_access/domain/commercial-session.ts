export interface CommercialUser {
  id: number;
  username: string;
  nickname: string;
  email: string;
  avatar: string;
}

export interface CommercialTenant {
  id: number;
  code: string;
  name: string;
  isSystem: boolean;
}

export interface CommercialSession {
  authenticated: true;
  expiresAtEpochMs: number;
  user: CommercialUser;
  tenant: CommercialTenant;
}

export interface CommercialUserProfile {
  id: number;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  gender: 0 | 1 | 2;
  avatar: string;
  status: number;
  deptId: number;
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

export interface CommercialPasswordResetVerification {
  resetTicket: string;
  expiresIn: number;
}

export type CommercialLoginInput =
  | {
      loginType: "PASSWORD";
      tenantCode: string;
      username: string;
      password: string;
      rememberMe?: boolean;
      captchaKey?: string;
      captchaCode?: string;
    }
  | {
      loginType: "SMS";
      tenantCode: string;
      phone: string;
      smsCode: string;
      rememberMe?: boolean;
    };

export interface CommercialRememberedLogin {
  tenantCode: string;
  username: string;
  hasPassword: true;
}

export interface CommercialPublicConfig {
  brand: {
    siteName: string;
    siteDescription: string;
  };
  login: {
    captchaEnabled: boolean;
    rememberMe: boolean;
    smsLoginEnabled: boolean;
  };
  password: {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumber: boolean;
    requireSpecial: boolean;
  };
}

export interface CommercialCaptcha {
  key: string;
  imageDataUrl: string;
}

export interface CommercialImage {
  contentType: string;
  dataUrl: string;
}

export function parseCommercialStatus(
  value: unknown,
): { configured: boolean; gatewayOrigin: string } {
  const status = record(value, "commercial status", [
    "configured",
    "gatewayOrigin",
  ]);
  return {
    configured: booleanValue(status.configured, "status.configured"),
    gatewayOrigin: stringValue(status.gatewayOrigin, "status.gatewayOrigin"),
  };
}

export function parseCommercialImage(
  value: unknown,
  name: string,
): CommercialImage {
  const image = record(value, name, ["contentType", "dataUrl"]);
  const contentType = text(image.contentType, `${name}.contentType`);
  const dataUrl = text(image.dataUrl, `${name}.dataUrl`);
  if (
    !contentType.startsWith("image/") ||
    !dataUrl.startsWith(`data:${contentType};base64,`)
  ) {
    throw new Error(`${name} must contain a matching image data URL`);
  }
  return { contentType, dataUrl };
}

export function parseCommercialLogoutResult(
  value: unknown,
): { remoteRevoked: boolean; success: boolean } {
  const result = record(value, "commercial logout result", [
    "remoteRevoked",
    "success",
  ]);
  return {
    remoteRevoked: booleanValue(
      result.remoteRevoked,
      "logout.remoteRevoked",
    ),
    success: booleanValue(result.success, "logout.success"),
  };
}

export function parseCommercialPasswordChangeResult(value: unknown): {
  success: boolean;
  sessionsRevoked: boolean;
  tokenReissued: boolean;
} {
  const result = record(value, "commercial password change result", [
    "sessionsRevoked",
    "success",
    "tokenReissued",
  ]);
  return {
    success: successful(result.success, "passwordChange.success"),
    sessionsRevoked: booleanValue(
      result.sessionsRevoked,
      "passwordChange.sessionsRevoked",
    ),
    tokenReissued: booleanValue(
      result.tokenReissued,
      "passwordChange.tokenReissued",
    ),
  };
}

export function parseCommercialSuccessMessage(
  value: unknown,
  name: string,
): { success: boolean; message: string } {
  const result = record(value, name, ["message", "success"]);
  return {
    success: successful(result.success, `${name}.success`),
    message: text(result.message, `${name}.message`),
  };
}

export function parseCommercialPasswordResetResult(value: unknown): {
  success: boolean;
  message: string;
  sessionsRevoked: boolean;
  tokenReissued: boolean;
} {
  const result = record(value, "commercial password reset result", [
    "message",
    "sessionsRevoked",
    "success",
    "tokenReissued",
  ]);
  return {
    success: successful(result.success, "passwordReset.success"),
    message: text(result.message, "passwordReset.message"),
    sessionsRevoked: booleanValue(
      result.sessionsRevoked,
      "passwordReset.sessionsRevoked",
    ),
    tokenReissued: booleanValue(
      result.tokenReissued,
      "passwordReset.tokenReissued",
    ),
  };
}

export function parseCommercialAvatarUploadResult(value: unknown): {
  profile: CommercialUserProfile;
  avatar: CommercialImage;
} {
  const result = record(value, "commercial avatar upload result", [
    "avatar",
    "profile",
  ]);
  return {
    profile: parseCommercialUserProfile(result.profile),
    avatar: parseCommercialImage(result.avatar, "commercial avatar"),
  };
}

export function parseCommercialProfileResult(
  value: unknown,
): { profile: CommercialUserProfile } {
  const result = record(value, "commercial profile result", ["profile"]);
  return { profile: parseCommercialUserProfile(result.profile) };
}

export function parseCommercialRememberedLogin(
  value: unknown,
): CommercialRememberedLogin {
  const login = record(value, "remembered commercial login", [
    "tenantCode",
    "username",
    "hasPassword",
  ]);
  if (login.hasPassword !== true) {
    throw new Error("Remembered commercial login is missing its password marker");
  }
  return {
    tenantCode: text(login.tenantCode, "rememberedLogin.tenantCode"),
    username: text(login.username, "rememberedLogin.username"),
    hasPassword: true,
  };
}

export function parseCommercialCaptcha(value: unknown): CommercialCaptcha {
  const captcha = record(value, "commercial captcha", ["key", "imageDataUrl"]);
  const imageDataUrl = text(captcha.imageDataUrl, "captcha.imageDataUrl");
  if (!imageDataUrl.startsWith("data:image/svg+xml;base64,")) {
    throw new Error("Commercial Gateway returned an invalid captcha image");
  }
  return {
    key: text(captcha.key, "captcha.key"),
    imageDataUrl,
  };
}

export function parseCommercialSession(value: unknown): CommercialSession {
  const session = record(value, "commercial session", [
    "authenticated",
    "expiresAtEpochMs",
    "user",
    "tenant",
  ]);
  if (session.authenticated !== true) {
    throw new Error("Commercial session is not authenticated");
  }
  return {
    authenticated: true,
    expiresAtEpochMs: positiveNumber(
      session.expiresAtEpochMs,
      "expiresAtEpochMs",
    ),
    user: parseCommercialUser(session.user),
    tenant: parseCommercialTenant(session.tenant),
  };
}

export function parseCommercialUserProfile(
  value: unknown,
): CommercialUserProfile {
  const profile = record(value, "commercial user profile", [
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
    username: text(profile.username, "profile.username"),
    nickname: stringValue(profile.nickname, "profile.nickname"),
    email: stringValue(profile.email, "profile.email"),
    phone: stringValue(profile.phone, "profile.phone"),
    gender: gender(profile.gender),
    avatar: stringValue(profile.avatar, "profile.avatar"),
    status: integer(profile.status, "profile.status"),
    deptId: integer(profile.deptId, "profile.deptId"),
    deptName: stringValue(profile.deptName, "profile.deptName"),
    profileDescription: stringValue(
      profile.profileDescription,
      "profile.profileDescription",
    ),
  };
}

export function parsePasswordResetVerification(
  value: unknown,
): CommercialPasswordResetVerification {
  const verification = record(value, "password reset verification", [
    "resetTicket",
    "expiresIn",
  ]);
  return {
    resetTicket: text(verification.resetTicket, "resetTicket"),
    expiresIn: positiveNumber(verification.expiresIn, "expiresIn"),
  };
}

export function parseCommercialPublicConfig(
  value: unknown,
): CommercialPublicConfig {
  const config = record(value, "commercial public config", [
    "brand",
    "login",
    "password",
  ]);
  const brand = record(config.brand, "commercial brand config", [
    "siteName",
    "siteDescription",
  ]);
  const login = record(config.login, "commercial login config", [
    "captchaEnabled",
    "rememberMe",
    "smsLoginEnabled",
  ]);
  const password = record(config.password, "commercial password config", [
    "minLength",
    "maxLength",
    "requireUppercase",
    "requireLowercase",
    "requireNumber",
    "requireSpecial",
  ]);
  return {
    brand: {
      siteName: text(brand.siteName, "brand.siteName"),
      siteDescription: stringValue(
        brand.siteDescription,
        "brand.siteDescription",
      ),
    },
    login: {
      captchaEnabled: booleanValue(
        login.captchaEnabled,
        "login.captchaEnabled",
      ),
      rememberMe: booleanValue(login.rememberMe, "login.rememberMe"),
      smsLoginEnabled: booleanValue(
        login.smsLoginEnabled,
        "login.smsLoginEnabled",
      ),
    },
    password: {
      minLength: positiveInteger(password.minLength, "password.minLength"),
      maxLength: positiveInteger(password.maxLength, "password.maxLength"),
      requireUppercase: booleanValue(
        password.requireUppercase,
        "password.requireUppercase",
      ),
      requireLowercase: booleanValue(
        password.requireLowercase,
        "password.requireLowercase",
      ),
      requireNumber: booleanValue(
        password.requireNumber,
        "password.requireNumber",
      ),
      requireSpecial: booleanValue(
        password.requireSpecial,
        "password.requireSpecial",
      ),
    },
  };
}

function parseCommercialUser(value: unknown): CommercialUser {
  const user = record(value, "commercial user", [
    "id",
    "username",
    "nickname",
    "email",
    "avatar",
  ]);
  return {
    id: positiveInteger(user.id, "user.id"),
    username: text(user.username, "user.username"),
    nickname: stringValue(user.nickname, "user.nickname"),
    email: stringValue(user.email, "user.email"),
    avatar: stringValue(user.avatar, "user.avatar"),
  };
}

function parseCommercialTenant(value: unknown): CommercialTenant {
  const tenant = record(value, "commercial tenant", [
    "id",
    "code",
    "name",
    "isSystem",
  ]);
  return {
    id: positiveInteger(tenant.id, "tenant.id"),
    code: text(tenant.code, "tenant.code"),
    name: text(tenant.name, "tenant.name"),
    isSystem: booleanValue(tenant.isSystem, "tenant.isSystem"),
  };
}

function record(
  value: unknown,
  name: string,
  fields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`${name} fields must be exactly ${expected.join(", ")}`);
  }
  return result;
}

function text(value: unknown, name: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function positiveNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

function integer(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return Number(value);
}

function gender(value: unknown): 0 | 1 | 2 {
  if (value === 0 || value === 1 || value === 2) return value;
  throw new Error("profile.gender must be 0, 1, or 2");
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function successful(value: unknown, name: string): true {
  if (value !== true) throw new Error(`${name} must be true`);
  return true;
}
