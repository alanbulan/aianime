// Copyright (c) 2026 AI anime

import type { CommercialDeviceSigner } from "./commercial-device.js";

export type QueryValue = string | number | boolean | null | undefined;

export interface CommercialUser {
  id: number;
  username: string;
  nickname: string;
  email: string;
  avatar: string;
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
  id: number;
  code: string;
  name: string;
  isSystem: boolean;
}

export interface CommercialSessionSummary {
  authenticated: true;
  expiresAtEpochMs: number;
  user: CommercialUser;
  tenant: CommercialTenant;
}

export interface CommercialPasswordLoginInput {
  loginType: "PASSWORD";
  tenantCode: string;
  username: string;
  password: string;
  rememberMe?: boolean;
  captchaKey?: string;
  captchaCode?: string;
}

export interface CommercialSmsLoginInput {
  loginType: "SMS";
  tenantCode: string;
  phone: string;
  smsCode: string;
  rememberMe?: boolean;
}

export type CommercialLoginInput =
  | CommercialPasswordLoginInput
  | CommercialSmsLoginInput;

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

export interface CommercialDesktopPublicConfig {
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

export interface CommercialBaseResponse {
  code: number;
  message: string;
}

export interface CommercialSuccessMessageResponse {
  success: boolean;
  message: string;
}

export interface CommercialAvatarUploadResponse {
  avatar: string;
  contentType: string;
  sizeBytes: number;
}

export interface CommercialPasswordChangeResponse {
  success: boolean;
  sessionsRevoked: boolean;
  tokenReissued: boolean;
}

export interface CommercialPasswordResetResponse {
  success: boolean;
  message: string;
  sessionsRevoked: boolean;
  tokenReissued: boolean;
}

export interface CommercialLogoutResult {
  remoteRevoked: boolean;
  success: boolean;
}

export interface CommercialAnnouncement {
  id: string;
  title: string;
  body: string;
  level: string;
  pinned: boolean;
  publishAt: string;
  expiresAt: string;
}

export interface CommercialAnnouncementList {
  items: CommercialAnnouncement[];
  total: number;
}

export interface CommercialBootstrapQuery {
  modelOperation?: string;
  catalogVersion?: string;
  currentVersion?: string;
  target?: string;
  arch?: string;
}

export interface CommercialBootstrapRequestQuery extends CommercialBootstrapQuery {
  devicePublicKeyHash: string;
}

export interface CommercialModelCatalogQuery {
  operation?: string;
  catalogVersion?: string;
}

export interface CommercialInvocationQuery {
  status?: string;
  operation?: string;
  modelCode?: string;
  limit?: number;
  offset?: number;
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

export interface CommercialLicenseActivationResponse {
  activationId: string;
  leaseId: string;
  expiresAt: string;
}

export interface CommercialLicenseLeaseRefreshResponse {
  leaseId: string;
  issuedAt: string;
  expiresAt: string;
  keyId: string;
}

export interface CommercialLicenseDeactivationResponse {
  activationId: string;
  status: string;
  endedAt: string;
  endReason: string;
}

export interface CommercialLicenseActivationInput {
  licenseId: string;
  device: CommercialDeviceSigner;
  deviceName: string;
  platform: string;
  arch: string;
  clientVersion: string;
}

export interface CommercialCaptcha {
  key: string;
  imageDataUrl: string;
}

export interface CommercialGatewayStatus {
  configured: boolean;
  gatewayOrigin: string;
}

export interface RememberedCommercialLogin {
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

export interface CommercialClientOptions {
  baseUrl: string;
  sessionStore: CommercialSessionStore;
  rememberedLoginStore?: CommercialRememberedLoginStore;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: CommercialUser;
  tenant: CommercialTenant;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  rawBody?: Uint8Array;
  formData?: FormData;
  contentType?: string;
  token?: string;
  deviceId?: string;
  accept?: string;
}

export interface CommercialModelRequest {
  method: string;
  path: string;
  headers?: HeadersInit;
  body?: BodyInit;
  devicePublicKeyHash: string;
  signal?: AbortSignal;
  retryTransientFailures?: boolean;
}
