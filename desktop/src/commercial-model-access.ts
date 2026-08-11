import { createHash } from "node:crypto";

import {
  readEncryptedJsonFile,
  writeEncryptedJsonFile,
  type SecureStorageAdapter,
} from "./secure-file-store.js";

export type CommercialModelAccessMode = "cloud" | "byok";

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
  "AUDIO_MUSIC",
  "EMBEDDING",
  "RERANK",
  "MODERATION",
] as const;

export type ByokModelRole = (typeof BYOK_MODEL_ROLES)[number];

export interface ByokModelAssignment {
  modelId: string;
  role: ByokModelRole;
}

export interface StoredCommercialModelAccess {
  schemaVersion: 3;
  mode: CommercialModelAccessMode;
  cloudModelAssignments: ByokModelAssignment[];
  byokBaseUrl: string;
  byokApiKey: string;
  byokModelAssignments: ByokModelAssignment[];
}

export interface CommercialModelAccessStatus {
  mode: CommercialModelAccessMode;
  cloudModelAssignments: ByokModelAssignment[];
  byokConfigured: boolean;
  byokBaseUrl: string;
  byokApiKeyPreview: string;
  byokModelAssignments: ByokModelAssignment[];
}

const MAX_BYOK_CATALOG_BYTES = 4 * 1024 * 1024;
const MAX_BYOK_MODEL_ASSIGNMENTS = 128;
const BYOK_MODEL_ROLE_SET = new Set<string>(BYOK_MODEL_ROLES);
const BYOK_ROLE_CAPABILITY: Record<
  ByokModelRole,
  { operation: string; modes?: readonly string[] }
> = {
  TEXT: { operation: "TEXT" },
  IMAGE_GENERATION: { operation: "IMAGE", modes: ["TEXT_TO_IMAGE"] },
  IMAGE_EDIT: { operation: "IMAGE", modes: ["IMAGE_EDIT"] },
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
  AUDIO_SPEECH: { operation: "AUDIO", modes: ["SPEECH"] },
  AUDIO_VOICE_CLONE: { operation: "AUDIO", modes: ["VOICE_CLONE"] },
  AUDIO_MUSIC: { operation: "AUDIO", modes: ["MUSIC"] },
  EMBEDDING: { operation: "EMBEDDING" },
  RERANK: { operation: "RERANK" },
  MODERATION: { operation: "MODERATION" },
};

export async function fetchByokModelCatalog(
  access: StoredCommercialModelAccess,
  operation?: string,
  fetchImpl: typeof fetch = fetch,
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
  if (access.mode !== "byok" || !access.byokBaseUrl) {
    throw new Error("BYOK 模型目录仅在 BYOK 模式可用");
  }
  const normalizedOperation = operation?.trim().toUpperCase() || "";
  const assigned = groupByokAssignments(
    access.byokModelAssignments,
    normalizedOperation,
  );
  if (assigned.length === 0) return emptyByokCatalog();

  const url = new URL("models", `${access.byokBaseUrl}/`);
  const headers = new Headers({ Accept: "application/json" });
  if (access.byokApiKey) {
    headers.set("Authorization", `Bearer ${access.byokApiKey}`);
  }
  const response = await fetchImpl(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`BYOK 模型目录请求失败 (${response.status})`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BYOK_CATALOG_BYTES) {
    throw new Error("BYOK 模型目录响应过大");
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BYOK_CATALOG_BYTES) {
    throw new Error("BYOK 模型目录响应过大");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new Error("BYOK 模型目录不是有效 JSON");
  }
  const root = requiredRecord(payload, "BYOK model catalog");
  if (!Array.isArray(root.data)) {
    throw new Error("BYOK 模型目录缺少 data 数组");
  }
  const availableCodes = new Set(
    root.data.map((item, index) => {
      const model = requiredRecord(item, `BYOK model[${index}]`);
      if (typeof model.id !== "string" || !model.id.trim()) {
        throw new Error(`BYOK model[${index}].id 不能为空`);
      }
      return model.id.trim();
    }),
  );
  const items = assigned
    .filter((item) => availableCodes.has(item.code))
    .map((item) => ({
      id: `${item.code}:${item.operation}`,
      code: item.code,
      displayName: item.code,
      operation: item.operation,
      capabilityJson:
        item.supportedModes.length > 0
          ? JSON.stringify({ supportedModes: item.supportedModes })
          : "{}",
      parameterSchemaJson: "{}",
      clientVisible: true as const,
      status: "ACTIVE" as const,
    }));
  const versionMaterial = items.map((item) => ({
    code: item.code,
    operation: item.operation,
    capabilityJson: item.capabilityJson,
  }));
  return {
    items,
    catalogVersion: `byok-${createHash("sha256")
      .update(JSON.stringify(versionMaterial), "utf8")
      .digest("hex")
      .slice(0, 16)}`,
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
    baseUrl: string;
    apiKey?: string;
    modelAssignments?: ByokModelAssignment[];
  }): Promise<StoredCommercialModelAccess> {
    const previous = await this.load();
    const apiKey = input.apiKey?.trim() || previous.byokApiKey;
    const next: StoredCommercialModelAccess = {
      schemaVersion: 3,
      mode: "byok",
      cloudModelAssignments: previous.cloudModelAssignments ?? [],
      byokBaseUrl: normalizeByokBaseUrl(input.baseUrl),
      byokApiKey: apiKey,
      byokModelAssignments:
        input.modelAssignments === undefined
          ? previous.byokModelAssignments
          : normalizeByokModelAssignments(input.modelAssignments),
    };
    await writeEncryptedJsonFile(this.filePath, this.secureStorage, next);
    this.cache = next;
    return next;
  }

  async selectCloud(
    modelAssignments?: ByokModelAssignment[],
  ): Promise<StoredCommercialModelAccess> {
    const previous = await this.load();
    const next = {
      ...previous,
      schemaVersion: 3 as const,
      mode: "cloud" as const,
      cloudModelAssignments:
        modelAssignments === undefined
          ? previous.cloudModelAssignments ?? []
          : normalizeModelAssignments(modelAssignments),
    };
    await writeEncryptedJsonFile(this.filePath, this.secureStorage, next);
    this.cache = next;
    return next;
  }

  async clearByok(): Promise<StoredCommercialModelAccess> {
    const previous = await this.load();
    const next: StoredCommercialModelAccess = {
      ...defaultModelAccess(),
      cloudModelAssignments: previous.cloudModelAssignments ?? [],
    };
    await writeEncryptedJsonFile(this.filePath, this.secureStorage, next);
    this.cache = next;
    return next;
  }

  status(value: StoredCommercialModelAccess): CommercialModelAccessStatus {
    return {
      mode: value.mode,
      cloudModelAssignments: (value.cloudModelAssignments ?? []).map((item) => ({
        ...item,
      })),
      byokConfigured: Boolean(value.byokBaseUrl),
      byokBaseUrl: value.byokBaseUrl,
      byokApiKeyPreview: maskSecret(value.byokApiKey),
      byokModelAssignments: value.byokModelAssignments.map((item) => ({
        ...item,
      })),
    };
  }
}

