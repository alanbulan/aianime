export interface CommercialQuota {
  spendableUnits: number;
  availableUnits: number;
  reservedUnits: number;
}

export interface CommercialModelCatalogItem {
  id: string | number;
  code: string;
  displayName: string;
  operation: string;
  capabilities: Record<string, unknown>;
  parameterSchema: Record<string, unknown>;
  unitsPerCall?: number;
  clientVisible?: boolean;
  status?: string;
  isDefault?: boolean;
}

export interface CommercialModelCatalog {
  catalogVersion: string;
  items: CommercialModelCatalogItem[];
}

export interface CommercialModelUsageBootstrap {
  quota: CommercialQuota | null;
  catalog: CommercialModelCatalog | null;
}

export type CommercialModelAccessMode = "mixed";
export type CommercialModelCatalogSource = "active" | "cloud";

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

export interface ByokProviderModelDiscoveryInput {
  providerId?: string;
  name?: string;
  protocol: ByokProviderProtocol;
  baseUrl: string;
  apiKey?: string;
}

export interface CommercialModelAccessStatus {
  mode: CommercialModelAccessMode;
  allowsCustomModels: boolean;
  gatewayOrigin: string;
  cloudModelAssignments: ByokModelAssignment[];
  byokConfigured: boolean;
  byokProviders: ByokProviderStatus[];
}

export interface CommercialModelRoleRoute {
  modelId: string;
  role: ByokModelRole;
  source: "cloud" | "byok";
  providerName: string;
}

export function resolveCommercialModelRoleRoute(
  status: CommercialModelAccessStatus | null | undefined,
  role: ByokModelRole,
): CommercialModelRoleRoute | null {
  if (!status) return null;
  const routes: Array<
    CommercialModelRoleRoute & {
      assignmentPriority: number;
      providerPriority: number;
    }
  > = status.cloudModelAssignments
    .filter((assignment) => assignment.enabled && assignment.role === role)
    .map((assignment) => ({
      modelId: assignment.modelId,
      role,
      source: "cloud" as const,
      providerName: "云端",
      assignmentPriority: assignment.priority,
      providerPriority: 0,
    }));
  if (status.allowsCustomModels) {
    for (const provider of status.byokProviders) {
      if (!provider.configured || !provider.enabled) continue;
      for (const assignment of provider.modelAssignments) {
        if (!assignment.enabled || assignment.role !== role) continue;
        routes.push({
          modelId: assignment.modelId,
          role,
          source: "byok",
          providerName: provider.name,
          assignmentPriority: assignment.priority,
          providerPriority: provider.priority,
        });
      }
    }
  }
  routes.sort(
    (left, right) =>
      left.assignmentPriority - right.assignmentPriority ||
      left.providerPriority - right.providerPriority ||
      (left.source === right.source ? 0 : left.source === "cloud" ? -1 : 1) ||
      left.providerName.localeCompare(right.providerName) ||
      left.modelId.localeCompare(right.modelId),
  );
  const selected = routes[0];
  return selected
    ? {
        modelId: selected.modelId,
        role: selected.role,
        source: selected.source,
        providerName: selected.providerName,
      }
    : null;
}

export function parseCommercialModelAccessStatus(
  value: unknown,
): CommercialModelAccessStatus {
  const root = record(value, "commercial model access status");
  if (root.mode !== "mixed") {
    throw new Error("commercial model access mode is invalid");
  }
  return {
    mode: root.mode,
    allowsCustomModels: root.allowsCustomModels === true,
    gatewayOrigin: text(root.gatewayOrigin, "gatewayOrigin"),
    cloudModelAssignments: parseModelAssignments(
      root.cloudModelAssignments,
      "cloudModelAssignments",
    ),
    byokConfigured: root.byokConfigured === true,
    byokProviders: parseByokProviders(root.byokProviders),
  };
}

