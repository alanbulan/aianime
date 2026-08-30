import { createHash, randomUUID } from "node:crypto";

import { resolveProviderStrategy } from "./commercial-model-providers/factory.js";
import type { ProviderDiscoveredModel } from "./commercial-model-providers/types.js";
import {
  readEncryptedJsonFile,
  writeEncryptedJsonFile,
  type SecureStorageAdapter,
} from "./secure-file-store.js";
import { requiredRecordZh as requiredRecord } from "./value-validation.js";

export const BYOK_PROVIDER_PROTOCOLS = [
  "OPENAI_COMPATIBLE",
  "ANTHROPIC",
  "GEMINI",
] as const;

export type ByokProviderProtocol = (typeof BYOK_PROVIDER_PROTOCOLS)[number];

export const BYOK_MODEL_ROLES = [
  "TEXT",
  "IMAGE_GENERATION",
  "IMAGE_EDIT",
  "VIDEO_TEXT_TO_VIDEO",
  "VIDEO_IMAGE_TO_VIDEO",
  "VIDEO_FIRST_LAST_FRAME",
  "VIDEO_IMAGE_REFERENCE",
  "VIDEO_ALL_REFERENCE",
  "VIDEO_EDIT",
  "AUDIO_SPEECH",
  "AUDIO_VOICE_CLONE",
  "AUDIO_VOICE_DESIGN",
  "AUDIO_MUSIC",
  "EMBEDDING",
] as const;

export type ByokModelRole = (typeof BYOK_MODEL_ROLES)[number];

export interface ModelRuntimeOverrides {
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export interface ByokModelAssignment {
  modelId: string;
  role: ByokModelRole;
  priority: number;
  enabled: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  runtimeOverrides?: ModelRuntimeOverrides;
}

export interface EffectiveModelRuntimeSettings {
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export function effectiveModelRuntimeSettings(
  assignment: ByokModelAssignment,
): EffectiveModelRuntimeSettings {
  const overrides = assignment.runtimeOverrides;
  const reasoningEfforts = overrides?.reasoningEfforts
    ?? assignment.reasoningEfforts;
  const requestedDefault = overrides?.defaultReasoningEffort
    ?? assignment.defaultReasoningEffort;
  const defaultReasoningEffort = requestedDefault
    && reasoningEfforts?.includes(requestedDefault)
    ? requestedDefault
    : undefined;
  return {
    ...(overrides?.contextWindow ?? assignment.contextWindow
      ? { contextWindow: overrides?.contextWindow ?? assignment.contextWindow }
      : {}),
    ...(overrides?.maxOutputTokens ?? assignment.maxOutputTokens
      ? { maxOutputTokens: overrides?.maxOutputTokens ?? assignment.maxOutputTokens }
      : {}),
    ...(reasoningEfforts?.length ? { reasoningEfforts: [...reasoningEfforts] } : {}),
    ...(defaultReasoningEffort ? { defaultReasoningEffort } : {}),
  };
}

export interface StoredByokProvider {
  id: string;
  name: string;
  protocol: ByokProviderProtocol;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
  modelAssignments: ByokModelAssignment[];
}

export interface ByokProviderStatus {
  id: string;
  name: string;
  protocol: ByokProviderProtocol;
  baseUrl: string;
  apiKeyPreview: string;
  configured: boolean;
  enabled: boolean;
  priority: number;
  modelAssignments: ByokModelAssignment[];
}

export interface StoredCommercialModelAccess {
  schemaVersion: 5;
  cloudModelAssignments: ByokModelAssignment[];
  byokProviders: StoredByokProvider[];
}

export interface CommercialModelAccessStatus {
  mode: "mixed";
  cloudModelAssignments: ByokModelAssignment[];
  byokConfigured: boolean;
  byokProviders: ByokProviderStatus[];
}

export interface ByokProviderModelDiscoveryInput {
  providerId?: string;
  name?: string;
  protocol?: ByokProviderProtocol;
  baseUrl?: string;
  apiKey?: string;
}

const MAX_MODEL_ASSIGNMENTS = 256;
const MAX_BYOK_PROVIDERS = 16;
const BYOK_MODEL_ROLE_SET = new Set<string>(BYOK_MODEL_ROLES);
const DEPRECATED_BYOK_MODEL_ROLE_SET = new Set(["RERANK", "MODERATION"]);
const BYOK_PROVIDER_PROTOCOL_SET = new Set<string>(BYOK_PROVIDER_PROTOCOLS);
const BYOK_ROLE_CAPABILITY: Record<
  ByokModelRole,
  { operation: string; modes?: readonly string[] }
> = {
  TEXT: { operation: "TEXT" },
  IMAGE_GENERATION: { operation: "IMAGE", modes: ["TEXT_TO_IMAGE"] },
  IMAGE_EDIT: { operation: "IMAGE", modes: ["IMAGE_TO_IMAGE"] },
  VIDEO_TEXT_TO_VIDEO: { operation: "VIDEO", modes: ["TEXT_TO_VIDEO"] },
  VIDEO_IMAGE_TO_VIDEO: { operation: "VIDEO", modes: ["FIRST_FRAME"] },
  VIDEO_FIRST_LAST_FRAME: {
    operation: "VIDEO",
    modes: ["FIRST_LAST_FRAME"],
  },
  VIDEO_IMAGE_REFERENCE: {
    operation: "VIDEO",
    modes: ["IMAGE_TO_VIDEO", "IMAGE_REFERENCE"],
  },
  VIDEO_ALL_REFERENCE: { operation: "VIDEO", modes: ["ALL_REFERENCE"] },
  VIDEO_EDIT: { operation: "VIDEO", modes: ["VIDEO_EDIT"] },
  AUDIO_SPEECH: { operation: "AUDIO_VOICE_CLONE", modes: ["SPEECH"] },
  AUDIO_VOICE_CLONE: {
    operation: "AUDIO_VOICE_CLONE",
    modes: ["VOICE_CLONE"],
  },
  AUDIO_VOICE_DESIGN: {
    operation: "AUDIO_VOICE_DESIGN",
    modes: ["VOICE_DESIGN"],
  },
  AUDIO_MUSIC: { operation: "AUDIO_MUSIC", modes: ["MUSIC"] },
  EMBEDDING: { operation: "EMBEDDING" },
};

const BYOK_VOICE_DESIGN_PARAMETER_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    voice_prompt: { type: "string", maxLength: 2048 },
    preview_text: { type: "string", maxLength: 1024 },
    preferred_name: {
      type: "string",
      default: "custom_voice",
      maxLength: 16,
    },
    language: {
      type: "string",
      enum: ["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"],
      default: "zh",
    },
    sample_rate: {
      type: "integer",
      enum: [8000, 16000, 24000, 48000],
      default: 24000,
    },
    response_format: {
      type: "string",
      enum: ["wav", "mp3"],
      default: "wav",
    },
  },
});

