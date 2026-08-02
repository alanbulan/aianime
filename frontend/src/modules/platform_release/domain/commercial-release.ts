export interface CommercialReleaseStatus {
  available: boolean;
  required: boolean;
  reason: string | null;
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
  };
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}
