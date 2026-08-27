// Copyright (c) 2026 AI anime

import { verifyOfflineLease } from "./commercial-lease.js";
import {
  BYOK_MODEL_ROLES,
  fetchByokModelCatalog,
  type ByokModelAssignment,
  type ByokModelRole,
  type CommercialModelAccessStatus,
} from "./commercial-model-access.js";
import {
  projectCommercialModelCatalog,
  type CommercialAuthorizationSnapshot,
  type CommercialModelCapabilitySnapshot,
} from "./commercial-contracts.js";
import {
  CommercialApiError,
  optionalRecord,
  optionalText,
  requiredInteger,
  requiredRawText,
  requiredRecord,
  requiredText,
  type CommercialBootstrapQuery,
  type CommercialInvocationQuery,
  type CommercialLoginInput,
  type CommercialRememberedLoginInput,
  type CommercialModelCatalogQuery,
  type CommercialProfileUpdateInput,
  type CommercialRegistrationInput,
} from "./commercial-api-client.js";

export interface CommercialLeaseVerificationOptions {
  leaseSigningKeys?: Record<string, string>;
  devicePublicKeyHash?: string;
}

const REFERENCE_DURATION_CAPABILITY_FIELDS = [
  ["referenceAudioMinSeconds", ["referenceAudioMinSeconds"]],
  [
    "referenceAudioMaxSeconds",
    ["referenceAudioMaxSeconds", "referenceAudioItemMaxDuration"],
  ],
  ["referenceAudioTotalMinSeconds", ["referenceAudioTotalMinSeconds"]],
  [
    "referenceAudioTotalMaxSeconds",
    ["referenceAudioTotalMaxSeconds", "referenceAudioTotalMaxDuration"],
  ],
  ["referenceVideoMinSeconds", ["referenceVideoMinSeconds"]],
  [
    "referenceVideoMaxSeconds",
    ["referenceVideoMaxSeconds", "referenceVideoItemMaxDuration"],
  ],
  ["referenceVideoTotalMinSeconds", ["referenceVideoTotalMinSeconds"]],
  [
    "referenceVideoTotalMaxSeconds",
    ["referenceVideoTotalMaxSeconds", "referenceVideoTotalMaxDuration"],
  ],
] as const;

export function mergeModelCapabilities(
  catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
  target: Map<string, CommercialModelCapabilitySnapshot>,
): void {
  for (const item of catalog?.items ?? []) {
    target.delete(item.code);
    if (!item.capabilityJson) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(item.capabilityJson);
    } catch {
      throw new CommercialApiError(
        `模型 ${item.code} 的 capabilityJson 不是有效 JSON`,
      );
    }
    const capabilities = optionalRecord(raw);
    const projected: CommercialModelCapabilitySnapshot = {
      modelId: item.code,
    };
    for (const [field, sourceFields] of REFERENCE_DURATION_CAPABILITY_FIELDS) {
      const value = sourceFields
        .map((sourceField) => capabilities[sourceField])
        .find(
          (candidate) =>
            typeof candidate === "number" &&
            Number.isFinite(candidate) &&
            candidate > 0,
        );
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        projected[field] = value;
      }
    }
    if (Object.keys(projected).length > 1) {
      target.set(item.code, projected);
    }
  }
}

const CLOUD_ROLES_BY_OPERATION: Readonly<
  Record<string, readonly ByokModelRole[]>
> = {
  TEXT: ["TEXT"],
  IMAGE: ["IMAGE_GENERATION", "IMAGE_EDIT"],
  VIDEO: [
    "VIDEO_TEXT_TO_VIDEO",
    "VIDEO_IMAGE_TO_VIDEO",
    "VIDEO_FIRST_LAST_FRAME",
    "VIDEO_IMAGE_REFERENCE",
    "VIDEO_ALL_REFERENCE",
    "VIDEO_EDIT",
  ],
  AUDIO: ["AUDIO_SPEECH", "AUDIO_VOICE_CLONE", "AUDIO_MUSIC"],
  AUDIO_VOICE_CLONE: ["AUDIO_SPEECH", "AUDIO_VOICE_CLONE"],
  AUDIO_VOICE_DESIGN: ["AUDIO_VOICE_DESIGN"],
  AUDIO_MUSIC: ["AUDIO_MUSIC"],
  EMBEDDING: ["EMBEDDING"],
};

