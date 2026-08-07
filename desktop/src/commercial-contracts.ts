type Identifier = string | number;

export type CommercialEditionType = "STANDARD" | "PROFESSIONAL";

export interface CommercialCapabilitySnapshot {
  editionType: CommercialEditionType | null;
  deviceActivated: boolean;
  allowsCloudModels: boolean;
  allowsCustomModels: boolean;
}

export interface CommercialAuthorizationSnapshot {
  license: {
    id: Identifier;
    versionCode?: string;
    versionName?: string;
    editionType: CommercialEditionType;
    allowsCustomModels: boolean;
    status?: string;
    expiresAt?: string;
  } | null;
  device: {
    id: Identifier;
    name?: string;
    status?: string;
  } | null;
  activation: {
    id: Identifier;
    status?: string;
    activatedAt?: string;
    lastSeenAt?: string;
  } | null;
  lease: {
    id: Identifier;
    activationId?: Identifier;
    issuedAt?: string;
    expiresAt?: string;
    keyId?: string;
    verifiedOffline: boolean;
  } | null;
  capabilities: CommercialCapabilitySnapshot;
}

export interface CommercialQuotaSnapshot {
  spendableUnits: number;
  account: {
    id?: Identifier;
    subjectType?: string;
    subjectId?: Identifier;
    status?: string;
    availableUnits: number;
    reservedUnits: number;
    version?: number;
  };
  buckets: Array<{
    id: Identifier;
    sourceType?: string;
    initialUnits?: number;
    remainingUnits?: number;
    reservedUnits?: number;
    expiresAt?: string;
    status?: string;
    bucketType?: string;
  }>;
}

export interface CommercialModelCatalogSnapshot {
  catalogVersion: string;
  items: Array<{
    id: Identifier;
    code: string;
    displayName: string;
    operation: string;
    capabilityJson?: string;
    parameterSchemaJson?: string;
    unitsPerCall?: number;
    clientVisible?: boolean;
    status?: string;
    isDefault?: boolean;
  }>;
}

export interface CommercialModelCapabilitySnapshot {
  modelId: string;
  referenceAudioMinSeconds?: number;
  referenceAudioMaxSeconds?: number;
  referenceAudioTotalMinSeconds?: number;
  referenceAudioTotalMaxSeconds?: number;
  referenceVideoMinSeconds?: number;
  referenceVideoMaxSeconds?: number;
  referenceVideoTotalMinSeconds?: number;
  referenceVideoTotalMaxSeconds?: number;
}

export interface CommercialBootstrapSnapshot {
  softwareAuthorization: CommercialAuthorizationSnapshot | null;
  personalQuota: CommercialQuotaSnapshot | null;
  models: CommercialModelCatalogSnapshot | null;
  release: {
    available: boolean;
    required: boolean;
    reason?: string;
    version?: unknown;
  } | null;
  warnings: string[];
}

export function projectCommercialBootstrap(
  value: unknown,
): CommercialBootstrapSnapshot {
  const root = requiredRecord(value, "bootstrap response");
  return {
    softwareAuthorization:
      root.softwareAuthorization === undefined ||
      root.softwareAuthorization === null
        ? null
        : projectCommercialAuthorization(root.softwareAuthorization),
    personalQuota:
      root.personalQuota === undefined || root.personalQuota === null
        ? null
        : projectCommercialQuota(root.personalQuota),
    models:
      root.models === undefined || root.models === null
        ? null
        : projectCommercialModelCatalog(root.models),
    release:
      root.release === undefined || root.release === null
        ? null
        : projectCommercialRelease(root.release),
    warnings: Array.isArray(root.warnings)
      ? root.warnings
          .map((warning) => optionalText(warning))
          .filter((warning): warning is string => Boolean(warning))
      : [],
  };
}