function parseByokProviders(value: unknown): ByokProviderStatus[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error("byokProviders must be an array");
  return value.map((item, index) => {
    const provider = record(item, `byokProviders[${index}]`);
    return {
      id: text(provider.id, `byokProviders[${index}].id`),
      name: text(provider.name, `byokProviders[${index}].name`),
      protocol: providerProtocol(
        provider.protocol,
        `byokProviders[${index}].protocol`,
      ),
      baseUrl: text(provider.baseUrl, `byokProviders[${index}].baseUrl`),
      apiKeyPreview:
        typeof provider.apiKeyPreview === "string"
          ? provider.apiKeyPreview.trim()
          : "",
      configured: provider.configured === true,
      enabled: provider.enabled !== false,
      priority: positiveInteger(provider.priority, 100),
      modelAssignments: parseModelAssignments(
        provider.modelAssignments,
        `byokProviders[${index}].modelAssignments`,
      ),
    };
  });
}

function providerProtocol(value: unknown, name: string): ByokProviderProtocol {
  const protocol = text(value, name);
  if (!(BYOK_PROVIDER_PROTOCOLS as readonly string[]).includes(protocol)) {
    throw new Error(`${name} is invalid`);
  }
  return protocol as ByokProviderProtocol;
}

function parseModelAssignments(
  value: unknown,
  name: string,
): ByokModelAssignment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  return value.map((item, index) => {
    const assignment = record(item, `${name}[${index}]`);
    const role = text(assignment.role, `${name}[${index}].role`);
    if (!(BYOK_MODEL_ROLES as readonly string[]).includes(role)) {
      throw new Error(`${name}[${index}].role is invalid`);
    }
    return {
      modelId: text(assignment.modelId, `${name}[${index}].modelId`),
      role: role as ByokModelRole,
      priority: positiveInteger(assignment.priority, 100 + index),
      enabled: assignment.enabled !== false,
    };
  });
}

function positiveInteger(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error("priority must be a positive integer");
  }
  return Number(value);
}

const ROLES_BY_OPERATION: Readonly<Record<string, readonly ByokModelRole[]>> = {
  TEXT: ["TEXT"],
  IMAGE: ["IMAGE_GENERATION", "IMAGE_EDIT"],
  VIDEO: [
    "VIDEO_TEXT_TO_VIDEO",
    "VIDEO_IMAGE_TO_VIDEO",
    "VIDEO_FIRST_LAST_FRAME",
    "VIDEO_IMAGE_REFERENCE",
    "VIDEO_ALL_REFERENCE",
    "VIDEO_EDIT",
  ],
  AUDIO: ["AUDIO_SPEECH", "AUDIO_VOICE_CLONE", "AUDIO_MUSIC"],
  EMBEDDING: ["EMBEDDING"],
};

const MODES_BY_ROLE: Readonly<
  Partial<Record<ByokModelRole, readonly string[]>>
> = {
  IMAGE_GENERATION: ["TEXT_TO_IMAGE", "IMAGE_GENERATION"],
  IMAGE_EDIT: ["IMAGE_EDIT", "EDIT"],
  VIDEO_TEXT_TO_VIDEO: ["TEXT_TO_VIDEO"],
  VIDEO_IMAGE_TO_VIDEO: ["FIRST_FRAME", "IMAGE_TO_VIDEO"],
  VIDEO_FIRST_LAST_FRAME: ["FIRST_LAST_FRAME"],
  VIDEO_IMAGE_REFERENCE: ["IMAGE_REFERENCE", "REFERENCE_IMAGE"],
  VIDEO_ALL_REFERENCE: ["ALL_REFERENCE"],
  VIDEO_EDIT: ["VIDEO_EDIT", "EDIT"],
  AUDIO_SPEECH: ["SPEECH", "TEXT_TO_SPEECH", "SPEECH_SYNTHESIS"],
  AUDIO_VOICE_CLONE: ["VOICE_CLONE"],
  AUDIO_MUSIC: ["MUSIC", "TEXT_TO_MUSIC", "MUSIC_GENERATION"],
};

export function commercialModelRoles(
  item: CommercialModelCatalogItem,
): ByokModelRole[] {
  const operation = item.operation.trim().toUpperCase();
  const roles = ROLES_BY_OPERATION[operation] ?? [];
  const rawModes = item.capabilities.supportedModes ?? item.capabilities.modes;
  const modes = Array.isArray(rawModes)
    ? rawModes
        .filter((value): value is string => typeof value === "string")
        .map(normalizeMode)
    : [];
  return roles.filter((role) => {
    const requiredModes = MODES_BY_ROLE[role];
    if (!requiredModes || modes.length === 0) {
      return (
        !requiredModes ||
        role === "IMAGE_GENERATION" ||
        role === "VIDEO_TEXT_TO_VIDEO"
      );
    }
    return requiredModes.some((mode) => modes.includes(mode));
  });
}

