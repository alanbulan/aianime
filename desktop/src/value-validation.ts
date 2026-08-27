// Copyright (c) 2026 AI anime

type InvalidValueError = (name: string) => Error;

export function createRequiredRecord(
  invalid: InvalidValueError,
): (value: unknown, name: string) => Record<string, unknown> {
  return (value, name) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw invalid(name);
    }
    return value as Record<string, unknown>;
  };
}

export function createRequiredText(
  invalid: InvalidValueError,
): (value: unknown, name: string) => string {
  return (value, name) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw invalid(name);
    return text;
  };
}

export const requiredRecord = createRequiredRecord(
  (name) => new Error(`${name} must be an object`),
);

export const requiredText = createRequiredText(
  (name) => new Error(`${name} must be a non-empty string`),
);

export const requiredRecordZh = createRequiredRecord(
  (name) => new Error(`${name} 必须是对象`),
);