export async function fetchByokProviderModelIds(
  access: StoredCommercialModelAccess,
  providerOrInput: string | ByokProviderModelDiscoveryInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  providerId: string;
  models: string[];
  modelMetadata: ProviderDiscoveredModel[];
  catalogVersion: string;
}> {
  const input =
    typeof providerOrInput === "string"
      ? { providerId: providerOrInput }
      : providerOrInput;
  const requestedProviderId = input.providerId?.trim()
    ? normalizeProviderId(input.providerId)
    : "";
  const existing = requestedProviderId
    ? access.byokProviders.find((item) => item.id === requestedProviderId)
    : undefined;
  if (!existing && !input.baseUrl?.trim()) {
    throw new Error("BYOK 供应商不存在");
  }
  const protocol = normalizeProviderProtocol(
    input.protocol ?? existing?.protocol ?? "OPENAI_COMPATIBLE",
  );
  const baseUrl = normalizeByokBaseUrl(
    input.baseUrl?.trim() || existing?.baseUrl || "",
    protocol,
  );
  const providerId = requestedProviderId || "draft";
  const provider: StoredByokProvider = {
    id: providerId,
    name: normalizeProviderName(input.name, existing?.name, baseUrl),
    protocol,
    baseUrl,
    apiKey: input.apiKey?.trim() || existing?.apiKey || "",
    enabled: true,
    priority: existing?.priority ?? 100,
    modelAssignments: [],
  };
  const strategy = resolveProviderStrategy(provider.protocol, provider.baseUrl);
  const discoveryInput = {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    fetchImpl,
    providerName: provider.name,
  };
  const modelMetadata = strategy.discoverModels
    ? await strategy.discoverModels(discoveryInput)
    : (await strategy.discoverModelIds(discoveryInput)).map((id) => ({ id }));
  const models = modelMetadata.map((model) => model.id);
  return {
    providerId,
    models,
    modelMetadata,
    catalogVersion: catalogVersion(providerId, modelMetadata),
  };
}