export function projectCommercialAuthorization(
  value: unknown,
): CommercialAuthorizationSnapshot {
  const root = requiredRecord(value, "software authorization");
  const licenseRecord = nullableRecord(root.license);
  const deviceRecord = nullableRecord(root.device);
  const activationRecord = nullableRecord(root.activation);
  const leaseRecord = nullableRecord(root.lease);

  const license = licenseRecord
    ? {
        id: identifier(licenseRecord.id, "license.id"),
        editionType: editionType(licenseRecord.editionType),
        allowsCustomModels: licenseRecord.allowsCustomModels === true,
        ...optionalTextProperty("versionCode", licenseRecord.versionCode),
        ...optionalTextProperty("versionName", licenseRecord.versionName),
        ...optionalTextProperty("status", licenseRecord.status),
        ...optionalTextProperty(
          "expiresAt",
          licenseRecord.expiresAt ?? licenseRecord.validUntil,
        ),
      }
    : null;
  const device = deviceRecord
    ? {
        id: identifier(deviceRecord.id, "device.id"),
        ...optionalTextProperty("name", deviceRecord.name ?? deviceRecord.deviceName),
        ...optionalTextProperty("status", deviceRecord.status),
      }
    : null;
  const activation = activationRecord
    ? {
        id: identifier(activationRecord.id, "activation.id"),
        ...optionalTextProperty("status", activationRecord.status),
        ...optionalTextProperty("activatedAt", activationRecord.activatedAt),
        ...optionalTextProperty(
          "lastSeenAt",
          activationRecord.lastSeenAt ?? activationRecord.lastHeartbeatAt,
        ),
      }
    : null;
  const lease = leaseRecord
    ? {
        id: identifier(leaseRecord.id, "lease.id"),
        ...optionalIdentifierProperty("activationId", leaseRecord.activationId),
        ...optionalTextProperty("issuedAt", leaseRecord.issuedAt),
        ...optionalTextProperty("expiresAt", leaseRecord.expiresAt),
        ...optionalTextProperty("keyId", leaseRecord.keyId),
        verifiedOffline: false as const,
      }
    : null;
  const deviceActivated = Boolean(license && device && activation);
  const allowsCloudModels = deviceActivated;
  const allowsCustomModels = Boolean(
    allowsCloudModels &&
      license?.editionType === "PROFESSIONAL" &&
      license.allowsCustomModels,
  );

  return {
    license,
    device,
    activation,
    lease,
    capabilities: {
      editionType: license?.editionType ?? null,
      deviceActivated,
      allowsCloudModels,
      allowsCustomModels,
    },
  };
}

export function projectCommercialQuota(value: unknown): CommercialQuotaSnapshot {
  const root = requiredRecord(value, "quota response");
  const account = requiredRecord(root.account, "quota.account");
  const rawBuckets = Array.isArray(root.buckets) ? root.buckets : [];
  return {
    spendableUnits: nonNegativeNumber(root.spendableUnits, "spendableUnits"),
    account: {
      ...optionalIdentifierProperty("id", account.id),
      ...optionalTextProperty("subjectType", account.subjectType),
      ...optionalIdentifierProperty("subjectId", account.subjectId),
      ...optionalTextProperty("status", account.status),
      availableUnits: nonNegativeNumber(
        account.availableUnits,
        "account.availableUnits",
      ),
      reservedUnits: nonNegativeNumber(
        account.reservedUnits,
        "account.reservedUnits",
      ),
      ...optionalIntegerProperty("version", account.version),
    },
    buckets: rawBuckets.map((value, index) => {
      const bucket = requiredRecord(value, `buckets[${index}]`);
      return {
        id: identifier(bucket.id, `buckets[${index}].id`),
        ...optionalTextProperty("sourceType", bucket.sourceType),
        ...optionalNumberProperty("initialUnits", bucket.initialUnits),
        ...optionalNumberProperty("remainingUnits", bucket.remainingUnits),
        ...optionalNumberProperty("reservedUnits", bucket.reservedUnits),
        ...optionalTextProperty("expiresAt", bucket.expiresAt),
        ...optionalTextProperty("status", bucket.status),
        ...optionalTextProperty("bucketType", bucket.bucketType),
      };
    }),
  };
}

export function projectCommercialModelCatalog(
  value: unknown,
): CommercialModelCatalogSnapshot {
  const root = requiredRecord(value, "model catalog");
  if (!Array.isArray(root.items)) {
    throw new Error("model catalog items must be an array");
  }
  return {
    catalogVersion: requiredText(root.catalogVersion, "catalogVersion"),
    items: root.items.map((value, index) => {
      const item = requiredRecord(value, `models[${index}]`);
      return {
        id: identifier(item.id, `models[${index}].id`),
        code: requiredText(item.code, `models[${index}].code`),
        displayName: requiredText(
          item.displayName,
          `models[${index}].displayName`,
        ),
        operation: requiredText(item.operation, `models[${index}].operation`),
        ...optionalTextProperty("capabilityJson", item.capabilityJson),
        ...optionalTextProperty("parameterSchemaJson", item.parameterSchemaJson),
        ...optionalNumberProperty("unitsPerCall", item.unitsPerCall),
        ...optionalBooleanProperty("clientVisible", item.clientVisible),
        ...optionalTextProperty("status", item.status),
        ...optionalBooleanProperty("isDefault", item.isDefault),
      };
    }),
  };
}

export function authorizationLicenseId(value: unknown): Identifier {
  return identifier(
    requiredRecord(
      requiredRecord(value, "software authorization").license,
      "license",
    ).id,
    "license.id",
  );
}

export function authorizationActivationId(value: unknown): Identifier {
  return identifier(
    requiredRecord(
      requiredRecord(value, "software authorization").activation,
      "activation",
    ).id,
    "activation.id",
  );
}

