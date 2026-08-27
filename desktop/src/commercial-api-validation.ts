// Copyright (c) 2026 AI anime

import { CommercialApiError } from "./commercial-api-error.js";
import type { Identifier } from "./commercial-api-types.js";
import {
  createRequiredRecord,
  createRequiredText,
} from "./value-validation.js";

export const requiredRecord = createRequiredRecord(
  (name) => new CommercialApiError(`${name} 必须是对象`),
);

export function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const requiredText = createRequiredText(
  (name) => new CommercialApiError(`${name} 不能为空`),
);

export function requiredRawText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new CommercialApiError(`${name} 不能为空`);
  }
  return value;
}

export function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text || undefined;
}

export function requiredIdentifier(value: unknown, name: string): Identifier {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new CommercialApiError(`${name} 必须是字符串或安全整数`);
}

export function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new CommercialApiError(`${name} 必须是整数`);
  }
  return value;
}
