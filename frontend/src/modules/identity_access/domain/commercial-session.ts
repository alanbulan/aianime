export type CommercialIdentifier = string | number;

export interface CommercialUser {
  id: CommercialIdentifier;
  username: string;
  nickname?: string;
  email?: string;
  avatar?: string;
}

export interface CommercialTenant {
  id: CommercialIdentifier;
  code: string;
  name: string;
  isSystem?: boolean;
}

export interface CommercialSession {
  authenticated: true;
  expiresAtEpochMs: number;
  user: CommercialUser;
  tenant: CommercialTenant;
}

export interface CommercialUserProfile {
  id: CommercialIdentifier;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  gender: 0 | 1 | 2;
  avatar: string;
  status: number;
  deptId: CommercialIdentifier;
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

export interface CommercialLoginInput {
  tenantCode: string;
  username: string;
  password: string;
  rememberMe?: boolean;
  captchaKey?: string;
  captchaCode?: string;
}

export interface CommercialRememberedLogin {
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

export interface CommercialPublicConfig {
  system: {
    siteName: string;
    siteDescription?: string;
    logo?: string;
    watermarkEnabled?: boolean;
    version?: string;
  };
  login: {
    captchaEnabled: boolean;
    rememberMe: boolean;
  };
  register?: {
    enabled: boolean;
    verifyEmail?: boolean;
    verifyPhone?: boolean;
    needAudit?: boolean;
  };
  password?: {
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

export function parseCommercialRememberedLogin(
  value: unknown,
): CommercialRememberedLogin {
  const login = record(value, "remembered commercial login");
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
  const captcha = record(value, "commercial captcha");
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
  const session = record(value, "commercial session");
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
  const profile = record(value, "commercial user profile");
  return {
    id: identifier(profile.id, "profile.id"),
    username: text(profile.username, "profile.username"),
    nickname: stringValue(profile.nickname, "profile.nickname"),
    email: stringValue(profile.email, "profile.email"),
    phone: stringValue(profile.phone, "profile.phone"),
    gender: gender(profile.gender),
    avatar: stringValue(profile.avatar, "profile.avatar"),
    status: integer(profile.status, "profile.status"),
    deptId: identifier(profile.deptId, "profile.deptId"),
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
  const verification = record(value, "password reset verification");
  return {
    resetTicket: text(verification.resetTicket, "resetTicket"),
    expiresIn: positiveNumber(verification.expiresIn, "expiresIn"),
  };
}

export function parseCommercialPublicConfig(
  value: unknown,
): CommercialPublicConfig {
  const config = record(value, "commercial public config");
  const system = record(config.system, "commercial system config");
  const login = record(config.login, "commercial login config");
  const registerConfig = optionalRecord(config.register);
  const passwordConfig = optionalRecord(config.password);
  const captchaEnabled = booleanValue(
    login.captchaEnabled,
    "login.captchaEnabled",
  );
  const rememberMe = booleanValue(login.rememberMe, "login.rememberMe");
  const registerEnabled = optionalBoolean(registerConfig.enabled);
  return {
    system: {
      siteName: text(system.siteName, "system.siteName"),
      ...optionalTextProperty("siteDescription", system.siteDescription),
      ...optionalTextProperty("logo", system.logo),
      ...optionalBooleanProperty("watermarkEnabled", system.watermarkEnabled),
      ...optionalTextProperty("version", system.version),
    },
    login: {
      captchaEnabled,
      rememberMe,
    },
    ...(registerEnabled === undefined
      ? {}
      : {
          register: {
            enabled: registerEnabled,
            ...optionalBooleanProperty("verifyEmail", registerConfig.verifyEmail),
            ...optionalBooleanProperty("verifyPhone", registerConfig.verifyPhone),
            ...optionalBooleanProperty("needAudit", registerConfig.needAudit),
          },
        }),
    ...(passwordConfig.minLength === undefined
      ? {}
      : {
          password: {
            minLength: positiveInteger(
              passwordConfig.minLength,
              "password.minLength",
            ),
            maxLength: positiveInteger(
              passwordConfig.maxLength,
              "password.maxLength",
            ),
            requireUppercase:
              optionalBoolean(passwordConfig.requireUppercase) ?? false,
            requireLowercase:
              optionalBoolean(passwordConfig.requireLowercase) ?? false,
            requireNumber:
              optionalBoolean(passwordConfig.requireNumber) ?? false,
            requireSpecial:
              optionalBoolean(passwordConfig.requireSpecial) ?? false,
          },
        }),
  };
}

function parseCommercialUser(value: unknown): CommercialUser {
  const user = record(value, "commercial user");
  return {
    id: identifier(user.id, "user.id"),
    username: text(user.username, "user.username"),
    ...optionalTextProperty("nickname", user.nickname),
    ...optionalTextProperty("email", user.email),
    ...optionalTextProperty("avatar", user.avatar),
  };
}

function parseCommercialTenant(value: unknown): CommercialTenant {
  const tenant = record(value, "commercial tenant");
  return {
    id: identifier(tenant.id, "tenant.id"),
    code: text(tenant.code, "tenant.code"),
    name: text(tenant.name, "tenant.name"),
    ...optionalBooleanProperty("isSystem", tenant.isSystem),
  };
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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

function identifier(value: unknown, name: string): CommercialIdentifier {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new Error(`${name} must be a string or safe integer`);
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

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalTextProperty<K extends string>(
  key: K,
  value: unknown,
): Partial<Record<K, string>> {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? ({ [key]: normalized } as Record<K, string>) : {};
}

function optionalBooleanProperty<K extends string>(
  key: K,
  value: unknown,
): Partial<Record<K, boolean>> {
  return typeof value === "boolean"
    ? ({ [key]: value } as Record<K, boolean>)
    : {};
}
