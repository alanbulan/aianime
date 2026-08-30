import type { CommercialModelCatalogItem } from "@/modules/model_usage/domain/commercial-model-access";

export interface ModelReasoningEffortMetadata {
  options: string[];
  defaultValue?: string;
  description?: string;
}

export interface ModelRuntimeMetadata {
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEffort?: ModelReasoningEffortMetadata;
}

export interface ModelParameterDeclaration {
  key: string;
  path: string;
  segments: readonly string[];
  depth: number;
  required: boolean;
  schema: Readonly<Record<string, unknown>>;
}

export interface ModelParameterOverridesParseResult {
  value: Record<string, unknown>;
  invalidPath?: string;
}

const NON_OVERRIDEABLE_TOP_LEVEL_PARAMETER_KEYS = new Set([
  "model",
  "apikey",
  "baseurl",
  "authorization",
  "headers",
  "xapikey",
  "xgoogapikey",
]);

const CONTEXT_WINDOW_KEYS = [
  "contextWindowTokens",
  "context_window_tokens",
  "contextWindow",
  "context_window",
  "contextLength",
  "context_length",
  "maxModelLen",
  "max_model_len",
  "maxContextTokens",
  "max_context_tokens",
] as const;

const MAX_OUTPUT_TOKEN_KEYS = [
  "maxOutputTokens",
  "max_output_tokens",
  "outputTokenLimit",
  "output_token_limit",
  "maxCompletionTokens",
  "max_completion_tokens",
  "maxTokens",
  "max_tokens",
] as const;

export function commercialModelRuntimeMetadata(
  item: Pick<CommercialModelCatalogItem, "capabilities" | "parameterSchema">,
): ModelRuntimeMetadata {
  const reasoningEffort = reasoningEffortMetadata(item.parameterSchema);
  const properties = objectValue(item.parameterSchema.properties);
  const contextWindow = firstPositiveInteger(
    ...CONTEXT_WINDOW_KEYS.map((key) => item.capabilities[key]),
    ...CONTEXT_WINDOW_KEYS.map((key) => item.parameterSchema[key]),
  );
  const maxOutputTokens = firstPositiveInteger(
    ...MAX_OUTPUT_TOKEN_KEYS.map((key) => item.capabilities[key]),
    ...MAX_OUTPUT_TOKEN_KEYS.map((key) => item.parameterSchema[key]),
    ...MAX_OUTPUT_TOKEN_KEYS.map((key) =>
      objectValue(item.parameterSchema[key])?.maximum
    ),
    ...MAX_OUTPUT_TOKEN_KEYS.map((key) =>
      objectValue(properties?.[key])?.maximum
    ),
  );
  return {
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  };
}

export function commercialModelParameterDeclarations(
  parameterSchema: Record<string, unknown>,
): ModelParameterDeclaration[] {
  const declarations: ModelParameterDeclaration[] = [];
  appendParameterDeclarations(parameterSchema, [], 0, declarations);
  return declarations;
}

export function commercialModelParameterOverrideDeclarations(
  parameterSchema: Record<string, unknown>,
): ModelParameterDeclaration[] {
  return commercialModelParameterDeclarations(parameterSchema).filter(
    (declaration) => {
      const nestedProperties = objectValue(declaration.schema.properties);
      const enumOptions = Array.isArray(declaration.schema.enum)
        ? declaration.schema.enum
        : [];
      return (
        declaration.schema.readOnly !== true
        && !Object.prototype.hasOwnProperty.call(declaration.schema, "const")
        && (!nestedProperties || Object.keys(nestedProperties).length === 0)
        && !(declaration.depth === 0 && declaration.required)
        && enumOptions.length !== 1
        && !NON_OVERRIDEABLE_TOP_LEVEL_PARAMETER_KEYS.has(
          String(declaration.segments[0] ?? "")
            .toLowerCase()
            .replace(/[_-]/gu, ""),
        )
      );
    },
  );
}

