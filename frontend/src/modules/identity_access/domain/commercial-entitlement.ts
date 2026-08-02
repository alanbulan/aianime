export type CommercialEditionType = "STANDARD" | "PROFESSIONAL";

export interface CommercialEntitlement {
  license: {
    id: string | number;
    versionCode?: string;
    versionName?: string;
    editionType: CommercialEditionType;
    allowsCustomModels: boolean;
    status?: string;
    expiresAt?: string;
  } | null;
  device: {
    id: string | number;
    name?: string;
    status?: string;
  } | null;
  activation: {
    id: string | number;
    status?: string;
    activatedAt?: string;
    lastSeenAt?: string;
  } | null;
  lease: {
    id: string | number;
    activationId?: string | number;
    issuedAt?: string;
    expiresAt?: string;
    keyId?: string;
    verifiedOffline: false;
  } | null;
  capabilities: {
    editionType: CommercialEditionType | null;
    deviceActivated: boolean;
    allowsCloudModels: boolean;
    allowsCustomModels: boolean;
  };
}

export function commercialEntitlementAllowsWorkspace(
  entitlement: CommercialEntitlement,
): boolean {
  return Boolean(
    entitlement.license && entitlement.capabilities.deviceActivated,
  );
}

export function parseCommercialEntitlement(value: unknown): CommercialEntitlement {
  const root = record(value, "commercial entitlement");
  const licenseRecord = nullableRecord(root.license);
  const deviceRecord = nullableRecord(root.device);
  const activationRecord = nullableRecord(root.activation);
  const leaseRecord = nullableRecord(root.lease);
  const capabilitiesRecord = record(root.capabilities, "commercial capabilities");
  const license = licenseRecord
    ? {
        id: identifier(licenseRecord.id, "license.id"),
        editionType: edition(licenseRecord.editionType),
        allowsCustomModels: licenseRecord.allowsCustomModels === true,
        ...optionalText("versionCode", licenseRecord.versionCode),
        ...optionalText("versionName", licenseRecord.versionName),
        ...optionalText("status", licenseRecord.status),
        ...optionalText("expiresAt", licenseRecord.expiresAt),
      }
    : null;
  const device = deviceRecord
    ? {
        id: identifier(deviceRecord.id, "device.id"),
        ...optionalText("name", deviceRecord.name),
        ...optionalText("status", deviceRecord.status),
      }
    : null;
  const activation = activationRecord
    ? {
        id: identifier(activationRecord.id, "activation.id"),
        ...optionalText("status", activationRecord.status),
        ...optionalText("activatedAt", activationRecord.activatedAt),
        ...optionalText("lastSeenAt", activationRecord.lastSeenAt),
      }
    : null;
  const lease = leaseRecord
    ? {
        id: identifier(leaseRecord.id, "lease.id"),
        ...optionalIdentifier("activationId", leaseRecord.activationId),
        ...optionalText("issuedAt", leaseRecord.issuedAt),
        ...optionalText("expiresAt", leaseRecord.expiresAt),
        ...optionalText("keyId", leaseRecord.keyId),
        verifiedOffline: false as const,
      }
    : null;
  if (leaseRecord && leaseRecord.verifiedOffline !== false) {
    throw new Error("Unverified commercial lease cannot enable offline access");
  }
  const deviceActivated = Boolean(
    capabilitiesRecord.deviceActivated === true && device && activation,
  );
  const allowsCloudModels = Boolean(
    capabilitiesRecord.allowsCloudModels === true && license && deviceActivated,
  );
  const allowsCustomModels = Boolean(
    capabilitiesRecord.allowsCustomModels === true &&
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

export function parseBootstrapEntitlement(value: unknown): CommercialEntitlement {
  const bootstrap = record(value, "commercial bootstrap");
  if (bootstrap.softwareAuthorization === null) {
    throw new Error("当前账户没有可用的软件许可");
  }
  return parseCommercialEntitlement(bootstrap.softwareAuthorization);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableRecord(value: unknown): Record<string, unknown> | null {
  return value === null || value === undefined
    ? null
    : record(value, "commercial entitlement field");
}

function identifier(value: unknown, name: string): string | number {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new Error(`${name} must be a string or safe integer`);
}

function edition(value: unknown): CommercialEditionType {
  if (value === "STANDARD" || value === "PROFESSIONAL") return value;
  throw new Error("license.editionType is invalid");
}

function optionalText<K extends string>(key: K, value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? ({ [key]: normalized } as Record<K, string>) : {};
}

function optionalIdentifier<K extends string>(key: K, value: unknown) {
  return value === undefined || value === null
    ? {}
    : ({ [key]: identifier(value, key) } as Record<K, string | number>);
}
