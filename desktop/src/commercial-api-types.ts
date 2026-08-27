// Copyright (c) 2026 AI anime

import type { CommercialDeviceSigner } from "./commercial-device.js";

export type Identifier = string | number;
export type QueryValue = string | number | boolean | null | undefined;

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

export interface CommercialBootstrapRequestQuery extends CommercialBootstrapQuery {
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
  user?: CommercialUser;
  tenant?: CommercialTenant;
}

export interface RequestOptions {
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
  retryTransientFailures?: boolean;
}