export function modelParameterOverrideDraft(
  declaration: ModelParameterDeclaration,
  overrides: Record<string, unknown> | undefined,
): string {
  const value = modelParameterOverrideValue(overrides, declaration.segments);
  if (value === undefined) return "";
  if (typeof value === "string" && !Array.isArray(declaration.schema.enum)) {
    return value;
  }
  return JSON.stringify(value) ?? "";
}

export function parseModelParameterOverrideDrafts(
  declarations: readonly ModelParameterDeclaration[],
  drafts: Readonly<Record<string, string>>,
): ModelParameterOverridesParseResult {
  const value: Record<string, unknown> = {};
  for (const declaration of declarations) {
    const draft = drafts[declaration.key] ?? "";
    if (!draft.trim()) continue;
    const parsed = parseModelParameterValue(declaration.schema, draft);
    if (!parsed.valid) {
      return { value: {}, invalidPath: declaration.path };
    }
    setModelParameterOverrideValue(value, declaration.segments, parsed.value);
  }
  return { value };
}

export function parseModelParameterOverridesJsonDraft(
  draft: string,
): ModelParameterOverridesParseResult {
  return parseJsonObjectDraft(draft, true);
}

export function parseModelCapabilityOverridesJsonDraft(
  draft: string,
): ModelParameterOverridesParseResult {
  return parseJsonObjectDraft(draft, false);
}

function parseJsonObjectDraft(
  draft: string,
  forbidRoutingKeys: boolean,
): ModelParameterOverridesParseResult {
  if (!draft.trim()) return { value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft) as unknown;
  } catch {
    return { value: {}, invalidPath: "$" };
  }
  const value = objectValue(parsed);
  if (!value) return { value: {}, invalidPath: "$" };
  const unsafePath = unsafeJsonKeyPath(value, "$");
  if (unsafePath) return { value: {}, invalidPath: unsafePath };
  for (const key of Object.keys(value)) {
    if (
      forbidRoutingKeys
      && NON_OVERRIDEABLE_TOP_LEVEL_PARAMETER_KEYS.has(
        key.toLowerCase().replace(/[_-]/gu, ""),
      )
    ) {
      return { value: {}, invalidPath: key };
    }
  }
  return { value };
}

function unsafeJsonKeyPath(value: unknown, path: string): string | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const invalid = unsafeJsonKeyPath(value[index], `${path}[${index}]`);
      if (invalid) return invalid;
    }
    return undefined;
  }
  const record = objectValue(value);
  if (!record) return undefined;
  for (const [key, item] of Object.entries(record)) {
    const nextPath = path === "$" ? key : `${path}.${key}`;
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      return nextPath;
    }
    const invalid = unsafeJsonKeyPath(item, nextPath);
    if (invalid) return invalid;
  }
  return undefined;
}

export function formatModelContextWindow(value: number | undefined): string {
  return value === undefined
    ? "未声明"
    : `${new Intl.NumberFormat().format(value)} tokens`;
}

export function formatReasoningEffort(
  value: ModelReasoningEffortMetadata | undefined,
): string {
  if (!value) return "未声明";
  const options = value.options.map(formatReasoningEffortOption).join(" / ");
  return value.defaultValue
    ? `${options}（默认 ${formatReasoningEffortOption(value.defaultValue)}）`
    : options;
}

export function formatReasoningEffortOption(value: string): string {
  return value === "none" ? "关闭思考" : value;
}

function reasoningEffortMetadata(
  parameterSchema: Record<string, unknown>,
): ModelReasoningEffortMetadata | undefined {
  const properties = objectValue(parameterSchema.properties);
  const schema = objectValue(
    properties?.reasoning_effort ?? properties?.reasoningEffort,
  );
  if (!schema || !Array.isArray(schema.enum)) return undefined;
  const options = Array.from(new Set(
    schema.enum
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  ));
  if (options.length === 0) return undefined;
  const defaultValue = typeof schema.default === "string"
    ? schema.default.trim()
    : "";
  const description = typeof schema.description === "string"
    ? schema.description.trim()
    : "";
  return {
    options,
    ...(defaultValue && options.includes(defaultValue) ? { defaultValue } : {}),
    ...(description ? { description } : {}),
  };
}