export async function fetchByokModelCatalog(
  access: StoredCommercialModelAccess,
  operation?: string,
): Promise<{
  items: Array<{
    id: string;
    code: string;
    displayName: string;
    operation: string;
    capabilityJson: string;
    parameterSchemaJson: string;
    clientVisible: true;
    status: "ACTIVE";
  }>;
  catalogVersion: string;
}> {
  const normalizedOperation = operation?.trim().toUpperCase() || "";
  const enabledProviders = access.byokProviders.filter((item) => item.enabled);
  if (enabledProviders.length === 0) return emptyByokCatalog();
  const grouped = new Map<
    string,
    {
      code: string;
      displayName: string;
      operation: string;
      parameterSchemaJson: string;
      supportedModes: Set<string>;
    }
  >();
  for (const provider of enabledProviders) {
    for (const assignment of provider.modelAssignments) {
      if (!assignment.enabled) continue;
      const capability = BYOK_ROLE_CAPABILITY[assignment.role];
      if (normalizedOperation && capability.operation !== normalizedOperation) continue;
      const key = `${provider.id}:${assignment.modelId}:${capability.operation}`;
      const group = grouped.get(key) ?? {
        code: assignment.modelId,
        displayName: `${assignment.modelId} · ${provider.name}`,
        operation: capability.operation,
        parameterSchemaJson:
          resolveProviderStrategy(
            provider.protocol,
            provider.baseUrl,
          ).parameterSchema(
            assignment.role,
            assignment.modelId,
          ) ??
          (capability.operation === "AUDIO_VOICE_DESIGN"
            ? BYOK_VOICE_DESIGN_PARAMETER_SCHEMA
            : "{}"),
        supportedModes: new Set<string>(),
      };
      for (const mode of capability.modes ?? []) group.supportedModes.add(mode);
      grouped.set(key, group);
    }
  }
  const items = Array.from(grouped.entries())
    .map(([key, item]) => {
      const separator = key.lastIndexOf(":" + item.operation);
      const providerAndModel = key.slice(0, separator);
      const providerId = providerAndModel.slice(0, providerAndModel.indexOf(":"));
      const modelId = providerAndModel.slice(providerId.length + 1);
      const assignment = access.byokProviders
        .find((provider) => provider.id === providerId)
        ?.modelAssignments.find((candidate) => (
          candidate.modelId === modelId
          && BYOK_ROLE_CAPABILITY[candidate.role].operation === item.operation
        ));
      const capabilities = {
        ...(item.supportedModes.size > 0
          ? { supportedModes: Array.from(item.supportedModes).sort() }
          : {}),
        routeSelector: `byok:${providerAndModel}`,
        ...(assignment
          && effectiveModelRuntimeSettings(assignment).contextWindow
          ? {
              contextWindowTokens:
                effectiveModelRuntimeSettings(assignment).contextWindow,
            }
          : {}),
        ...(assignment
          && effectiveModelRuntimeSettings(assignment).maxOutputTokens
          ? {
              maxOutputTokens:
                effectiveModelRuntimeSettings(assignment).maxOutputTokens,
            }
          : {}),
      };
      const parameterSchemaJson = mergeReasoningParameterSchema(
        item.parameterSchemaJson,
        assignment ? effectiveModelRuntimeSettings(assignment) : undefined,
      );
      return {
      id: key,
      code: item.code,
      displayName: item.displayName,
      operation: item.operation,
      capabilityJson: JSON.stringify(capabilities),
      parameterSchemaJson,
      clientVisible: true as const,
      status: "ACTIVE" as const,
      };
    })
    .sort(
      (left, right) =>
        left.operation.localeCompare(right.operation) ||
        left.displayName.localeCompare(right.displayName),
    );
  return {
    items,
    catalogVersion: catalogVersion(
      "all",
      items.map((item) => (
        `${item.id}:${item.capabilityJson}:${item.parameterSchemaJson}`
      )),
    ),
  };
}

export class EncryptedFileCommercialModelAccessStore {
  private cache: StoredCommercialModelAccess | null | undefined;

