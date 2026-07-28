// Copyright (c) 2026 AI anime
export type GatewayMode = "official" | "custom";

export interface GatewayEndpointPreview {
  baseUrl: string;
  apiKeyPreview: string;
  configured: boolean;
}

export interface OfficialGatewayConfig extends GatewayEndpointPreview {
  source: string;
  environment: GatewayEndpointPreview;
}

export interface CustomGatewayConfig extends GatewayEndpointPreview {
  adminBaseUrl: string;
  tokenName: string;
  tokenId: string;
}

export interface EffectiveGatewayConfig {
  source: string;
  baseUrl: string;
  apiKeyPreview: string;
  configured: boolean;
}

export interface NewApiDatabaseStatus {
  configured: boolean;
  available?: boolean;
  source: string;
  databaseType?: "sqlite" | "external";
}

export interface SavedProviderChannelConfig {
  provider: string;
  configured: boolean;
  upstreamKeyPreview: string;
  baseUrl: string;
}

export interface SavedMediaModelConfig {
  provider: string;
  upstreamModel: string;
}

export interface SavedEmbeddingModelConfig {
  provider: string;
  upstreamModel: string;
  dimension: number;
  batchSize?: number;
  internalModel?: string;
}

export interface ModelGatewayProvisionerConfig {
  enabled: boolean;
  adminBaseUrl: string;
  dbConfigured: boolean;
  adminUsername: string;
  relayTokenName: string;
  relayBaseUrl: string;
  providers: Record<string, { label: string; type: number; base_url: string }>;
  providerChannels?: SavedProviderChannelConfig[];
  mediaModels?: Record<string, SavedMediaModelConfig>;
  embeddingModel?: SavedEmbeddingModelConfig;
  database?: NewApiDatabaseStatus;
}

export interface MediaRelayConfig {
  source: string;
  provider: string;
  ttlSeconds: number;
  endpoint: string;
  bucket: string;
  accessKeyIdPreview: string;
  accessKeySecretPreview: string;
  cloudName?: string;
  cloudinaryApiKeyPreview?: string;
  cloudinaryApiSecretPreview?: string;
  apiFolder?: string;
  configured: boolean;
}

export interface ModelGatewayConfig {
  mode: GatewayMode;
  effective: EffectiveGatewayConfig;
  official: OfficialGatewayConfig;
  custom: CustomGatewayConfig;
  provisioner?: ModelGatewayProvisionerConfig;
  mediaRelay?: MediaRelayConfig;
}

export interface SaveOfficialConfigInput {
  newApiApiKey: string;
}

export interface NewApiDatabaseConfigInput {
  sqlDsn?: string;
  sqlitePath?: string;
  adminUsername?: string;
}

export interface InitCustomNewApiInput {
  newApiBaseUrl?: string;
  database?: NewApiDatabaseConfigInput;
  setupUsername?: string;
  setupPassword?: string;
  setupConfirmPassword?: string;
}

export interface NewApiSetupInitStatus {
  initialized: boolean;
  rootInitialized: boolean;
  databaseType: string;
  setupPerformed: boolean;
  alreadyInitialized: boolean;
}

export interface InitCustomNewApiResult {
  mode: "custom";
  newApiAdminBaseUrl: string;
  newApiBaseUrl: string;
  newApiSetup?: NewApiSetupInitStatus;
}

export interface CustomChannelInput {
  provider: string;
  name?: string;
  upstreamKey: string;
  modelMapping: Record<string, string>;
  group: string;
  priority: number;
  weight: number;
  baseUrl: string;
  testModel: string;
}

export interface SaveProviderChannelsInput {
  channels: Array<{
    provider: string;
    upstreamKey?: string;
    baseUrl?: string;
  }>;
}

export interface SyncProviderChannelInput {
  newApiBaseUrl: string;
  database?: NewApiDatabaseConfigInput;
  provider: string;
  upstreamKey?: string;
  baseUrl?: string;
}

export interface SaveMediaModelsInput {
  newApiBaseUrl: string;
  database?: NewApiDatabaseConfigInput;
  models: Record<string, SavedMediaModelConfig>;
}

export interface SaveEmbeddingModelInput {
  newApiBaseUrl: string;
  database?: NewApiDatabaseConfigInput;
  provider: string;
  upstreamModel: string;
  dimension: number;
  batchSize?: number;
}

export interface SaveMediaRelayConfigInput {
  provider: "aliyun_oss" | "cloudinary";
  ttlSeconds: number;
  endpoint?: string;
  bucket?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
  apiFolder?: string;
}

export interface SaveCustomChannelsBatchInput {
  newApiBaseUrl: string;
  database?: NewApiDatabaseConfigInput;
  channels: CustomChannelInput[];
}

export type SaveCustomChannelInput = CustomChannelInput & {
  newApiBaseUrl: string;
  database?: NewApiDatabaseConfigInput;
};

export interface CustomChannelWriteResult {
  provider?: string;
  name?: string;
  ok?: boolean;
  channelId?: number | string;
  error?: string;
  upstreamKey?: string;
  [key: string]: unknown;
}

export interface SaveCustomChannelsBatchResult {
  succeeded: number;
  failed: number;
  results: CustomChannelWriteResult[];
}

export interface SyncProviderChannelResult {
  provider: string;
  channelId?: number | string;
  httpStatus?: number;
  savedChannel?: SavedProviderChannelConfig | null;
  sentPayload?: unknown;
  newApiResponse?: unknown;
}

export interface SaveMediaModelsResult extends SaveCustomChannelsBatchResult {
  models: Record<string, SavedMediaModelConfig>;
}

export interface SaveEmbeddingModelResult {
  embeddingModel: SavedEmbeddingModelConfig;
  result: CustomChannelWriteResult;
}

export interface ModelGatewaySuccess<T> {
  ok: true;
  data: T;
}

export interface ModelGatewayError {
  ok: false;
  error: string;
  code?: string;
}

export interface ModelGatewayFastApiError {
  detail?: unknown;
  error?: unknown;
  message?: unknown;
  ok?: false;
}

export type ModelGatewayResult<T> =
  | ModelGatewaySuccess<T>
  | ModelGatewayError;

export type ModelGatewayLooseResult<T> =
  | ModelGatewayResult<T>
  | ModelGatewayFastApiError;
