export interface CommercialReleaseStatus {
  available: boolean;
  required: boolean;
  reason: string | null;
  artifactId: string | null;
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
  const progress = record(value, "commercial update download progress", [
    "percent",
    "transferred",
    "total",
    "bytesPerSecond",
  ]);
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

export function parseCommercialUpdateDownloadResult(
  value: unknown,
): { version: string } {
  const result = record(value, "commercial update download result", [
    "version",
  ]);
  return { version: text(result.version, "download.version") };
}

export function parseCommercialUpdateInstallResult(
  value: unknown,
): { accepted: true } {
  const result = record(value, "commercial update install result", [
    "accepted",
  ]);
  if (result.accepted !== true) {
    throw new Error("Update installation was not accepted");
  }
  return { accepted: true };
}

export function parseCommercialBootstrapRelease(
  value: unknown,
): CommercialReleaseStatus | null {
  const bootstrap = record(value, "commercial bootstrap", [
    "softwareAuthorization",
    "personalQuota",
    "models",
    "release",
    "warnings",
  ]);
  if (bootstrap.release === null) return null;
  return parseReleaseStatus(bootstrap.release, false);
}

export function parseCommercialReleaseStatus(
  value: unknown,
): CommercialReleaseStatus {
  return parseReleaseStatus(value, true);
}

function parseReleaseStatus(
  value: unknown,
  includesArtifactId: boolean,
): CommercialReleaseStatus {
  const release = record(value, "commercial release", [
    "available",
    "required",
    "version",
    "reason",
    ...(includesArtifactId ? ["artifactId"] : []),
  ]);
  if (typeof release.available !== "boolean") {
    throw new Error("commercial release.available must be a boolean");
  }
  if (typeof release.required !== "boolean") {
    throw new Error("commercial release.required must be a boolean");
  }
  if (typeof release.reason !== "string") {
    throw new Error("commercial release.reason must be a string");
  }
  validateReleaseVersion(release.version);
  return {
    available: release.available,
    required: release.required,
    reason: release.reason.trim() || null,
    artifactId:
      includesArtifactId && release.artifactId !== null
        ? uuid(release.artifactId, "artifactId")
        : null,
  };
}

function validateReleaseVersion(value: unknown): void {
  const version = record(value, "commercial release.version", [
    "artifacts",
    "createdAt",
    "id",
    "minimumSupportedVersion",
    "notes",
    "pubDate",
    "publishedAt",
    "status",
    "version",
  ]);
  uuidOrEmpty(version.id, "commercial release.version.id");
  for (const field of [
    "version",
    "notes",
    "pubDate",
    "minimumSupportedVersion",
    "status",
    "createdAt",
    "publishedAt",
  ] as const) {
    stringValue(version[field], `commercial release.version.${field}`);
  }
  if (!Array.isArray(version.artifacts)) {
    throw new Error("commercial release.version.artifacts must be an array");
  }
  version.artifacts.forEach((value, index) => {
    const name = `commercial release.version.artifacts[${index}]`;
    const artifact = record(value, name, [
      "arch",
      "contentType",
      "createdAt",
      "fileId",
      "fileName",
      "id",
      "installerKind",
      "manifestContentType",
      "manifestFileId",
      "manifestFileName",
      "manifestSha256",
      "manifestSizeBytes",
      "sha256",
      "sizeBytes",
      "target",
      "versionId",
    ]);
    uuid(artifact.id, `${name}.id`);
    uuid(artifact.versionId, `${name}.versionId`);
    for (const field of [
      "target",
      "arch",
      "installerKind",
      "sha256",
      "manifestSha256",
      "fileName",
      "manifestFileName",
      "contentType",
      "manifestContentType",
    ] as const) {
      text(artifact[field], `${name}.${field}`);
    }
    positiveInteger(artifact.fileId, `${name}.fileId`);
    positiveInteger(artifact.manifestFileId, `${name}.manifestFileId`);
    positiveInteger(artifact.sizeBytes, `${name}.sizeBytes`);
    positiveInteger(
      artifact.manifestSizeBytes,
      `${name}.manifestSizeBytes`,
    );
    stringValue(artifact.createdAt, `${name}.createdAt`);
  });
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

function uuidOrEmpty(value: unknown, name: string): string {
  if (value === "") return "";
  return uuid(value, name);
}

function uuid(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  ) {
    throw new Error(`${name} must be a UUID string`);
  }
  return value.trim().toLowerCase();
}

function text(value: unknown, name: string): string {
  const result = stringValue(value, name).trim();
  if (!result) throw new Error(`${name} must be a non-empty string`);
  return result;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
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
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}