  constructor(
    private readonly filePath: string,
    private readonly secureStorage: SecureStorageAdapter,
  ) {}

  async load(): Promise<StoredCommercialModelAccess> {
    if (this.cache !== undefined) return this.cache ?? defaultModelAccess();
    this.cache = await readEncryptedJsonFile(
      this.filePath,
      this.secureStorage,
      parseStoredModelAccess,
    );
    return this.cache ?? defaultModelAccess();
  }

  async configureByok(input: {
    providerId?: string;
    name?: string;
    protocol?: ByokProviderProtocol;
    baseUrl: string;
    apiKey?: string;
    enabled?: boolean;
    priority?: number;
    modelAssignments?: ByokModelAssignment[];
  }): Promise<StoredCommercialModelAccess> {
    const previous = await this.load();
    const providerId = normalizeProviderId(input.providerId || randomUUID());
    const existing = previous.byokProviders.find((item) => item.id === providerId);
    if (!existing && previous.byokProviders.length >= MAX_BYOK_PROVIDERS) {
      throw new Error(`BYOK 供应商最多 ${MAX_BYOK_PROVIDERS} 个`);
    }
    const protocol = normalizeProviderProtocol(
      input.protocol ?? existing?.protocol ?? "OPENAI_COMPATIBLE",
    );
    const baseUrl = normalizeByokBaseUrl(input.baseUrl, protocol);
    const requestedAssignments =
      input.modelAssignments === undefined
        ? existing?.modelAssignments ?? []
        : normalizeModelAssignments(input.modelAssignments);
    if (input.modelAssignments !== undefined) {
      resolveProviderStrategy(protocol, baseUrl).validateInputAssignments?.(
        requestedAssignments,
      );
    }
    const modelAssignments = migrateStoredProviderAssignments(
      protocol,
      baseUrl,
      requestedAssignments,
    );
    assertProviderAssignments(protocol, baseUrl, modelAssignments);
    const nextProvider: StoredByokProvider = {
      id: providerId,
      name: normalizeProviderName(input.name, existing?.name, baseUrl),
      protocol,
      baseUrl,
      apiKey: input.apiKey?.trim() || existing?.apiKey || "",
      enabled: input.enabled ?? existing?.enabled ?? true,
      priority: normalizePriority(input.priority, existing?.priority ?? 100),
      modelAssignments,
    };
    const next: StoredCommercialModelAccess = {
      schemaVersion: 5,
      cloudModelAssignments: previous.cloudModelAssignments,
      byokProviders: [
        ...previous.byokProviders.filter((item) => item.id !== providerId),
        nextProvider,
      ].sort(compareProviders),
    };
    await this.save(next);
    return next;
  }

  async selectCloud(
    modelAssignments?: ByokModelAssignment[],
  ): Promise<StoredCommercialModelAccess> {
    const previous = await this.load();
    const next: StoredCommercialModelAccess = {
      ...previous,
      schemaVersion: 5,
      cloudModelAssignments:
        modelAssignments === undefined
          ? previous.cloudModelAssignments
          : normalizeModelAssignments(modelAssignments),
    };
    await this.save(next);
    return next;
  }

  async clearByok(providerId?: string): Promise<StoredCommercialModelAccess> {
    const previous = await this.load();
    const normalizedId = providerId ? normalizeProviderId(providerId) : "";
    const next: StoredCommercialModelAccess = {
      ...previous,
      schemaVersion: 5,
      byokProviders: normalizedId
        ? previous.byokProviders.filter((item) => item.id !== normalizedId)
        : [],
    };
    await this.save(next);
    return next;
  }

  status(value: StoredCommercialModelAccess): CommercialModelAccessStatus {
    return {
      mode: "mixed",
      cloudModelAssignments: value.cloudModelAssignments.map(copyAssignment),
      byokConfigured: value.byokProviders.length > 0,
      byokProviders: value.byokProviders.map((provider) => ({
        id: provider.id,
        name: provider.name,
        protocol: provider.protocol,
        baseUrl: provider.baseUrl,
        apiKeyPreview: maskSecret(provider.apiKey),
        configured: Boolean(provider.baseUrl),
        enabled: provider.enabled,
        priority: provider.priority,
        modelAssignments: provider.modelAssignments.map(copyAssignment),
      })),
    };
  }

