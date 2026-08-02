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

export interface CommercialModelAccessStatus {
  mode: CommercialModelAccessMode;
  allowsCustomModels: boolean;
  gatewayOrigin: string;
  byokConfigured: boolean;
  byokBaseUrl: string;
  byokApiKeyPreview: string;
  byokModelAssignments: ByokModelAssignment[];
}

export function parseCommercialModelAccessStatus(
  value: unknown,
): CommercialModelAccessStatus {
  const root = record(value, "commercial model access status");
  if (root.mode !== "cloud" && root.mode !== "byok") {
    throw new Error("commercial model access mode is invalid");
  }
  return {
    mode: root.mode,
    allowsCustomModels: root.allowsCustomModels === true,
    gatewayOrigin: text(root.gatewayOrigin, "gatewayOrigin"),
    byokConfigured: root.byokConfigured === true,
    byokBaseUrl:
      typeof root.byokBaseUrl === "string" ? root.byokBaseUrl.trim() : "",
    byokApiKeyPreview:
      typeof root.byokApiKeyPreview === "string"
        ? root.byokApiKeyPreview.trim()
        : "",
    byokModelAssignments: parseByokModelAssignments(
      root.byokModelAssignments,
    ),
  };
}

function parseByokModelAssignments(value: unknown): ByokModelAssignment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("byokModelAssignments must be an array");
  }
  return value.map((item, index) => {
    const assignment = record(item, `byokModelAssignments[${index}]`);
    const role = text(assignment.role, `byokModelAssignments[${index}].role`);
    if (!(BYOK_MODEL_ROLES as readonly string[]).includes(role)) {
      throw new Error(`byokModelAssignments[${index}].role is invalid`);
    }
    return {
      modelId: text(
        assignment.modelId,
        `byokModelAssignments[${index}].modelId`,
      ),
      role: role as ByokModelRole,
    };
  });
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
    items: root.items.map((value, index) => {
      const item = record(value, `models[${index}]`);
      return {
        id: identifier(item.id, `models[${index}].id`),
        code: text(item.code, `models[${index}].code`),
        displayName: text(item.displayName, `models[${index}].displayName`),
        operation: text(item.operation, `models[${index}].operation`),
        capabilities: jsonRecord(item.capabilityJson, "capabilityJson"),
        parameterSchema: jsonRecord(
          item.parameterSchemaJson,
          "parameterSchemaJson",
        ),
        ...optionalNumber("unitsPerCall", item.unitsPerCall),
        ...optionalBoolean("isDefault", item.isDefault),
      };
    }),
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