const CLOUD_ROLE_MODES: Readonly<
  Partial<Record<ByokModelRole, readonly string[]>>
> = {
  IMAGE_GENERATION: ["TEXT_TO_IMAGE", "IMAGE_GENERATION"],
  IMAGE_EDIT: ["IMAGE_TO_IMAGE", "IMAGE_EDIT", "EDIT"],
  VIDEO_TEXT_TO_VIDEO: ["TEXT_TO_VIDEO"],
  VIDEO_IMAGE_TO_VIDEO: ["FIRST_FRAME", "IMAGE_TO_VIDEO"],
  VIDEO_FIRST_LAST_FRAME: ["FIRST_LAST_FRAME", "MULTIMODAL_REFERENCE"],
  VIDEO_IMAGE_REFERENCE: [
    "IMAGE_REFERENCE",
    "REFERENCE_IMAGE",
    "MULTIMODAL_REFERENCE",
  ],
  VIDEO_ALL_REFERENCE: ["ALL_REFERENCE", "MULTIMODAL_REFERENCE"],
  VIDEO_EDIT: ["VIDEO_EDIT", "EDIT", "VIDEO_TO_VIDEO", "REMIX"],
  AUDIO_SPEECH: ["SPEECH", "TEXT_TO_SPEECH", "SPEECH_SYNTHESIS"],
  AUDIO_VOICE_CLONE: ["VOICE_CLONE"],
  AUDIO_VOICE_DESIGN: ["VOICE_DESIGN"],
  AUDIO_MUSIC: ["MUSIC", "TEXT_TO_MUSIC", "MUSIC_GENERATION"],
};

export function updateCloudModelAssignments(
  current: readonly ByokModelAssignment[],
  catalog: ReturnType<typeof projectCommercialModelCatalog> | null,
  requestedOperation?: string,
): ByokModelAssignment[] {
  const operations = new Set(
    (catalog?.items ?? []).map((item) => item.operation.trim().toUpperCase()),
  );
  const normalizedRequestedOperation = requestedOperation?.trim().toUpperCase();
  if (normalizedRequestedOperation) operations.add(normalizedRequestedOperation);
  if (operations.size === 0) return [...current];

  const replacedRoles = new Set<ByokModelRole>();
  for (const operation of operations) {
    for (const role of CLOUD_ROLES_BY_OPERATION[operation] ?? []) {
      replacedRoles.add(role);
    }
  }
  const next = current.filter((item) => !replacedRoles.has(item.role));
  if (!catalog) return next;

  for (const role of replacedRoles) {
    const candidates = catalog.items.filter((item) =>
      catalogItemSupportsRole(item, role),
    );
    const currentSelection = current.find(
      (item) =>
        item.role === role &&
        candidates.some((candidate) => candidate.code === item.modelId),
    );
    const defaults = candidates.filter((item) => item.isDefault === true);
    const selected =
      currentSelection
        ? candidates.find((item) => item.code === currentSelection.modelId) ?? null
        : defaults.length === 1
        ? defaults[0]
        : defaults.length === 0 && candidates.length === 1
          ? candidates[0]
          : null;
    if (selected) {
      next.push({
        modelId: selected.code,
        role,
        priority: currentSelection?.priority ?? 100,
        enabled: currentSelection?.enabled ?? true,
      });
    }
  }
  return next.sort(
    (left, right) =>
      BYOK_MODEL_ROLES.indexOf(left.role) - BYOK_MODEL_ROLES.indexOf(right.role),
  );
}

export function mergeModelCatalogs(
  cloud: ReturnType<typeof projectCommercialModelCatalog> | null,
  byok: Awaited<ReturnType<typeof fetchByokModelCatalog>>,
): ReturnType<typeof projectCommercialModelCatalog> {
  if (!cloud) return byok;
  const items = cloud.items.map((item) => ({
    ...item,
    capabilityJson: withRouteSelector(
      item.capabilityJson,
      `cloud:${item.code}`,
    ),
  }));
  const seen = new Set(items.map((item) => String(item.id)));
  for (const item of byok.items) {
    if (!seen.has(String(item.id))) items.push(item);
  }
  return {
    catalogVersion: `${cloud.catalogVersion}+${byok.catalogVersion}`,
    items,
  };
}