  private async save(value: StoredCommercialModelAccess): Promise<void> {
    await writeEncryptedJsonFile(this.filePath, this.secureStorage, value);
    this.cache = value;
  }
}

function defaultModelAccess(): StoredCommercialModelAccess {
  return {
    schemaVersion: 5,
    cloudModelAssignments: [],
    byokProviders: [],
  };
}

function parseStoredModelAccess(value: unknown): StoredCommercialModelAccess {
  const record = requiredRecord(value, "model access record");
  const schemaVersion = Number(record.schemaVersion);
  if ([1, 2, 3].includes(schemaVersion)) {
    return migrateLegacyModelAccess(record, schemaVersion);
  }
  if (schemaVersion !== 4 && schemaVersion !== 5) {
    throw new Error("不支持的模型访问配置版本");
  }
  if (!Array.isArray(record.byokProviders)) {
    throw new Error("BYOK 供应商配置必须是数组");
  }
  if (record.byokProviders.length > MAX_BYOK_PROVIDERS) {
    throw new Error(`BYOK 供应商最多 ${MAX_BYOK_PROVIDERS} 个`);
  }
  return {
    schemaVersion: 5,
    cloudModelAssignments: normalizeStoredModelAssignments(
      record.cloudModelAssignments,
    ),
    byokProviders: record.byokProviders
      .map((item, index) =>
        parseProvider(
          item,
          index,
          schemaVersion === 4 ? "OPENAI_COMPATIBLE" : undefined,
        ),
      )
      .sort(compareProviders),
  };
}

function migrateLegacyModelAccess(
  record: Record<string, unknown>,
  schemaVersion: number,
): StoredCommercialModelAccess {
  const mode = String(record.mode ?? "").trim().toLowerCase();
  if (mode !== "cloud" && mode !== "byok") {
    throw new Error("模型访问模式无效");
  }
  const rawBaseUrl =
    typeof record.byokBaseUrl === "string" ? record.byokBaseUrl.trim() : "";
  if (mode === "byok" && !rawBaseUrl) {
    throw new Error("BYOK 模式缺少 Base URL");
  }
  const cloudModelAssignments =
    schemaVersion >= 3
      ? normalizeStoredModelAssignments(record.cloudModelAssignments)
      : [];
  if (!rawBaseUrl) {
    return { schemaVersion: 5, cloudModelAssignments, byokProviders: [] };
  }
  const baseUrl = normalizeByokBaseUrl(
    rawBaseUrl,
    "OPENAI_COMPATIBLE",
  );
  return {
    schemaVersion: 5,
    cloudModelAssignments,
    byokProviders: [
      {
        id: "legacy-openai-compatible",
        name: normalizeProviderName(undefined, undefined, baseUrl),
        protocol: "OPENAI_COMPATIBLE",
        baseUrl,
        apiKey:
          typeof record.byokApiKey === "string"
            ? record.byokApiKey.trim()
            : "",
        enabled: true,
        priority: 100,
        modelAssignments:
          schemaVersion >= 2
            ? normalizeStoredModelAssignments(record.byokModelAssignments)
            : [],
      },
    ],
  };
}

function parseProvider(
  value: unknown,
  index: number,
  defaultProtocol?: ByokProviderProtocol,
): StoredByokProvider {
  const record = requiredRecord(value, `BYOK provider[${index}]`);
  const protocol = normalizeProviderProtocol(
    record.protocol ?? defaultProtocol,
  );
  const baseUrl = normalizeByokBaseUrl(String(record.baseUrl ?? ""), protocol);
  const modelAssignments = migrateStoredProviderAssignments(
    protocol,
    baseUrl,
    normalizeStoredModelAssignments(record.modelAssignments),
  );
  assertProviderAssignments(protocol, baseUrl, modelAssignments);
  return {
    id: normalizeProviderId(String(record.id ?? "")),
    name: normalizeProviderName(String(record.name ?? ""), "", baseUrl),
    protocol,
    baseUrl,
    apiKey: typeof record.apiKey === "string" ? record.apiKey.trim() : "",
    enabled: record.enabled !== false,
    priority: normalizePriority(record.priority, 100),
    modelAssignments,
  };
}

