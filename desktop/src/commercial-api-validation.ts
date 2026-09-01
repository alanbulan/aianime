// Copyright (c) 2026 AI anime

import { CommercialApiError } from "./commercial-api-error.js";
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requiredUUID(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new CommercialApiError(`${name} 必须是 UUID 字符串`);
  }
  return value.trim().toLowerCase();
}

export function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new CommercialApiError(`${name} 必须是字符串`);
  }
  return value;
}

export function requiredBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new CommercialApiError(`${name} 必须是布尔值`);
  }
  return value;
}

export function strictRecord(
  value: unknown,
  name: string,
  fields: readonly string[],
): Record<string, unknown> {
  const record = requiredRecord(value, name);
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (
    actual.length !== expected.length ||
    actual.some((field, index) => field !== expected[index])
  ) {
    throw new CommercialApiError(
      `${name} 字段必须严格为 ${expected.join(", ")}`,
    );
  }
  return record;
}

export function requiredInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new CommercialApiError(`${name} 必须是整数`);
  }
  return value;
}
