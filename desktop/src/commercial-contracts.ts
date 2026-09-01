import {
  requiredRecord,
  requiredText,
} from "./value-validation.js";

type UUID = string;

export type CommercialEditionType = "STANDARD" | "PROFESSIONAL";

export interface CommercialAuthorizationWire {
  license: {
    id: UUID;
    versionCode: string;
    versionName: string;
    status: string;
    validFrom: string;
    validUntil: string;
    maxDevices: number;
    activeDevices: number;
    editionType: CommercialEditionType;
    allowsCustomModels: boolean;
  };
  device: {
    id: UUID;
    publicKeyHash: string;
    deviceName: string;
    platform: string;
    arch: string;
    clientVersion: string;
    status: string;
    createdAt: string;
    lastSeenAt: string;
  } | null;
  activation: {
    id: UUID;
    licenseId: UUID;
    deviceId: UUID;
    status: string;
    activatedAt: string;
    lastHeartbeatAt: string;
    endedAt: string;
    endReason: string;
  } | null;
  lease: {
    id: UUID;
    activationId: UUID;
    issuedAt: string;
    expiresAt: string;
    payloadJson: string;
    signature: string;
    keyId: string;
  } | null;
}

export interface CommercialCapabilitySnapshot {
  editionType: CommercialEditionType | null;
  deviceActivated: boolean;
  allowsCloudModels: boolean;
  allowsCustomModels: boolean;
}

export interface CommercialAuthorizationSnapshot {
  license: {
    id: UUID;
    versionCode: string;
    versionName: string;
    editionType: CommercialEditionType;
    allowsCustomModels: boolean;
    status: string;
    validFrom: string;
    validUntil: string;
    maxDevices: number;
    activeDevices: number;
  };
  device: {
    id: UUID;
    publicKeyHash: string;
    name: string;
    platform: string;
    arch: string;
    clientVersion: string;
    status: string;
    createdAt: string;
    lastSeenAt: string;
  } | null;
  activation: {
    id: UUID;
    licenseId: UUID;
    deviceId: UUID;
    status: string;
    activatedAt: string;
    lastHeartbeatAt: string;
    endedAt: string;
    endReason: string;
  } | null;
  lease: {
    id: UUID;
    activationId: UUID;
    issuedAt: string;
    expiresAt: string;
    keyId: string;
    verifiedOffline: boolean;
  } | null;
  capabilities: CommercialCapabilitySnapshot;
}

export interface CommercialQuotaSnapshot {
  spendableUnits: number;
  account: {
    id: UUID;
    subjectType: string;
    subjectId: number;
    status: string;
    availableUnits: number;
    reservedUnits: number;
    version: number;
  };
  buckets: Array<{
    id: UUID;
    sourceType: string;
    initialUnits: number;
    remainingUnits: number;
    reservedUnits: number;
    expiresAt: string;
    status: string;
    bucketType: string;
  }>;
}

export interface CommercialModelCatalogItemSnapshot {
  id: UUID;
  code: string;
  displayName: string;
  operation: string;
  capabilityJson?: string;
  parameterSchemaJson?: string;
  unitsPerCall?: number;
  clientVisible?: boolean;
  status?: string;
  isDefault?: boolean;
}

export interface CommercialModelCatalogSnapshot {
  catalogVersion: string;
  items: CommercialModelCatalogItemSnapshot[];
}

