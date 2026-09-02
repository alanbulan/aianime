export type CommercialInvocationId = string;

export interface CommercialInvocation {
  id: CommercialInvocationId;
  modelCode: string;
  operation: string;
  executionMode: string;
  status: string;
  quotaStatus: string;
  reservationId: string;
  reservedUnits: number;
  chargedUnits: number;
  refundedUnits: number;
  balanceBefore: number;
  balanceAfter: number;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}

export interface CommercialInvocationList {
  items: CommercialInvocation[];
  total: number;
  page: number;
  pageSize: number;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCommercialInvocationList(
  value: unknown,
  pagination: { page: number; pageSize: number },
): CommercialInvocationList {
  const root = record(value, "invocation list", ["items", "total"]);
  if (!Array.isArray(root.items)) {
    throw new Error("invocation list items must be an array");
  }
  return {
    items: root.items.map((item, index) =>
      parseCommercialInvocation(item, `invocations[${index}]`),
    ),
    total: nonNegativeInteger(root.total, "total"),
    page: positiveInteger(pagination.page, "page"),
    pageSize: positiveInteger(pagination.pageSize, "pageSize"),
  };
}

export function parseCommercialInvocationDetails(
  value: unknown,
): CommercialInvocation {
  const root = record(value, "invocation details", ["invocation"]);
  return parseCommercialInvocation(root.invocation, "invocation");
}

export function parseCommercialInvocationSaveResult(
  value: unknown,
): { saved: boolean; fileName?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invocation save result must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.saved === false) {
    record(candidate, "invocation save result", ["saved"]);
    return { saved: false };
  }
  if (candidate.saved === true) {
    const result = record(candidate, "invocation save result", [
      "fileName",
      "saved",
    ]);
    return { saved: true, fileName: text(result.fileName, "fileName") };
  }
  throw new Error("invocation save result.saved must be a boolean");
}

export function canCancelCommercialInvocation(status: string): boolean {
  return !new Set([
    "SUCCEEDED",
    "SUCCESS",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "CANCELED",
    "REJECTED_NO_COST",
    "CANCEL_REQUESTED",
  ]).has(status.trim().toUpperCase());
}

export function isCommercialQuotaPending(quotaStatus: string): boolean {
  return new Set(["PENDING", "RESERVED", "HELD", "DISPATCHING", "REVIEW_REQUIRED"])
    .has(quotaStatus.trim().toUpperCase());
}

export function shouldRefreshCommercialInvocation(invocation: CommercialInvocation): boolean {
  return canCancelCommercialInvocation(invocation.status) ||
    invocation.status.trim().toUpperCase() === "CANCEL_REQUESTED" ||
    isCommercialQuotaPending(invocation.quotaStatus);
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
  const invocation = record(value, name, [
    "id",
    "modelCode",
    "operation",
    "executionMode",
    "status",
    "quotaStatus",
    "reservationId",
    "reservedUnits",
    "chargedUnits",
    "refundedUnits",
    "balanceBefore",
    "balanceAfter",
    "errorCode",
    "errorMessage",
    "createdAt",
    "startedAt",
    "completedAt",
    "durationMs",
  ]);
  const reservationId = stringValue(
    invocation.reservationId,
    `${name}.reservationId`,
  );
  if (reservationId) uuid(reservationId, `${name}.reservationId`);
  return {
    id: uuid(invocation.id, `${name}.id`),
    modelCode: text(invocation.modelCode, `${name}.modelCode`),
    operation: text(invocation.operation, `${name}.operation`),
    executionMode: text(invocation.executionMode, `${name}.executionMode`),
    status: text(invocation.status, `${name}.status`),
    quotaStatus: text(invocation.quotaStatus, `${name}.quotaStatus`),
    reservationId,
    reservedUnits: nonNegativeNumber(
      invocation.reservedUnits,
      `${name}.reservedUnits`,
    ),
    chargedUnits: nonNegativeNumber(
      invocation.chargedUnits,
      `${name}.chargedUnits`,
    ),
    refundedUnits: nonNegativeNumber(
      invocation.refundedUnits,
      `${name}.refundedUnits`,
    ),
    balanceBefore: nonNegativeNumber(
      invocation.balanceBefore,
      `${name}.balanceBefore`,
    ),
    balanceAfter: nonNegativeNumber(
      invocation.balanceAfter,
      `${name}.balanceAfter`,
    ),
    errorCode: stringValue(invocation.errorCode, `${name}.errorCode`),
    errorMessage: stringValue(invocation.errorMessage, `${name}.errorMessage`),
    createdAt: stringValue(invocation.createdAt, `${name}.createdAt`),
    startedAt: stringValue(invocation.startedAt, `${name}.startedAt`),
    completedAt: stringValue(invocation.completedAt, `${name}.completedAt`),
    durationMs: nonNegativeInteger(invocation.durationMs, `${name}.durationMs`),
  };
}

function record(
  value: unknown,
  name: string,
  fields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`${name} fields must be exactly ${expected.join(", ")}`);
  }
  return result;
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new Error(`${name} must be a UUID string`);
  }
  return value.trim().toLowerCase();
}

function text(value: unknown, name: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function nonNegativeNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}
