export type CommercialInvocationId = string | number;

export interface CommercialInvocation {
  id: CommercialInvocationId;
  status: string;
  operation?: string;
  modelSkuCode?: string;
  quotaStatus?: string;
  requestId?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface CommercialInvocationList {
  items: CommercialInvocation[];
  total: number;
  page: number;
  pageSize: number;
}

export function parseCommercialInvocationList(
  value: unknown,
): CommercialInvocationList {
  const root = record(value, "invocation list");
  if (!Array.isArray(root.items)) {
    throw new Error("invocation list items must be an array");
  }
  return {
    items: root.items.map((item, index) =>
      parseCommercialInvocation(item, `invocations[${index}]`),
    ),
    total: nonNegativeInteger(root.total, "total"),
    page: optionalPositiveInteger(root.page) ?? 1,
    pageSize: optionalPositiveInteger(root.pageSize) ?? 20,
  };
}

export function parseCommercialInvocationDetails(
  value: unknown,
): CommercialInvocation {
  const root = record(value, "invocation details");
  return parseCommercialInvocation(root.invocation, "invocation");
}

export function canCancelCommercialInvocation(status: string): boolean {
  return !new Set([
    "SUCCEEDED",
    "SUCCESS",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "CANCELED",
  ]).has(status.trim().toUpperCase());
}

export function canSaveCommercialInvocationResult(status: string): boolean {
  return new Set(["SUCCEEDED", "SUCCESS", "COMPLETED"]).has(
    status.trim().toUpperCase(),
  );
}

function parseCommercialInvocation(
  value: unknown,
  name: string,
): CommercialInvocation {
  const invocation = record(value, name);
  return {
    id: identifier(invocation.id, `${name}.id`),
    status: text(invocation.status, `${name}.status`),
    ...optionalText("operation", invocation.operation),
    ...optionalText("modelSkuCode", invocation.modelSkuCode),
    ...optionalText("quotaStatus", invocation.quotaStatus),
    ...optionalText("requestId", invocation.requestId),
    ...optionalText("createdAt", invocation.createdAt),
    ...optionalText("updatedAt", invocation.updatedAt),
    ...optionalText("completedAt", invocation.completedAt),
    ...optionalText("errorMessage", invocation.errorMessage),
  };
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

function identifier(value: unknown, name: string): CommercialInvocationId {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new Error(`${name} must be a string or safe integer`);
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return Number(value);
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Number(value)
    : undefined;
}

function optionalText<K extends string>(key: K, value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? ({ [key]: normalized } as Record<K, string>) : {};
}
