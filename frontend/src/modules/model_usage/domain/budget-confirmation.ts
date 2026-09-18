export interface BudgetPrompt {
  requestId: string;
  modelCode: string;
  modelName: string;
  estimatedMicroPoints: string;
  maximumMicroPoints: string;
  tenantMultiplier: string;
  policyVersion: number;
  expiresAt: string;
  estimateOnly: boolean;
}

export interface BudgetConfirmationState {
  revision: number;
  pendingCount: number;
  request: BudgetPrompt | null;
}

export const EMPTY_BUDGET_STATE: BudgetConfirmationState = { revision: 0, pendingCount: 0, request: null };

function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid budget confirmation");
  const result = value as Record<string, unknown>;
  if (Object.keys(result).length !== fields.length || fields.some((name) => !Object.prototype.hasOwnProperty.call(result, name))) {
    throw new Error("Invalid budget confirmation fields");
  }
  return result;
}

function amount(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,15})$/u.test(value)
    || BigInt(value) > BigInt("9000000000000000")) throw new Error("Invalid budget amount");
  return value;
}

export function parseBudgetConfirmation(value: unknown): BudgetConfirmationState {
  const root = object(value, ["revision", "pendingCount", "request"]);
  if (!Number.isSafeInteger(root.revision) || Number(root.revision) < 0
    || !Number.isSafeInteger(root.pendingCount) || Number(root.pendingCount) < 0 || Number(root.pendingCount) > 32) {
    throw new Error("Invalid budget queue");
  }
  if (root.request === null) {
    if (root.pendingCount !== 0) throw new Error("Invalid empty budget queue");
    return { revision: Number(root.revision), pendingCount: 0, request: null };
  }
  const request = object(root.request, ["requestId", "modelCode", "modelName", "estimatedMicroPoints", "maximumMicroPoints", "tenantMultiplier", "policyVersion", "expiresAt", "estimateOnly"]);
  if (Number(root.pendingCount) < 1 || typeof request.requestId !== "string"
    || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(request.requestId)
    || typeof request.modelCode !== "string" || !request.modelCode || request.modelCode.length > 256
    || typeof request.modelName !== "string" || !request.modelName || request.modelName.length > 180
    || typeof request.tenantMultiplier !== "string" || !/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,18})?$/u.test(request.tenantMultiplier)
    || !Number.isSafeInteger(request.policyVersion) || Number(request.policyVersion) < 1
    || typeof request.expiresAt !== "string" || !Number.isFinite(Date.parse(request.expiresAt))
    || typeof request.estimateOnly !== "boolean") throw new Error("Invalid budget prompt");
  const estimated = amount(request.estimatedMicroPoints);
  const maximum = amount(request.maximumMicroPoints);
  if (BigInt(estimated) > BigInt(maximum)) throw new Error("Invalid budget bounds");
  return { revision: Number(root.revision), pendingCount: Number(root.pendingCount), request: {
    requestId: request.requestId, modelCode: request.modelCode, modelName: request.modelName,
    estimatedMicroPoints: estimated, maximumMicroPoints: maximum, tenantMultiplier: request.tenantMultiplier,
    policyVersion: Number(request.policyVersion), expiresAt: request.expiresAt, estimateOnly: request.estimateOnly,
  } };
}

export function formatBudgetPoints(value: string, locale: string): string {
  const units = BigInt(amount(value));
  const whole = new Intl.NumberFormat(locale).format(units / BigInt(1_000_000));
  const fraction = (units % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/u, "");
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? ".";
  return whole + (fraction ? decimal + fraction : "");
}

export function formatBudgetMultiplier(value: string): string {
  return value.includes(".") ? value.replace(/0+$/u, "").replace(/\.$/u, "") : value;
}