function withRouteSelector(
  capabilityJson: string | undefined,
  routeSelector: string,
): string {
  let capabilities: Record<string, unknown> = {};
  if (capabilityJson) {
    try {
      capabilities = optionalRecord(JSON.parse(capabilityJson));
    } catch {
      throw new CommercialApiError("云端模型 capabilityJson 不是有效 JSON");
    }
  }
  return JSON.stringify({ ...capabilities, routeSelector });
}

function catalogItemSupportsRole(
  item: ReturnType<typeof projectCommercialModelCatalog>["items"][number],
  role: ByokModelRole,
): boolean {
  const operation = item.operation.trim().toUpperCase();
  if (!(CLOUD_ROLES_BY_OPERATION[operation] ?? []).includes(role)) return false;
  const roleModes = CLOUD_ROLE_MODES[role];
  if (!roleModes) return true;

  const modes = catalogItemModes(item.capabilityJson);
  if (modes.length > 0) {
    return roleModes.some((mode) => modes.includes(mode));
  }
  return role === "IMAGE_GENERATION" || role === "VIDEO_TEXT_TO_VIDEO";
}

function catalogItemModes(capabilityJson: string | undefined): string[] {
  if (!capabilityJson) return [];
  let value: unknown;
  try {
    value = JSON.parse(capabilityJson);
  } catch {
    return [];
  }
  const capabilities = optionalRecord(value);
  const rawModes =
    capabilities.supportedModes ?? capabilities.modes ?? capabilities.audioModes;
  if (!Array.isArray(rawModes)) return [];
  return rawModes
    .filter((mode): mode is string => typeof mode === "string")
    .map((mode) =>
      mode
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toUpperCase()
        .replaceAll(/[^A-Z0-9]+/g, "_"),
    )
    .filter(Boolean);
}

export function authorizationAllowsByok(
  authorization: CommercialAuthorizationSnapshot | null,
): boolean {
  return authorization?.capabilities.allowsCustomModels === true;
}

export function rendererModelAccessStatus(
  status: CommercialModelAccessStatus,
  allowsCustomModels: boolean,
  gatewayOrigin: string,
  cloudModelAssignments: readonly ByokModelAssignment[],
) {
  if (allowsCustomModels) {
    return {
      ...status,
      cloudModelAssignments: [...cloudModelAssignments],
      allowsCustomModels: true,
      gatewayOrigin,
    };
  }
  return {
    ...status,
    mode: "mixed" as const,
    cloudModelAssignments: [...cloudModelAssignments],
    byokConfigured: false,
    byokProviders: [],
    allowsCustomModels: false,
    gatewayOrigin,
  };
}

export function verifyAuthorizationLease(
  raw: unknown,
  authorization: CommercialAuthorizationSnapshot,
  options: CommercialLeaseVerificationOptions,
): CommercialAuthorizationSnapshot {
  if (!authorization.lease) return authorization;
  if (!options.leaseSigningKeys) return authorization;
  const root = optionalRecord(raw);
  const lease = optionalRecord(root.lease);
  const result = verifyOfflineLease(
    lease as Parameters<typeof verifyOfflineLease>[0],
    {
      publicKeys: options.leaseSigningKeys,
      ...(options.devicePublicKeyHash === undefined
        ? {}
        : { devicePublicKeyHash: options.devicePublicKeyHash }),
      ...(authorization.license?.id === undefined
        ? {}
        : { licenseId: authorization.license.id }),
    },
  );
  return result.verified
    ? {
        ...authorization,
        lease: { ...authorization.lease, verifiedOffline: true },
      }
    : authorization;
}