function normalizeMode(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_");
}

export function parseCommercialQuota(value: unknown): CommercialQuota {
  const root = record(value, "commercial quota");
  const account = record(root.account, "commercial quota account");
  return {
    spendableUnits: nonNegativeNumber(root.spendableUnits, "spendableUnits"),
    availableUnits: nonNegativeNumber(
      account.availableUnits,
      "account.availableUnits",
    ),
    reservedUnits: nonNegativeNumber(
      account.reservedUnits,
      "account.reservedUnits",
    ),
  };
}

export function parseCommercialModelCatalog(
  value: unknown,
): CommercialModelCatalog {
  const root = record(value, "commercial model catalog");
  if (!Array.isArray(root.items)) {
    throw new Error("commercial model catalog items must be an array");
  }
  return {
    catalogVersion: text(root.catalogVersion, "catalogVersion"),
    items: root.items.map((item, index) =>
      parseCommercialModelCatalogItem(item, `models[${index}]`),
    ),
  };
}

export function parseCommercialModelCatalogItem(
  value: unknown,
  name = "model",
): CommercialModelCatalogItem {
  const item = record(value, name);
  return {
    id: identifier(item.id, `${name}.id`),
    code: text(item.code, `${name}.code`),
    displayName: text(item.displayName, `${name}.displayName`),
    operation: text(item.operation, `${name}.operation`),
    capabilities: jsonRecord(item.capabilityJson, `${name}.capabilityJson`),
    parameterSchema: jsonRecord(
      item.parameterSchemaJson,
      `${name}.parameterSchemaJson`,
    ),
    ...optionalNumber("unitsPerCall", item.unitsPerCall),
    ...optionalBoolean("clientVisible", item.clientVisible),
    ...optionalText("status", item.status),
    ...optionalBoolean("isDefault", item.isDefault),
  };
}

export function parseCommercialModelUsageBootstrap(
  value: unknown,
): CommercialModelUsageBootstrap {
  const root = record(value, "commercial bootstrap");
  return {
    quota:
      root.personalQuota === undefined || root.personalQuota === null
        ? null
        : parseCommercialQuota(root.personalQuota),
    catalog:
      root.models === undefined || root.models === null
        ? null
        : parseCommercialModelCatalog(root.models),
  };
}

export function resolveRequiredCatalogModelCode(
  catalog: CommercialModelCatalog,
  operation: string,
): string {
  const normalizedOperation = operation.trim().toUpperCase();
  const candidates = catalog.items.filter(
    (item) => item.operation.trim().toUpperCase() === normalizedOperation,
  );
  const defaults = candidates.filter((item) => item.isDefault === true);
  if (defaults.length === 1) return defaults[0].code;
  if (defaults.length > 1) {
    throw new Error(`${normalizedOperation} 模型目录包含多个默认 SKU`);
  }
  if (candidates.length === 1) return candidates[0].code;
  if (candidates.length === 0) {
    throw new Error(`${normalizedOperation} 模型目录为空`);
  }
  throw new Error(`${normalizedOperation} 模型目录缺少唯一默认 SKU`);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}

function identifier(value: unknown, name: string): string | number {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new Error(`${name} must be a string or safe integer`);
}

function nonNegativeNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

function jsonRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string") throw new Error(`${name} must be JSON text`);
  try {
    return record(JSON.parse(value) as unknown, name);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${name} is invalid JSON`);
    throw error;
  }
}

function optionalNumber<K extends string>(key: K, value: unknown) {
  return value === undefined || value === null
    ? {}
    : ({ [key]: nonNegativeNumber(value, key) } as Record<K, number>);
}

function optionalBoolean<K extends string>(key: K, value: unknown) {
  return typeof value === "boolean"
    ? ({ [key]: value } as Record<K, boolean>)
    : {};
}

function optionalText<K extends string>(key: K, value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? ({ [key]: normalized } as Record<K, string>) : {};
}