function defaultModelAccess(): StoredCommercialModelAccess {
  return {
    schemaVersion: 3,
    mode: "cloud",
    cloudModelAssignments: [],
    byokBaseUrl: "",
    byokApiKey: "",
    byokModelAssignments: [],
  };
}

function parseStoredModelAccess(value: unknown): StoredCommercialModelAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("model access record must be an object");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 &&
    record.schemaVersion !== 2 &&
    record.schemaVersion !== 3
  ) {
    throw new Error("不支持的模型访问配置版本");
  }
  const mode = record.mode;
  if (mode !== "cloud" && mode !== "byok") {
    throw new Error("模型访问模式无效");
  }
  const byokBaseUrl =
    typeof record.byokBaseUrl === "string" && record.byokBaseUrl.trim()
      ? normalizeByokBaseUrl(record.byokBaseUrl)
      : "";
  if (mode === "byok" && !byokBaseUrl) {
    throw new Error("BYOK 模式缺少 Base URL");
  }
  return {
    schemaVersion: 3,
    mode,
    cloudModelAssignments:
      record.schemaVersion === 3
        ? normalizeModelAssignments(record.cloudModelAssignments)
        : [],
    byokBaseUrl,
    byokApiKey:
      typeof record.byokApiKey === "string" ? record.byokApiKey.trim() : "",
    byokModelAssignments:
      record.schemaVersion === 2 || record.schemaVersion === 3
        ? normalizeByokModelAssignments(record.byokModelAssignments)
        : [],
  };
}

function normalizeByokModelAssignments(value: unknown): ByokModelAssignment[] {
  return normalizeModelAssignments(value);
}

function normalizeModelAssignments(value: unknown): ByokModelAssignment[] {
  if (!Array.isArray(value)) {
    throw new Error("BYOK 模型用途必须是数组");
  }
  if (value.length > MAX_BYOK_MODEL_ASSIGNMENTS) {
    throw new Error(`BYOK 模型用途最多 ${MAX_BYOK_MODEL_ASSIGNMENTS} 项`);
  }
  const unique = new Map<ByokModelRole, ByokModelAssignment>();
  value.forEach((item, index) => {
    const record = requiredRecord(item, `BYOK model assignment[${index}]`);
    const modelId = String(record.modelId ?? "").trim();
    if (!modelId || modelId.length > 256 || /[\u0000-\u001f\u007f]/.test(modelId)) {
      throw new Error(`BYOK model assignment[${index}].modelId 无效`);
    }
    const role = String(record.role ?? "").trim().toUpperCase();
    if (!BYOK_MODEL_ROLE_SET.has(role)) {
      throw new Error(`BYOK model assignment[${index}].role 无效`);
    }
    const assignment = { modelId, role: role as ByokModelRole };
    unique.set(assignment.role, assignment);
  });
  return Array.from(unique.values()).sort(
    (left, right) =>
      BYOK_MODEL_ROLES.indexOf(left.role) - BYOK_MODEL_ROLES.indexOf(right.role),
  );
}

function groupByokAssignments(
  assignments: readonly ByokModelAssignment[],
  operation: string,
): Array<{ code: string; operation: string; supportedModes: string[] }> {
  const groups = new Map<
    string,
    { code: string; operation: string; supportedModes: Set<string> }
  >();
  for (const assignment of assignments) {
    const capability = BYOK_ROLE_CAPABILITY[assignment.role];
    if (operation && capability.operation !== operation) continue;
    const key = `${assignment.modelId}\u0000${capability.operation}`;
    const group = groups.get(key) ?? {
      code: assignment.modelId,
      operation: capability.operation,
      supportedModes: new Set<string>(),
    };
    for (const mode of capability.modes ?? []) group.supportedModes.add(mode);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map((item) => ({
      code: item.code,
      operation: item.operation,
      supportedModes: Array.from(item.supportedModes).sort(),
    }))
    .sort(
      (left, right) =>
        left.operation.localeCompare(right.operation) ||
        left.code.localeCompare(right.code),
    );
}

function emptyByokCatalog() {
  return {
    items: [],
    catalogVersion: `byok-${createHash("sha256")
      .update("[]", "utf8")
      .digest("hex")
      .slice(0, 16)}`,
  };
}

function normalizeByokBaseUrl(value: string): string {
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
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function requiredRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} 必须是对象`);
  }
  return value as Record<string, unknown>;
}