export function parseLoginInput(value: unknown): CommercialLoginInput {
  const input = requiredRecord(value, "login");
  const rememberMe = input.rememberMe;
  if (rememberMe !== undefined && typeof rememberMe !== "boolean") {
    throw new CommercialApiError("rememberMe 必须是布尔值");
  }
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    tenantCode: requiredText(input.tenantCode, "tenantCode"),
    username: requiredText(input.username, "username"),
    password: requiredRawText(input.password, "password"),
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

export function parseRememberedLoginInput(
  value: unknown,
): CommercialRememberedLoginInput {
  const input = requiredRecord(value, "remembered login");
  const rememberMe = input.rememberMe;
  if (rememberMe !== undefined && typeof rememberMe !== "boolean") {
    throw new CommercialApiError("rememberMe 必须是布尔值");
  }
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    ...(rememberMe === undefined ? {} : { rememberMe }),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

export function parseRegistrationInput(value: unknown): CommercialRegistrationInput {
  const input = requiredRecord(value, "registration");
  const nickname = optionalText(input.nickname);
  const email = optionalText(input.email);
  const captchaKey = optionalText(input.captchaKey);
  const captchaCode = optionalText(input.captchaCode);
  return {
    tenantCode: requiredText(input.tenantCode, "tenantCode"),
    username: requiredText(input.username, "username"),
    password: requiredRawText(input.password, "password"),
    ...(nickname ? { nickname } : {}),
    ...(email ? { email } : {}),
    ...(captchaKey ? { captchaKey } : {}),
    ...(captchaCode ? { captchaCode } : {}),
  };
}

export function parseProfileUpdateInput(value: unknown): CommercialProfileUpdateInput {
  const input = requiredRecord(value, "profile update");
  const gender = requiredInteger(input.gender, "gender");
  if (gender !== 0 && gender !== 1 && gender !== 2) {
    throw new CommercialApiError("gender 只能为 0、1 或 2");
  }
  return {
    nickname: textField(input.nickname, "nickname"),
    email: textField(input.email, "email"),
    phone: textField(input.phone, "phone"),
    gender,
    profileDescription: textField(
      input.profileDescription,
      "profileDescription",
    ),
  };
}

function textField(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new CommercialApiError(`${name} 必须是字符串`);
  }
  return value;
}

export function requiredBytes(value: unknown, name: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new CommercialApiError(`${name} 必须是字节数组`);
}

export function parseBootstrapQuery(value: unknown): CommercialBootstrapQuery {
  const input = optionalRecord(value);
  const modelOperation = optionalText(input.modelOperation);
  const currentVersion = optionalText(input.currentVersion);
  const target = optionalText(input.target);
  const arch = optionalText(input.arch);
  return {
    ...(modelOperation ? { modelOperation } : {}),
    ...(currentVersion ? { currentVersion } : {}),
    ...(target ? { target } : {}),
    ...(arch ? { arch } : {}),
  };
}

export function parseModelCatalogQuery(value: unknown): {
  source: "active" | "cloud";
  query: CommercialModelCatalogQuery;
} {
  const input = optionalRecord(value);
  const operation = optionalText(input.operation);
  const catalogVersion = optionalText(input.catalogVersion);
  const requestedSource = optionalText(input.source)?.toLowerCase() ?? "";
  if (requestedSource && requestedSource !== "active" && requestedSource !== "cloud") {
    throw new CommercialApiError("模型目录来源无效");
  }
  return {
    source: requestedSource === "cloud" ? "cloud" : "active",
    query: {
      ...(operation ? { operation } : {}),
      ...(catalogVersion ? { catalogVersion } : {}),
    },
  };
}

export function parseInvocationQuery(value: unknown): CommercialInvocationQuery {
  const input = optionalRecord(value);
  const page = input.page === undefined ? undefined : requiredInteger(input.page, "page");
  const pageSize =
    input.pageSize === undefined
      ? undefined
      : requiredInteger(input.pageSize, "pageSize");
  if (page !== undefined && page < 1) {
    throw new CommercialApiError("page 必须大于等于 1");
  }
  if (pageSize !== undefined && (pageSize < 1 || pageSize > 100)) {
    throw new CommercialApiError("pageSize 必须是 1 到 100 之间的整数");
  }
  const status = optionalText(input.status);
  const operation = optionalText(input.operation);
  const modelSkuCode = optionalText(input.modelSkuCode);
  return {
    ...(page === undefined ? {} : { page }),
    ...(pageSize === undefined ? {} : { pageSize }),
    ...(status ? { status } : {}),
    ...(operation ? { operation } : {}),
    ...(modelSkuCode ? { modelSkuCode } : {}),
  };
}