function normalizeStoredModelAssignments(value: unknown): ByokModelAssignment[] {
  if (!Array.isArray(value)) return normalizeModelAssignments(value);
  return normalizeModelAssignments(
    value.filter((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return true;
      const role = String((item as Record<string, unknown>).role ?? "")
        .trim()
        .toUpperCase();
      return !DEPRECATED_BYOK_MODEL_ROLE_SET.has(role);
    }),
  );
}

function normalizeModelAssignments(
  value: unknown,
  defaultPriority = 100,
): ByokModelAssignment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("模型用途必须是数组");
  if (value.length > MAX_MODEL_ASSIGNMENTS) {
    throw new Error(`模型用途最多 ${MAX_MODEL_ASSIGNMENTS} 项`);
  }
  const unique = new Map<string, ByokModelAssignment>();
  value.forEach((item, index) => {
    const record = requiredRecord(item, `model assignment[${index}]`);
    const modelId = String(record.modelId ?? "").trim();
    if (!modelId || modelId.length > 256 || /[\u0000-\u001f\u007f]/.test(modelId)) {
      throw new Error(`model assignment[${index}].modelId 无效`);
    }
    const role = String(record.role ?? "").trim().toUpperCase();
    if (!BYOK_MODEL_ROLE_SET.has(role)) {
      throw new Error(`model assignment[${index}].role 无效`);
    }
    const assignment: ByokModelAssignment = {
      modelId,
      role: role as ByokModelRole,
      priority: normalizePriority(record.priority, defaultPriority + index),
      enabled: record.enabled !== false,
      ...normalizedModelMetadata(record),
    };
    unique.set(`${assignment.role}\u0000${assignment.modelId}`, assignment);
  });
  return Array.from(unique.values()).sort(compareAssignments);
}

function emptyByokCatalog() {
  return { items: [], catalogVersion: catalogVersion("empty", []) };
}

function catalogVersion(providerId: string, values: readonly unknown[]): string {
  return `byok-${createHash("sha256")
    .update(JSON.stringify([providerId, ...values]), "utf8")
    .digest("hex")
    .slice(0, 16)}`;
}

function normalizedModelMetadata(
  record: Record<string, unknown>,
): Pick<
  ByokModelAssignment,
  | "contextWindow"
  | "maxOutputTokens"
  | "reasoningEfforts"
  | "defaultReasoningEffort"
  | "runtimeOverrides"
> {
  const contextWindow = Number(record.contextWindow);
  const maxOutputTokens = Number(record.maxOutputTokens);
  const reasoningEfforts = normalizeReasoningEfforts(record.reasoningEfforts);
  const defaultReasoningEffort = typeof record.defaultReasoningEffort === "string"
    ? record.defaultReasoningEffort.trim()
    : "";
  const runtimeOverrides = normalizeRuntimeOverrides(record.runtimeOverrides);
  return {
    ...(Number.isSafeInteger(contextWindow) && contextWindow > 0
      ? { contextWindow }
      : {}),
    ...(Number.isSafeInteger(maxOutputTokens) && maxOutputTokens > 0
      ? { maxOutputTokens }
      : {}),
    ...(reasoningEfforts.length > 0 ? { reasoningEfforts } : {}),
    ...(defaultReasoningEffort
      && reasoningEfforts.includes(defaultReasoningEffort)
      ? { defaultReasoningEffort }
      : {}),
    ...(runtimeOverrides ? { runtimeOverrides } : {}),
  };
}

function normalizeRuntimeOverrides(value: unknown): ModelRuntimeOverrides | undefined {
  if (value === undefined || value === null) return undefined;
  const record = requiredRecord(value, "model runtime overrides");
  const contextWindow = Number(record.contextWindow);
  const maxOutputTokens = Number(record.maxOutputTokens);
  const reasoningEfforts = normalizeReasoningEfforts(record.reasoningEfforts);
  const requestedDefault = typeof record.defaultReasoningEffort === "string"
    ? record.defaultReasoningEffort.trim()
    : "";
  const overrides: ModelRuntimeOverrides = {
    ...(Number.isSafeInteger(contextWindow) && contextWindow > 0
      ? { contextWindow }
      : {}),
    ...(Number.isSafeInteger(maxOutputTokens) && maxOutputTokens > 0
      ? { maxOutputTokens }
      : {}),
    ...(reasoningEfforts.length ? { reasoningEfforts } : {}),
    ...(requestedDefault && reasoningEfforts.includes(requestedDefault)
      ? { defaultReasoningEffort: requestedDefault }
      : {}),
  };
  return Object.keys(overrides).length ? overrides : undefined;
}

