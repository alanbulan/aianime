export type CommercialEditionType = "STANDARD" | "PROFESSIONAL";

export interface CommercialEntitlement {
  license: {
    id: string;
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
    id: string;
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
    id: string;
    licenseId: string;
    deviceId: string;
    status: string;
    activatedAt: string;
    lastHeartbeatAt: string;
    endedAt: string;
    endReason: string;
  } | null;
  lease: {
    id: string;
    activationId: string;
    issuedAt: string;
    expiresAt: string;
    keyId: string;
    verifiedOffline: boolean;
  } | null;
  capabilities: {
    editionType: CommercialEditionType | null;
    deviceActivated: boolean;
    allowsCloudModels: boolean;
    allowsCustomModels: boolean;
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function commercialEntitlementAllowsWorkspace(
  entitlement: CommercialEntitlement,
): boolean {
  return entitlement.capabilities.deviceActivated;
}

export function parseCommercialEntitlement(
  value: unknown,
): CommercialEntitlement {
  const root = record(value, "commercial entitlement", [
    "license",
    "device",
    "activation",
    "lease",
    "capabilities",
  ]);
  const licenseRecord = record(root.license, "license", [
    "id",
    "versionCode",
    "versionName",
    "editionType",
    "allowsCustomModels",
    "status",
    "validFrom",
    "validUntil",
    "maxDevices",
    "activeDevices",
  ]);
  const deviceRecord = nullableRecord(root.device, "device", [
    "id",
    "publicKeyHash",
    "name",
    "platform",
    "arch",
    "clientVersion",
    "status",
    "createdAt",
    "lastSeenAt",
  ]);
  const activationRecord = nullableRecord(root.activation, "activation", [
    "id",
    "licenseId",
    "deviceId",
    "status",
    "activatedAt",
    "lastHeartbeatAt",
    "endedAt",
    "endReason",
  ]);
  const leaseRecord = nullableRecord(root.lease, "lease", [
    "id",
    "activationId",
    "issuedAt",
    "expiresAt",
    "keyId",
    "verifiedOffline",
  ]);
  const capabilitiesRecord = record(
    root.capabilities,
    "commercial capabilities",
    [
      "editionType",
      "deviceActivated",
      "allowsCloudModels",
      "allowsCustomModels",
    ],
  );

  const license = {
    id: uuid(licenseRecord.id, "license.id"),
    versionCode: stringValue(licenseRecord.versionCode, "license.versionCode"),
    versionName: stringValue(licenseRecord.versionName, "license.versionName"),
    editionType: edition(licenseRecord.editionType),
    allowsCustomModels: booleanValue(
      licenseRecord.allowsCustomModels,
      "license.allowsCustomModels",
    ),
    status: stringValue(licenseRecord.status, "license.status"),
    validFrom: stringValue(licenseRecord.validFrom, "license.validFrom"),
    validUntil: stringValue(licenseRecord.validUntil, "license.validUntil"),
    maxDevices: nonNegativeInteger(
      licenseRecord.maxDevices,
      "license.maxDevices",
    ),
    activeDevices: nonNegativeInteger(
      licenseRecord.activeDevices,
      "license.activeDevices",
    ),
  };
  const device = deviceRecord
    ? {
        id: uuid(deviceRecord.id, "device.id"),
        publicKeyHash: text(deviceRecord.publicKeyHash, "device.publicKeyHash"),
        name: stringValue(deviceRecord.name, "device.name"),
        platform: stringValue(deviceRecord.platform, "device.platform"),
        arch: stringValue(deviceRecord.arch, "device.arch"),
        clientVersion: stringValue(
          deviceRecord.clientVersion,
          "device.clientVersion",
        ),
        status: stringValue(deviceRecord.status, "device.status"),
        createdAt: stringValue(deviceRecord.createdAt, "device.createdAt"),
        lastSeenAt: stringValue(deviceRecord.lastSeenAt, "device.lastSeenAt"),
      }
    : null;
  const activation = activationRecord
    ? {
        id: uuid(activationRecord.id, "activation.id"),
        licenseId: uuid(activationRecord.licenseId, "activation.licenseId"),
        deviceId: uuid(activationRecord.deviceId, "activation.deviceId"),
        status: stringValue(activationRecord.status, "activation.status"),
        activatedAt: stringValue(
          activationRecord.activatedAt,
          "activation.activatedAt",
        ),
        lastHeartbeatAt: stringValue(
          activationRecord.lastHeartbeatAt,
          "activation.lastHeartbeatAt",
        ),
        endedAt: stringValue(activationRecord.endedAt, "activation.endedAt"),
        endReason: stringValue(
          activationRecord.endReason,
          "activation.endReason",
        ),
      }
    : null;
  const lease = leaseRecord
    ? {
        id: uuid(leaseRecord.id, "lease.id"),
        activationId: uuid(leaseRecord.activationId, "lease.activationId"),
        issuedAt: stringValue(leaseRecord.issuedAt, "lease.issuedAt"),
        expiresAt: stringValue(leaseRecord.expiresAt, "lease.expiresAt"),
        keyId: text(leaseRecord.keyId, "lease.keyId"),
        verifiedOffline: booleanValue(
          leaseRecord.verifiedOffline,
          "lease.verifiedOffline",
        ),
      }
    : null;
  const declaredEdition = nullableEdition(capabilitiesRecord.editionType);
  if (declaredEdition !== null && declaredEdition !== license.editionType) {
    throw new Error("Commercial capability edition does not match the license");
  }
  const deviceActivated = Boolean(
    booleanValue(
      capabilitiesRecord.deviceActivated,
      "capabilities.deviceActivated",
    ) &&
      device &&
      activation,
  );
  const allowsCloudModels = Boolean(
    booleanValue(
      capabilitiesRecord.allowsCloudModels,
      "capabilities.allowsCloudModels",
    ) && deviceActivated,
  );
  const allowsCustomModels = Boolean(
    booleanValue(
      capabilitiesRecord.allowsCustomModels,
      "capabilities.allowsCustomModels",
    ) &&
      allowsCloudModels &&
      license.editionType === "PROFESSIONAL" &&
      license.allowsCustomModels,
  );

  return {
    license,
    device,
    activation,
    lease,
    capabilities: {
      editionType: license.editionType,
      deviceActivated,
      allowsCloudModels,
      allowsCustomModels,
    },
  };
}

export function parseBootstrapEntitlement(
  value: unknown,
): CommercialEntitlement {
  const bootstrap = record(value, "commercial bootstrap", [
    "softwareAuthorization",
    "personalQuota",
    "models",
    "release",
    "warnings",
  ]);
  if (bootstrap.softwareAuthorization === null) {
    throw new Error("当前账户没有可用的软件许可");
  }
  return parseCommercialEntitlement(bootstrap.softwareAuthorization);
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

function nullableRecord(
  value: unknown,
  name: string,
  fields: readonly string[],
): Record<string, unknown> | null {
  return value === null ? null : record(value, name, fields);
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new Error(`${name} must be a UUID string`);
  }
  return value.trim().toLowerCase();
}

function text(value: unknown, name: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`${name} must be a non-empty string`);
  return result;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function booleanValue(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return Number(value);
}

function edition(value: unknown): CommercialEditionType {
  if (value === "STANDARD" || value === "PROFESSIONAL") return value;
  throw new Error("license.editionType is invalid");
}

function nullableEdition(value: unknown): CommercialEditionType | null {
  return value === null ? null : edition(value);
}
