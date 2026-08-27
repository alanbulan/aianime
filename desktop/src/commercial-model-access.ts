import { createHash, randomUUID } from "node:crypto";

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

export interface ByokModelAssignment {
  modelId: string;
  role: ByokModelRole;
  priority: number;
  enabled: boolean;
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

const MAX_BYOK_CATALOG_BYTES = 4 * 1024 * 1024;
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

export async function fetchByokProviderModelIds(
  access: StoredCommercialModelAccess,
  providerOrInput: string | ByokProviderModelDiscoveryInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ providerId: string; models: string[]; catalogVersion: string }> {
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
  const models = await requestProviderModelIds(provider, fetchImpl);
  return {
    providerId,
    models,
    catalogVersion: catalogVersion(providerId, models),
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
        supportedModes: new Set<string>(),
      };
      for (const mode of capability.modes ?? []) group.supportedModes.add(mode);
      grouped.set(key, group);
    }
  }
  const items = Array.from(grouped.entries())
    .map(([key, item]) => ({
      id: key,
      code: item.code,
      displayName: item.displayName,
      operation: item.operation,
      capabilityJson:
        item.supportedModes.size > 0
          ? JSON.stringify({
              supportedModes: Array.from(item.supportedModes).sort(),
              routeSelector: `byok:${key.slice(0, key.lastIndexOf(":" + item.operation))}`,
            })
          : JSON.stringify({
              routeSelector: `byok:${key.slice(0, key.lastIndexOf(":" + item.operation))}`,
            }),
      parameterSchemaJson: "{}",
      clientVisible: true as const,
      status: "ACTIVE" as const,
    }))
    .sort(
      (left, right) =>
        left.operation.localeCompare(right.operation) ||
        left.displayName.localeCompare(right.displayName),
    );
  return {
    items,
    catalogVersion: catalogVersion(
      "all",
      items.map((item) => `${item.id}:${item.capabilityJson}`),
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
    const modelAssignments =
      input.modelAssignments === undefined
        ? existing?.modelAssignments ?? []
        : normalizeModelAssignments(input.modelAssignments);
    assertProtocolAssignments(protocol, modelAssignments);
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
  const modelAssignments = normalizeStoredModelAssignments(
    record.modelAssignments,
  );
  assertProtocolAssignments(protocol, modelAssignments);
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
    };
    unique.set(`${assignment.role}\u0000${assignment.modelId}`, assignment);
  });
  return Array.from(unique.values()).sort(compareAssignments);
}

async function requestProviderModelIds(
  provider: StoredByokProvider,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const url = new URL("models", `${provider.baseUrl}/`);
  if (provider.protocol === "GEMINI") url.searchParams.set("pageSize", "1000");
  const headers = providerHeaders(provider);
  const response = await fetchImpl(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${provider.name} 模型目录请求失败 (${response.status})`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BYOK_CATALOG_BYTES) {
    throw new Error(`${provider.name} 模型目录响应过大`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BYOK_CATALOG_BYTES) {
    throw new Error(`${provider.name} 模型目录响应过大`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${provider.name} 模型目录不是有效 JSON`);
  }
  const root = requiredRecord(payload, `${provider.name} model catalog`);
  const data = Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : null;
  if (!data) throw new Error(`${provider.name} 模型目录缺少 data 数组`);
  const models = new Set<string>();
  data.forEach((item, index) => {
    const model =
      typeof item === "string"
        ? item
        : provider.protocol === "GEMINI"
          ? requiredRecord(item, `model[${index}]`).name
          : requiredRecord(item, `model[${index}]`).id;
    const modelId = String(model ?? "").trim().replace(/^models\//, "");
    if (!modelId || modelId.length > 256) {
      throw new Error(`${provider.name} model[${index}].id 无效`);
    }
    models.add(modelId);
  });
  return Array.from(models).sort((left, right) => left.localeCompare(right));
}

function emptyByokCatalog() {
  return { items: [], catalogVersion: catalogVersion("empty", []) };
}

function catalogVersion(providerId: string, values: readonly string[]): string {
  return `byok-${createHash("sha256")
    .update(JSON.stringify([providerId, ...values]), "utf8")
    .digest("hex")
    .slice(0, 16)}`;
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
  if (protocol === "GEMINI") {
    return /\/v\d+(?:beta\d*)?$/.test(baseUrl) ? baseUrl : `${baseUrl}/v1beta`;
  }
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

function normalizeProviderProtocol(value: unknown): ByokProviderProtocol {
  const protocol = String(value ?? "").trim().toUpperCase();
  if (!BYOK_PROVIDER_PROTOCOL_SET.has(protocol)) {
    throw new Error("BYOK 供应商协议无效");
  }
  return protocol as ByokProviderProtocol;
}

function assertProtocolAssignments(
  protocol: ByokProviderProtocol,
  assignments: readonly ByokModelAssignment[],
): void {
  if (protocol === "OPENAI_COMPATIBLE") return;
  const unsupported = assignments.find((assignment) => assignment.role !== "TEXT");
  if (unsupported) {
    throw new Error(`${protocol} 原生协议当前仅支持文本模型用途`);
  }
}

function providerHeaders(provider: StoredByokProvider): Headers {
  const headers = new Headers({ Accept: "application/json" });
  if (!provider.apiKey) return headers;
  if (provider.protocol === "ANTHROPIC") {
    headers.set("X-Api-Key", provider.apiKey);
    headers.set("Anthropic-Version", "2023-06-01");
  } else if (provider.protocol === "GEMINI") {
    headers.set("X-Goog-Api-Key", provider.apiKey);
  } else {
    headers.set("Authorization", `Bearer ${provider.apiKey}`);
  }
  return headers;
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
  return { ...value };
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