function normalizeReasoningEfforts(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => (
            Boolean(item)
            && item.length <= 64
            && !/[\u0000-\u001f\u007f]/u.test(item)
          )),
      ))
    : [];
}

function mergeReasoningParameterSchema(
  rawSchema: string,
  assignment: EffectiveModelRuntimeSettings | undefined,
): string {
  if (!assignment?.reasoningEfforts?.length) return rawSchema;
  let schema: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawSchema) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      schema = parsed as Record<string, unknown>;
    }
  } catch {
    schema = {};
  }
  const properties = schema.properties
    && typeof schema.properties === "object"
    && !Array.isArray(schema.properties)
    ? schema.properties as Record<string, unknown>
    : {};
  return JSON.stringify({
    ...schema,
    type: typeof schema.type === "string" ? schema.type : "object",
    properties: {
      ...properties,
      reasoning_effort: {
        type: "string",
        enum: assignment.reasoningEfforts,
        ...(assignment.defaultReasoningEffort
          ? { default: assignment.defaultReasoningEffort }
          : {}),
      },
    },
  });
}

function normalizeByokBaseUrl(
  value: string,
  protocol: ByokProviderProtocol,
): string {
  const normalized = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("BYOK Base URL 无效");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("BYOK Base URL 仅支持不含凭据、查询参数和片段的 HTTP(S) 地址");
  }
  const baseUrl = url.toString().replace(/\/+$/, "");
  return resolveProviderStrategy(protocol, baseUrl).normalizeBaseUrl(url);
}

function normalizeProviderProtocol(value: unknown): ByokProviderProtocol {
  const protocol = String(value ?? "").trim().toUpperCase();
  if (!BYOK_PROVIDER_PROTOCOL_SET.has(protocol)) {
    throw new Error("BYOK 供应商协议无效");
  }
  return protocol as ByokProviderProtocol;
}

function migrateStoredProviderAssignments(
  protocol: ByokProviderProtocol,
  baseUrl: string,
  assignments: readonly ByokModelAssignment[],
): ByokModelAssignment[] {
  return resolveProviderStrategy(protocol, baseUrl).migrateAssignments(assignments);
}

function assertProviderAssignments(
  protocol: ByokProviderProtocol,
  baseUrl: string,
  assignments: readonly ByokModelAssignment[],
): void {
  resolveProviderStrategy(protocol, baseUrl).validateAssignments(assignments);
}

function normalizeProviderId(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 128 || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(normalized)) {
    throw new Error("BYOK 供应商 ID 无效");
  }
  return normalized;
}

function normalizeProviderName(value: unknown, fallback: string | undefined, baseUrl: string): string {
  const normalized = String(value ?? "").trim() || String(fallback ?? "").trim();
  const name = normalized || new URL(baseUrl).hostname;
  if (name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error("BYOK 供应商名称无效");
  }
  return name;
}

function normalizePriority(value: unknown, fallback: number): number {
  const number = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 9999) {
    throw new Error("模型路由优先级必须是 1 到 9999 的整数");
  }
  return number;
}

function compareAssignments(left: ByokModelAssignment, right: ByokModelAssignment): number {
  return (
    left.priority - right.priority ||
    BYOK_MODEL_ROLES.indexOf(left.role) - BYOK_MODEL_ROLES.indexOf(right.role) ||
    left.modelId.localeCompare(right.modelId)
  );
}

function compareProviders(left: StoredByokProvider, right: StoredByokProvider): number {
  return left.priority - right.priority || left.name.localeCompare(right.name);
}

function copyAssignment(value: ByokModelAssignment): ByokModelAssignment {
  return {
    ...value,
    ...(value.reasoningEfforts
      ? { reasoningEfforts: [...value.reasoningEfforts] }
      : {}),
    ...(value.runtimeOverrides
      ? {
          runtimeOverrides: {
            ...value.runtimeOverrides,
            ...(value.runtimeOverrides.reasoningEfforts
              ? {
                  reasoningEfforts: [
                    ...value.runtimeOverrides.reasoningEfforts,
                  ],
                }
              : {}),
          },
        }
      : {}),
  };
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
