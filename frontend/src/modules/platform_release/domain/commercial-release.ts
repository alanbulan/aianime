export interface CommercialReleaseStatus {
  available: boolean;
  required: boolean;
  reason: string | null;
  artifactId: string | number | null;
}

export interface CommercialUpdateDownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export function parseCommercialUpdateDownloadProgress(
  value: unknown,
): CommercialUpdateDownloadProgress {
  const progress = record(value, "commercial update download progress");
  return {
    percent: boundedNumber(progress.percent, "percent", 0, 100),
    transferred: boundedNumber(
      progress.transferred,
      "transferred",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    total: boundedNumber(
      progress.total,
      "total",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    bytesPerSecond: boundedNumber(
      progress.bytesPerSecond,
      "bytesPerSecond",
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  };
}

export function parseCommercialBootstrapRelease(
  value: unknown,
): CommercialReleaseStatus | null {
  const bootstrap = record(value, "commercial bootstrap");
  if (bootstrap.release === undefined || bootstrap.release === null) {
    return null;
  }
  return parseCommercialReleaseStatus(bootstrap.release);
}

export function parseCommercialReleaseStatus(
  value: unknown,
): CommercialReleaseStatus {
  const release = record(value, "commercial release");
  if (typeof release.available !== "boolean") {
    throw new Error("commercial release.available must be a boolean");
  }
  if (typeof release.required !== "boolean") {
    throw new Error("commercial release.required must be a boolean");
  }
  return {
    available: release.available,
    required: release.required,
    reason:
      typeof release.reason === "string" && release.reason.trim()
        ? release.reason.trim()
        : null,
    artifactId:
      typeof release.artifactId === "string" && release.artifactId.trim()
        ? release.artifactId.trim()
        : typeof release.artifactId === "number" &&
            Number.isSafeInteger(release.artifactId)
          ? release.artifactId
          : null,
  };
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function boundedNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return Math.min(maximum, Math.max(minimum, value));
}
