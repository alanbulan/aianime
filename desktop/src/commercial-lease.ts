// Copyright (c) 2026 AI anime

import { createPublicKey, verify } from "node:crypto";

export type CommercialEditionType = "STANDARD" | "PROFESSIONAL";

export interface OfflineLeaseRecord {
  id?: unknown;
  activationId?: unknown;
  issuedAt?: unknown;
  expiresAt?: unknown;
  payloadJson?: unknown;
  signature?: unknown;
  keyId?: unknown;
}

export interface OfflineLeaseVerifyOptions {
  /**
   * keyId -> PEM SPKI public key. Offline verification fails closed when the
   * lease references an unknown key or no keys are configured.
   */
  publicKeys: Record<string, string>;
  now?: () => number;
  /** Optional: signed payload must contain the same device public-key hash. */
  devicePublicKeyHash?: string;
  /** Optional: signed payload must contain the same license id. */
  licenseId?: string;
}

export interface OfflineLeaseVerificationResult {
  verified: boolean;
  expired: boolean;
  editionType: CommercialEditionType | null;
  allowsCustomModels: boolean | null;
  reason: string | null;
}

const failed = (
  reason: string,
  expired = false,
): OfflineLeaseVerificationResult => ({
  verified: false,
  expired,
  editionType: null,
  allowsCustomModels: null,
  reason,
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const LEASE_PAYLOAD_FIELDS = [
  "activationId",
  "allowsCustomModels",
  "deviceId",
  "devicePublicKeyHash",
  "editionType",
  "expiresAt",
  "issuedAt",
  "keyId",
  "licenseId",
] as const;

/**
 * Verifies an offline lease per the Gateway contract: the signature covers the
 * raw UTF-8 bytes of `payloadJson` with the key referenced by `keyId`; the
 * payload must be valid JSON, carry `editionType`/`allowsCustomModels`, not be
 * expired, and match the expected keyId / device / license digests when given.
 */
export function verifyOfflineLease(
  lease: OfflineLeaseRecord,
  options: OfflineLeaseVerifyOptions,
): OfflineLeaseVerificationResult {
  const now = options.now ?? Date.now;
  if (typeof lease.id !== "string" || !UUID_PATTERN.test(lease.id)) {
    return failed("租约 id 不是 UUID");
  }
  if (
    typeof lease.activationId !== "string" ||
    !UUID_PATTERN.test(lease.activationId)
  ) {
    return failed("租约 activationId 不是 UUID");
  }
  if (typeof lease.issuedAt !== "string") {
    return failed("租约缺少签发时间");
  }
  const issuedAtMs = Date.parse(lease.issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return failed("租约签发时间格式无效");
  }
  if (typeof lease.payloadJson !== "string" || !lease.payloadJson) {
    return failed("租约缺少 payloadJson");
  }
  if (typeof lease.signature !== "string" || !lease.signature) {
    return failed("租约缺少签名");
  }
  if (typeof lease.keyId !== "string" || !lease.keyId) {
    return failed("租约缺少 keyId");
  }
  const publicKeyPem = options.publicKeys[lease.keyId];
  if (!publicKeyPem || !publicKeyPem.trim()) {
    return failed(`未配置许可签名公钥：${lease.keyId}`);
  }

  let publicKey;
  try {
    publicKey = createPublicKey({
      key: publicKeyPem,
      format: "pem",
      type: "spki",
    });
    if (publicKey.asymmetricKeyType !== "ed25519") {
      return failed("许可签名公钥必须是 Ed25519 公钥");
    }
  } catch {
    return failed("许可签名公钥无效");
  }

  const payloadBytes = Buffer.from(lease.payloadJson, "utf8");
  let signature: Buffer;
  try {
    signature = Buffer.from(lease.signature, "base64");
  } catch {
    return failed("租约签名编码无效");
  }
  let valid = false;
  try {
    valid = verify(null, payloadBytes, publicKey, signature);
  } catch {
    valid = false;
  }
  if (!valid) {
    return failed("租约签名校验失败");
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(lease.payloadJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return failed("租约载荷无效");
  }

  const actualPayloadFields = Object.keys(payload).sort();
  if (
    actualPayloadFields.length !== LEASE_PAYLOAD_FIELDS.length ||
    LEASE_PAYLOAD_FIELDS.some(
      (field, index) => field !== actualPayloadFields[index],
    )
  ) {
    return failed("租约载荷字段不完整或包含未知字段");
  }
  if (
    typeof payload.activationId !== "string" ||
    !UUID_PATTERN.test(payload.activationId) ||
    payload.activationId !== lease.activationId
  ) {
    return failed("租约 activationId 不一致");
  }
  if (
    typeof payload.licenseId !== "string" ||
    !UUID_PATTERN.test(payload.licenseId)
  ) {
    return failed("租约 licenseId 不是 UUID");
  }
  if (
    options.licenseId !== undefined &&
    payload.licenseId !== options.licenseId
  ) {
    return failed("租约许可摘要不一致");
  }
  if (
    typeof payload.deviceId !== "string" ||
    !UUID_PATTERN.test(payload.deviceId)
  ) {
    return failed("租约 deviceId 不是 UUID");
  }
  if (
    typeof payload.devicePublicKeyHash !== "string" ||
    !SHA256_PATTERN.test(payload.devicePublicKeyHash)
  ) {
    return failed("租约缺少有效的设备公钥摘要");
  }
  if (
    options.devicePublicKeyHash !== undefined &&
    payload.devicePublicKeyHash !== options.devicePublicKeyHash.toLowerCase()
  ) {
    return failed("租约设备摘要不一致");
  }
  if (payload.keyId !== lease.keyId) {
    return failed("租约 keyId 不一致");
  }
  if (payload.issuedAt !== lease.issuedAt) {
    return failed("租约签发时间不一致");
  }
  if (payload.expiresAt !== lease.expiresAt) {
    return failed("租约有效期不一致");
  }
  if (typeof lease.expiresAt !== "string") {
    return failed("租约缺少有效期");
  }
  const expiresAtMs = Date.parse(lease.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return failed("租约有效期格式无效");
  }
  if (expiresAtMs <= issuedAtMs) {
    return failed("租约有效期不得早于签发时间");
  }
  if (expiresAtMs <= now()) {
    return failed("租约已过期", true);
  }

  const editionType =
    payload.editionType === "STANDARD" || payload.editionType === "PROFESSIONAL"
      ? payload.editionType
      : null;
  if (!editionType) {
    return failed("租约缺少 editionType");
  }
  if (typeof payload.allowsCustomModels !== "boolean") {
    return failed("租约缺少 allowsCustomModels");
  }

  return {
    verified: true,
    expired: false,
    editionType,
    allowsCustomModels: payload.allowsCustomModels,
    reason: null,
  };
}
