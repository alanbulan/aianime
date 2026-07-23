// Copyright (c) 2026 AI anime
export function isOkDataResponse<T>(
  value: unknown,
): value is { ok: true; data: T } {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { ok?: unknown }).ok === true,
  );
}
