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

export function formatModelContextWindow(value: number | undefined): string {
  return value === undefined
    ? "未声明"
    : `${new Intl.NumberFormat().format(value)} tokens`;
}

export function formatReasoningEffort(
  value: ModelReasoningEffortMetadata | undefined,
): string {
  if (!value) return "未声明";
  const options = value.options.join(" / ");
  return value.defaultValue
    ? `${options}（默认 ${value.defaultValue}）`
    : options;
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