export function authorizationDeviceId(value: unknown): Identifier {
  return identifier(
    requiredRecord(
      requiredRecord(value, "software authorization").device,
      "device",
    ).id,
    "device.id",
  );
}

function projectCommercialRelease(value: unknown) {
  const release = requiredRecord(value, "release");
  if (typeof release.available !== "boolean") {
    throw new Error("release.available must be a boolean");
  }
  if (typeof release.required !== "boolean") {
    throw new Error("release.required must be a boolean");
  }
  return {
    available: release.available,
    required: release.required,
    ...optionalTextProperty("reason", release.reason),
    ...(release.version === undefined ? {} : { version: release.version }),
  };
}

export interface CommercialArtifactDownloadSnapshot {
  url: string;
  fileName: string;
  contentType: string;
  sha256: string;
  sizeBytes: number;
  signature: string;
  expiresAt?: string;
}

export function projectReleaseArtifactDownload(
  value: unknown,
): CommercialArtifactDownloadSnapshot {
  const artifact = requiredRecord(value, "artifact download");
  const url = requiredText(artifact.url, "artifact.url");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("artifact.url must be a valid URL");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("artifact.url must be http(s)");
  }
  const sha256 = requiredText(artifact.sha256, "artifact.sha256");
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error("artifact.sha256 must be a lowercase 64-char hex digest");
  }
  const sizeBytes = artifact.sizeBytes;
  if (typeof sizeBytes !== "number" || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("artifact.sizeBytes must be a positive safe integer");
  }
  return {
    url,
    fileName: requiredText(artifact.fileName, "artifact.fileName"),
    contentType: requiredText(artifact.contentType, "artifact.contentType"),
    sha256,
    sizeBytes,
    signature: requiredText(artifact.signature, "artifact.signature"),
    ...optionalTextProperty("expiresAt", artifact.expiresAt),
  };
}

/**
 * Selects the artifact matching the running platform/arch from a release-check
 * response and attaches its id, so the renderer can download the correct
 * installer without seeing the full release payload.
 */
export function selectReleaseArtifactId(
  value: unknown,
  target: string,
  arch: string,
): unknown {
  const release = requiredRecord(value, "release check");
  const version = nullableRecord(release.version);
  if (!version) return release;
  const artifacts = Array.isArray(version.artifacts) ? version.artifacts : [];
  const matchingArtifacts: Record<string, unknown>[] = [];
  for (const raw of artifacts) {
    const artifact = optionalRecord(raw);
    const artifactTarget =
      optionalText(artifact.target) ??
      optionalText(artifact.platform) ??
      optionalText(artifact.os);
    const artifactArch =
      optionalText(artifact.arch) ?? optionalText(artifact.architecture);
    if (
      artifactTarget === target &&
      artifactArch === arch &&
      artifact.id !== undefined
    ) {
      matchingArtifacts.push(artifact);
    }
  }
  const preferredKind = preferredInstallerKind(target);
  const selected =
    matchingArtifacts.find(
      (artifact) =>
        preferredKind !== null &&
        optionalText(artifact.installerKind)?.toLowerCase() === preferredKind,
    ) ?? matchingArtifacts[0];
  const artifactId = selected
    ? identifier(selected.id, "artifact.id")
    : null;
  return { ...release, artifactId };
}

function preferredInstallerKind(target: string): string | null {
  if (target === "windows") return "nsis";
  if (target === "macos") return "dmg";
  return null;
}

function requiredRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableRecord(value: unknown): Record<string, unknown> | null {
  if (value === undefined || value === null) return null;
  return requiredRecord(value, "authorization field");
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requiredText(value: unknown, name: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`${name} must be a non-empty string`);
  return text;
}

function optionalText(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function identifier(value: unknown, name: string): Identifier {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new Error(`${name} must be a string or safe integer`);
}

function editionType(value: unknown): CommercialEditionType {
  if (value === "STANDARD" || value === "PROFESSIONAL") return value;
  throw new Error("license.editionType is invalid");
}

function nonNegativeNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

function optionalTextProperty<K extends string>(key: K, value: unknown) {
  const text = optionalText(value);
  return text ? ({ [key]: text } as Record<K, string>) : {};
}

function optionalIdentifierProperty<K extends string>(key: K, value: unknown) {
  if (value === undefined || value === null || value === "") return {};
  return { [key]: identifier(value, key) } as Record<K, Identifier>;
}

function optionalNumberProperty<K extends string>(key: K, value: unknown) {
  return value === undefined || value === null
    ? {}
    : ({ [key]: nonNegativeNumber(value, key) } as Record<K, number>);
}

function optionalIntegerProperty<K extends string>(key: K, value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? ({ [key]: value } as Record<K, number>)
    : {};
}

function optionalBooleanProperty<K extends string>(key: K, value: unknown) {
  return typeof value === "boolean"
    ? ({ [key]: value } as Record<K, boolean>)
    : {};
}