export interface CommercialInvocationSnapshot {
  id: UUID;
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

export interface CommercialInvocationListSnapshot {
  items: CommercialInvocationSnapshot[];
  total: number;
}

export interface CommercialModelCapabilitySnapshot {
  modelId: string;
  extraParameterNames?: string[];
  imagePromptProfile?: string;
  imageRatioOptions?: string[];
  imageSizeOptions?: string[];
  videoWorkflow?: "standard" | "advanced-reference" | "reference";
  videoRatioOptions?: string[];
  videoResolutionOptions?: string[];
  videoSizeOptions?: string[];
  videoResolutionMaxSeconds?: Record<string, number>;
  videoSupportsGenerateAudio?: boolean;
  videoSupportsHumanReview?: boolean;
  videoDialogueOnly?: boolean;
  videoExtraParameterNames?: string[];
  videoSceneOptimizeOptions?: string[];
  videoGenerationMinSeconds?: number;
  videoGenerationMaxSeconds?: number;
  videoDurationOptions?: number[];
  maxReferenceImages?: number;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  maxReferenceTotal?: number;
  referenceAudioMinSeconds?: number;
  referenceAudioMaxSeconds?: number;
  referenceAudioTotalMinSeconds?: number;
  referenceAudioTotalMaxSeconds?: number;
  referenceVideoMinSeconds?: number;
  referenceVideoMaxSeconds?: number;
  referenceVideoTotalMinSeconds?: number;
  referenceVideoTotalMaxSeconds?: number;
}

export interface CommercialReleaseArtifactSnapshot {
  id: UUID;
  versionId: UUID;
  target: string;
  arch: string;
  installerKind: string;
  fileId: number;
  manifestFileId: number;
  sha256: string;
  sizeBytes: number;
  manifestSha256: string;
  manifestSizeBytes: number;
  fileName: string;
  manifestFileName: string;
  contentType: string;
  manifestContentType: string;
  createdAt: string;
}

export interface CommercialReleaseVersionSnapshot {
  id: UUID;
  version: string;
  notes: string;
  pubDate: string;
  minimumSupportedVersion: string;
  status: string;
  createdAt: string;
  publishedAt: string;
  artifacts: CommercialReleaseArtifactSnapshot[];
}

export interface CommercialReleaseSnapshot {
  available: boolean;
  required: boolean;
  version: CommercialReleaseVersionSnapshot;
  reason: string;
}

export interface CommercialBootstrapWire {
  softwareAuthorization: CommercialAuthorizationWire | null;
  personalQuota: CommercialQuotaSnapshot | null;
  models: CommercialModelCatalogSnapshot | null;
  release: CommercialReleaseSnapshot | null;
  warnings: string[];
}

export interface CommercialBootstrapSnapshot {
  softwareAuthorization: CommercialAuthorizationSnapshot | null;
  personalQuota: CommercialQuotaSnapshot | null;
  models: CommercialModelCatalogSnapshot | null;
  release: CommercialReleaseSnapshot | null;
  warnings: string[];
}

export function parseCommercialBootstrapWire(
  value: unknown,
): CommercialBootstrapWire {
  const root = exactRecord(value, "bootstrap response", [
    "softwareAuthorization",
    "personalQuota",
    "models",
    "release",
    "warnings",
  ]);
  if (!Array.isArray(root.warnings)) {
    throw new Error("bootstrap warnings must be an array");
  }
  return {
    softwareAuthorization:
      root.softwareAuthorization === null
        ? null
        : parseCommercialAuthorizationWire(root.softwareAuthorization),
    personalQuota:
      root.personalQuota === null
        ? null
        : projectCommercialQuota(root.personalQuota),
    models:
      root.models === null ? null : projectCommercialModelCatalog(root.models),
    release:
      root.release === null ? null : projectCommercialRelease(root.release),
    warnings: root.warnings.map((warning, index) =>
      stringValue(warning, `warnings[${index}]`),
    ),
  };
}

export function projectCommercialBootstrap(
  root: CommercialBootstrapWire,
): CommercialBootstrapSnapshot {
  return {
    softwareAuthorization: root.softwareAuthorization
      ? projectCommercialAuthorization(root.softwareAuthorization)
      : null,
    personalQuota: root.personalQuota,
    models: root.models,
    release: root.release,
    warnings: root.warnings,
  };
}

export function parseCommercialAuthorizationWire(
  value: unknown,
): CommercialAuthorizationWire {
  const root = exactRecord(value, "software authorization", [
    "license",
    "device",
    "activation",
    "lease",
  ]);
  const license = exactRecord(root.license, "license", [
    "id",
    "versionCode",
    "versionName",
    "status",
    "validFrom",
    "validUntil",
    "maxDevices",
    "activeDevices",
    "editionType",
    "allowsCustomModels",
  ]);
  const device = nullableExactRecord(root.device, "device", [
    "id",
    "publicKeyHash",
    "deviceName",
    "platform",
    "arch",
    "clientVersion",
    "status",
    "createdAt",
    "lastSeenAt",
  ]);
  const activation = nullableExactRecord(root.activation, "activation", [
    "id",
    "licenseId",
    "deviceId",
    "status",
    "activatedAt",
    "lastHeartbeatAt",
    "endedAt",
    "endReason",
  ]);
  const lease = nullableExactRecord(root.lease, "lease", [
    "id",
    "activationId",
    "issuedAt",
    "expiresAt",
    "payloadJson",
    "signature",
    "keyId",
  ]);
  return {
    license: {
      id: uuid(license.id, "license.id"),
      versionCode: stringValue(license.versionCode, "license.versionCode"),
      versionName: stringValue(license.versionName, "license.versionName"),
      status: stringValue(license.status, "license.status"),
      validFrom: stringValue(license.validFrom, "license.validFrom"),
      validUntil: stringValue(license.validUntil, "license.validUntil"),
      maxDevices: nonNegativeInteger(license.maxDevices, "license.maxDevices"),
      activeDevices: nonNegativeInteger(
        license.activeDevices,
        "license.activeDevices",
      ),
      editionType: editionType(license.editionType),
      allowsCustomModels: booleanValue(
        license.allowsCustomModels,
        "license.allowsCustomModels",
      ),
    },
    device: device
      ? {
          id: uuid(device.id, "device.id"),
          publicKeyHash: requiredText(
            device.publicKeyHash,
            "device.publicKeyHash",
          ),
          deviceName: stringValue(device.deviceName, "device.deviceName"),
          platform: stringValue(device.platform, "device.platform"),
          arch: stringValue(device.arch, "device.arch"),
          clientVersion: stringValue(
            device.clientVersion,
            "device.clientVersion",
          ),
          status: stringValue(device.status, "device.status"),
          createdAt: stringValue(device.createdAt, "device.createdAt"),
          lastSeenAt: stringValue(device.lastSeenAt, "device.lastSeenAt"),
        }
      : null,
    activation: activation
      ? {
          id: uuid(activation.id, "activation.id"),
          licenseId: uuid(activation.licenseId, "activation.licenseId"),
          deviceId: uuid(activation.deviceId, "activation.deviceId"),
          status: stringValue(activation.status, "activation.status"),
          activatedAt: stringValue(
            activation.activatedAt,
            "activation.activatedAt",
          ),
          lastHeartbeatAt: stringValue(
            activation.lastHeartbeatAt,
            "activation.lastHeartbeatAt",
          ),
          endedAt: stringValue(activation.endedAt, "activation.endedAt"),
          endReason: stringValue(activation.endReason, "activation.endReason"),
        }
      : null,
    lease: lease
      ? {
          id: uuid(lease.id, "lease.id"),
          activationId: uuid(lease.activationId, "lease.activationId"),
          issuedAt: stringValue(lease.issuedAt, "lease.issuedAt"),
          expiresAt: stringValue(lease.expiresAt, "lease.expiresAt"),
          payloadJson: requiredText(lease.payloadJson, "lease.payloadJson"),
          signature: requiredText(lease.signature, "lease.signature"),
          keyId: requiredText(lease.keyId, "lease.keyId"),
        }
      : null,
  };
}

export function projectCommercialAuthorization(
  value: unknown,
): CommercialAuthorizationSnapshot {
  const wire = parseCommercialAuthorizationWire(value);
  const device = wire.device
    ? {
        id: wire.device.id,
        publicKeyHash: wire.device.publicKeyHash,
        name: wire.device.deviceName,
        platform: wire.device.platform,
        arch: wire.device.arch,
        clientVersion: wire.device.clientVersion,
        status: wire.device.status,
        createdAt: wire.device.createdAt,
        lastSeenAt: wire.device.lastSeenAt,
      }
    : null;
  const activation = wire.activation ? { ...wire.activation } : null;
  const lease = wire.lease
    ? {
        id: wire.lease.id,
        activationId: wire.lease.activationId,
        issuedAt: wire.lease.issuedAt,
        expiresAt: wire.lease.expiresAt,
        keyId: wire.lease.keyId,
        verifiedOffline: false,
      }
    : null;
  const deviceActivated = Boolean(device && activation);
  const allowsCloudModels = deviceActivated;
  const allowsCustomModels = Boolean(
    allowsCloudModels &&
      wire.license.editionType === "PROFESSIONAL" &&
      wire.license.allowsCustomModels,
  );

  return {
    license: { ...wire.license },
    device,
    activation,
    lease,
    capabilities: {
      editionType: wire.license.editionType,
      deviceActivated,
      allowsCloudModels,
      allowsCustomModels,
    },
  };
}

export function projectCommercialQuota(value: unknown): CommercialQuotaSnapshot {
  const root = exactRecord(value, "quota response", [
    "account",
    "buckets",
    "spendableUnits",
  ]);
  const account = exactRecord(root.account, "quota.account", [
    "id",
    "subjectType",
    "subjectId",
    "status",
    "availableUnits",
    "reservedUnits",
    "version",
  ]);
  if (!Array.isArray(root.buckets)) {
    throw new Error("quota.buckets must be an array");
  }
  return {
    spendableUnits: nonNegativeNumber(root.spendableUnits, "spendableUnits"),
    account: {
      id: uuid(account.id, "account.id"),
      subjectType: requiredText(account.subjectType, "account.subjectType"),
      subjectId: positiveInteger(account.subjectId, "account.subjectId"),
      status: requiredText(account.status, "account.status"),
      availableUnits: nonNegativeNumber(
        account.availableUnits,
        "account.availableUnits",
      ),
      reservedUnits: nonNegativeNumber(
        account.reservedUnits,
        "account.reservedUnits",
      ),
      version: nonNegativeInteger(account.version, "account.version"),
    },
    buckets: root.buckets.map((value, index) => {
      const name = `buckets[${index}]`;
      const bucket = exactRecord(value, name, [
        "id",
        "sourceType",
        "initialUnits",
        "remainingUnits",
        "reservedUnits",
        "expiresAt",
        "status",
        "bucketType",
      ]);
      return {
        id: uuid(bucket.id, `${name}.id`),
        sourceType: requiredText(bucket.sourceType, `${name}.sourceType`),
        initialUnits: nonNegativeNumber(
          bucket.initialUnits,
          `${name}.initialUnits`,
        ),
        remainingUnits: nonNegativeNumber(
          bucket.remainingUnits,
          `${name}.remainingUnits`,
        ),
        reservedUnits: nonNegativeNumber(
          bucket.reservedUnits,
          `${name}.reservedUnits`,
        ),
        expiresAt: stringValue(bucket.expiresAt, `${name}.expiresAt`),
        status: requiredText(bucket.status, `${name}.status`),
        bucketType: requiredText(bucket.bucketType, `${name}.bucketType`),
      };
    }),
  };
}

export function projectCommercialModelCatalog(
  value: unknown,
): CommercialModelCatalogSnapshot {
  const root = exactRecord(value, "model catalog", [
    "items",
    "catalogVersion",
  ]);
  if (!Array.isArray(root.items)) {
    throw new Error("model catalog items must be an array");
  }
  return {
    catalogVersion: requiredText(root.catalogVersion, "catalogVersion"),
    items: root.items.map((value, index) =>
      projectCommercialModelCatalogItem(value, `models[${index}]`),
    ),
  };
}

export function projectCommercialModelCatalogItem(
  value: unknown,
  name = "model",
): CommercialModelCatalogItemSnapshot {
  const item = exactRecord(value, name, [
    "id",
    "code",
    "displayName",
    "operation",
    "capabilityJson",
    "parameterSchemaJson",
    "unitsPerCall",
    "clientVisible",
    "status",
    "createdAt",
    "updatedAt",
    "isDefault",
  ]);
  stringValue(item.createdAt, `${name}.createdAt`);
  stringValue(item.updatedAt, `${name}.updatedAt`);
  return {
    id: uuid(item.id, `${name}.id`),
    code: requiredText(item.code, `${name}.code`),
    displayName: requiredText(item.displayName, `${name}.displayName`),
    operation: requiredText(item.operation, `${name}.operation`),
    capabilityJson: stringValue(item.capabilityJson, `${name}.capabilityJson`),
    parameterSchemaJson: stringValue(
      item.parameterSchemaJson,
      `${name}.parameterSchemaJson`,
    ),
    unitsPerCall: nonNegativeNumber(item.unitsPerCall, `${name}.unitsPerCall`),
    clientVisible: booleanValue(item.clientVisible, `${name}.clientVisible`),
    status: requiredText(item.status, `${name}.status`),
    isDefault: booleanValue(item.isDefault, `${name}.isDefault`),
  };
}

export function projectCommercialInvocationList(
  value: unknown,
): CommercialInvocationListSnapshot {
  const root = exactRecord(value, "invocation list", ["items", "total"]);
  if (!Array.isArray(root.items)) {
    throw new Error("invocation list items must be an array");
  }
  return {
    items: root.items.map((item, index) =>
      projectCommercialInvocation(item, `invocations[${index}]`),
    ),
    total: nonNegativeInteger(root.total, "total"),
  };
}

export function projectCommercialInvocationDetails(value: unknown): {
  invocation: CommercialInvocationSnapshot;
} {
  const root = exactRecord(value, "invocation details", ["invocation"]);
  return {
    invocation: projectCommercialInvocation(root.invocation, "invocation"),
  };
}

export function projectCommercialInvocation(
  value: unknown,
  name = "invocation",
): CommercialInvocationSnapshot {
  const invocation = exactRecord(value, name, [
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
    modelCode: requiredText(invocation.modelCode, `${name}.modelCode`),
    operation: requiredText(invocation.operation, `${name}.operation`),
    executionMode: requiredText(
      invocation.executionMode,
      `${name}.executionMode`,
    ),
    status: requiredText(invocation.status, `${name}.status`),
    quotaStatus: requiredText(invocation.quotaStatus, `${name}.quotaStatus`),
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

export function authorizationLicenseId(value: unknown): UUID {
  return uuid(
    requiredRecord(
      requiredRecord(value, "software authorization").license,
      "license",
    ).id,
    "license.id",
  );
}

export function authorizationActivationId(value: unknown): UUID {
  return uuid(
    requiredRecord(
      requiredRecord(value, "software authorization").activation,
      "activation",
    ).id,
    "activation.id",
  );
}

export function authorizationDeviceId(value: unknown): UUID {
  return uuid(
    requiredRecord(
      requiredRecord(value, "software authorization").device,
      "device",
    ).id,
    "device.id",
  );
}

export function projectCommercialRelease(
  value: unknown,
): CommercialReleaseSnapshot {
  const release = exactRecord(value, "release", [
    "available",
    "required",
    "version",
    "reason",
  ]);
  const version = exactRecord(release.version, "release.version", [
    "id",
    "version",
    "notes",
    "pubDate",
    "minimumSupportedVersion",
    "status",
    "createdAt",
    "publishedAt",
    "artifacts",
  ]);
  if (!Array.isArray(version.artifacts)) {
    throw new Error("release.version.artifacts must be an array");
  }
  return {
    available: booleanValue(release.available, "release.available"),
    required: booleanValue(release.required, "release.required"),
    version: {
      id: uuidOrEmpty(version.id, "release.version.id"),
      version: stringValue(version.version, "release.version.version"),
      notes: stringValue(version.notes, "release.version.notes"),
      pubDate: stringValue(version.pubDate, "release.version.pubDate"),
      minimumSupportedVersion: stringValue(
        version.minimumSupportedVersion,
        "release.version.minimumSupportedVersion",
      ),
      status: stringValue(version.status, "release.version.status"),
      createdAt: stringValue(version.createdAt, "release.version.createdAt"),
      publishedAt: stringValue(
        version.publishedAt,
        "release.version.publishedAt",
      ),
      artifacts: version.artifacts.map((value, index) =>
        projectReleaseArtifact(value, `release.version.artifacts[${index}]`),
      ),
    },
    reason: stringValue(release.reason, "release.reason"),
  };
}

function projectReleaseArtifact(
  value: unknown,
  name: string,
): CommercialReleaseArtifactSnapshot {
  const artifact = exactRecord(value, name, [
    "id",
    "versionId",
    "target",
    "arch",
    "installerKind",
    "fileId",
    "manifestFileId",
    "sha256",
    "sizeBytes",
    "manifestSha256",
    "manifestSizeBytes",
    "fileName",
    "manifestFileName",
    "contentType",
    "manifestContentType",
    "createdAt",
  ]);
  return {
    id: uuid(artifact.id, `${name}.id`),
    versionId: uuid(artifact.versionId, `${name}.versionId`),
    target: requiredText(artifact.target, `${name}.target`),
    arch: requiredText(artifact.arch, `${name}.arch`),
    installerKind: requiredText(
      artifact.installerKind,
      `${name}.installerKind`,
    ),
    fileId: positiveInteger(artifact.fileId, `${name}.fileId`),
    manifestFileId: positiveInteger(
      artifact.manifestFileId,
      `${name}.manifestFileId`,
    ),
    sha256: requiredText(artifact.sha256, `${name}.sha256`),
    sizeBytes: positiveInteger(artifact.sizeBytes, `${name}.sizeBytes`),
    manifestSha256: requiredText(
      artifact.manifestSha256,
      `${name}.manifestSha256`,
    ),
    manifestSizeBytes: positiveInteger(
      artifact.manifestSizeBytes,
      `${name}.manifestSizeBytes`,
    ),
    fileName: requiredText(artifact.fileName, `${name}.fileName`),
    manifestFileName: requiredText(
      artifact.manifestFileName,
      `${name}.manifestFileName`,
    ),
    contentType: requiredText(artifact.contentType, `${name}.contentType`),
    manifestContentType: requiredText(
      artifact.manifestContentType,
      `${name}.manifestContentType`,
    ),
    createdAt: stringValue(artifact.createdAt, `${name}.createdAt`),
  };
}

/**
 * Selects the artifact matching the running platform/arch from a release-check
 * response and attaches its id, so the renderer can download the correct
 * installer without seeing the full release payload.
 */
export function selectReleaseArtifactId(
  value: CommercialReleaseSnapshot,
  target: string,
  arch: string,
): CommercialReleaseSnapshot & { artifactId: string | null } {
  const matchingArtifacts = value.version.artifacts.filter(
    (artifact) => artifact.target === target && artifact.arch === arch,
  );
  const preferredKind = preferredInstallerKind(target);
  const selected =
    matchingArtifacts.find(
      (artifact) =>
        preferredKind !== null &&
        artifact.installerKind.toLowerCase() === preferredKind,
    ) ?? matchingArtifacts[0];
  return { ...value, artifactId: selected?.id ?? null };
}

function preferredInstallerKind(target: string): string | null {
  if (target === "windows") return "nsis";
  if (target === "macos") return "zip";
  return null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactRecord(
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
    throw new Error(`${name} fields must be exactly ${expected.join(", ")}`);
  }
  return record;
}

function nullableExactRecord(
  value: unknown,
  name: string,
  fields: readonly string[],
): Record<string, unknown> | null {
  return value === null ? null : exactRecord(value, name, fields);
}

function uuid(value: unknown, name: string): UUID {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new Error(`${name} must be a UUID string`);
  }
  return value.trim().toLowerCase();
}

function uuidOrEmpty(value: unknown, name: string): UUID {
  const text = stringValue(value, name);
  return text === "" ? "" : uuid(text, name);
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string`);
  }
  return value;
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
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

function nonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, name: string): number {
  const result = nonNegativeInteger(value, name);
  if (result === 0) throw new Error(`${name} must be a positive integer`);
  return result;
}