function appendParameterDeclarations(
  schema: Record<string, unknown>,
  parentSegments: readonly string[],
  depth: number,
  declarations: ModelParameterDeclaration[],
): void {
  const properties = objectValue(schema.properties);
  if (!properties) return;
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((value): value is string => typeof value === "string")
      : [],
  );
  for (const [name, value] of Object.entries(properties)) {
    if (["__proto__", "prototype", "constructor"].includes(name)) continue;
    const propertySchema = objectValue(value);
    if (!propertySchema) continue;
    const segments = [...parentSegments, name];
    const path = segments.join(".");
    declarations.push({
      key: JSON.stringify(segments),
      path,
      segments,
      depth,
      required: required.has(name),
      schema: propertySchema,
    });
    appendParameterDeclarations(propertySchema, segments, depth + 1, declarations);
  }
}

function modelParameterOverrideValue(
  overrides: Record<string, unknown> | undefined,
  segments: readonly string[],
): unknown {
  let current: unknown = overrides;
  for (const segment of segments) {
    const record = objectValue(current);
    if (!record || !Object.prototype.hasOwnProperty.call(record, segment)) {
      return undefined;
    }
    current = record[segment];
  }
  return current;
}

function setModelParameterOverrideValue(
  overrides: Record<string, unknown>,
  segments: readonly string[],
  value: unknown,
): void {
  let current = overrides;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = value;
      return;
    }
    const nested = objectValue(current[segment]) ?? {};
    current[segment] = nested;
    current = nested;
  });
}

function parseModelParameterValue(
  schema: Readonly<Record<string, unknown>>,
  draft: string,
): { valid: true; value: unknown } | { valid: false } {
  let value: unknown;
  try {
    const types = Array.isArray(schema.type)
      ? schema.type.filter((item): item is string => typeof item === "string")
      : typeof schema.type === "string"
        ? [schema.type]
        : [];
    if (Array.isArray(schema.enum)) {
      value = JSON.parse(draft) as unknown;
    } else if (types.length === 1 && types[0] === "string") {
      value = draft;
    } else if (
      types.length === 1
      && (types[0] === "integer" || types[0] === "number")
    ) {
      value = Number(draft);
    } else if (types.length === 1 && types[0] === "boolean") {
      if (draft !== "true" && draft !== "false") return { valid: false };
      value = draft === "true";
    } else {
      value = JSON.parse(draft) as unknown;
    }
  } catch {
    return { valid: false };
  }
  return modelParameterValueMatchesSchema(value, schema)
    ? { valid: true, value }
    : { valid: false };
}

function modelParameterValueMatchesSchema(
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
): boolean {
  if (Array.isArray(schema.enum)) {
    const candidate = JSON.stringify(value);
    if (!schema.enum.some((item) => JSON.stringify(item) === candidate)) return false;
  }
  const types = Array.isArray(schema.type)
    ? schema.type.filter((item): item is string => typeof item === "string")
    : typeof schema.type === "string"
      ? [schema.type]
      : [];
  if (types.length > 0 && !types.some((type) => modelParameterValueHasType(value, type))) {
    return false;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) {
      return false;
    }
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) {
      return false;
    }
    if (
      typeof schema.multipleOf === "number"
      && schema.multipleOf > 0
      && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9
    ) {
      return false;
    }
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern, "u").test(value)) return false;
      } catch {
        return false;
      }
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
  }
  return true;
}

function modelParameterValueHasType(value: unknown, type: string): boolean {
  switch (type) {
    case "null":
      return value === null;
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isSafeInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "array":
      return Array.isArray(value);
    case "object":
      return Boolean(objectValue(value));
    default:
      return true;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function firstPositiveInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}
