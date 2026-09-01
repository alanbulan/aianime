// Copyright (c) 2026 AI anime

import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { verifyOfflineLease } from "../src/commercial-lease.ts";

const LEASE_ID = "11111111-1111-4111-8111-111111111111";
const ACTIVATION_ID = "22222222-2222-4222-8222-222222222222";
const LICENSE_ID = "33333333-3333-4333-8333-333333333333";
const DEVICE_ID = "44444444-4444-4444-8444-444444444444";
const DEVICE_PUBLIC_KEY_HASH = "a".repeat(64);

function leaseFixture(overrides = {}, payloadOverrides = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const activationId = overrides.activationId ?? ACTIVATION_ID;
  const issuedAt = overrides.issuedAt ?? "2026-07-23T09:00:00Z";
  const expiresAt = overrides.expiresAt ?? "2099-01-01T00:00:00Z";
  const payload = {
    activationId,
    licenseId: LICENSE_ID,
    deviceId: DEVICE_ID,
    devicePublicKeyHash: DEVICE_PUBLIC_KEY_HASH,
    editionType: "PROFESSIONAL",
    allowsCustomModels: true,
    issuedAt,
    expiresAt,
    keyId: "license-signing-2026-01",
    ...payloadOverrides,
  };
  const payloadJson = JSON.stringify(payload);
  const lease = {
    id: LEASE_ID,
    activationId,
    issuedAt,
    expiresAt,
    payloadJson,
    signature: sign(null, Buffer.from(payloadJson, "utf8"), privateKey).toString(
      "base64",
    ),
    keyId: "license-signing-2026-01",
    ...overrides,
  };
  return { publicKeyPem, lease };
}

test("verifies a valid offline lease and exposes signed capability fields", () => {
  const { publicKeyPem, lease } = leaseFixture();
  const result = verifyOfflineLease(lease, {
    publicKeys: { "license-signing-2026-01": publicKeyPem },
    devicePublicKeyHash: DEVICE_PUBLIC_KEY_HASH,
    licenseId: LICENSE_ID,
    now: () => Date.parse("2026-07-25T00:00:00Z"),
  });

  assert.equal(result.verified, true);
  assert.equal(result.expired, false);
  assert.equal(result.editionType, "PROFESSIONAL");
  assert.equal(result.allowsCustomModels, true);
  assert.equal(result.reason, null);
});

test("rejects a tampered payload signature", () => {
  const { publicKeyPem, lease } = leaseFixture({
    payloadJson: JSON.stringify({
      keyId: "license-signing-2026-01",
      editionType: "STANDARD",
      allowsCustomModels: false,
    }),
  });
  const result = verifyOfflineLease(lease, {
    publicKeys: { "license-signing-2026-01": publicKeyPem },
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /签名/);
});

test("rejects an expired lease", () => {
  const { publicKeyPem, lease } = leaseFixture({
    expiresAt: "2026-07-30T09:00:00Z",
  });
  const result = verifyOfflineLease(lease, {
    publicKeys: { "license-signing-2026-01": publicKeyPem },
    now: () => Date.parse("2026-08-01T00:00:00Z"),
  });

  assert.equal(result.verified, false);
  assert.equal(result.expired, true);
  assert.match(result.reason, /已过期/);
});

test("fails closed when the signing key is not configured", () => {
  const { lease } = leaseFixture();
  const result = verifyOfflineLease(lease, { publicKeys: {} });

  assert.equal(result.verified, false);
  assert.match(result.reason, /未配置许可签名公钥/);
});

test("rejects a keyId mismatch between header and signed payload", () => {
  const { publicKeyPem, lease } = leaseFixture(
    { keyId: "other-key" },
    { keyId: "license-signing-2026-01" },
  );
  const result = verifyOfflineLease(lease, {
    publicKeys: {
      "other-key": publicKeyPem,
      "license-signing-2026-01": publicKeyPem,
    },
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /keyId 不一致/);
});

test("rejects a device digest mismatch when the expected hash is given", () => {
  const { publicKeyPem, lease } = leaseFixture();
  const result = verifyOfflineLease(lease, {
    publicKeys: { "license-signing-2026-01": publicKeyPem },
    devicePublicKeyHash: "b".repeat(64),
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /设备摘要不一致/);
});

test("rejects signed leases with missing bindings or non-UUID resource ids", () => {
  const missingBinding = leaseFixture({}, { devicePublicKeyHash: undefined });
  assert.equal(
    verifyOfflineLease(missingBinding.lease, {
      publicKeys: {
        "license-signing-2026-01": missingBinding.publicKeyPem,
      },
    }).verified,
    false,
  );

  const invalidLeaseId = leaseFixture({ id: "lease-id" });
  const invalidResult = verifyOfflineLease(invalidLeaseId.lease, {
    publicKeys: {
      "license-signing-2026-01": invalidLeaseId.publicKeyPem,
    },
  });
  assert.equal(invalidResult.verified, false);
  assert.match(invalidResult.reason, /UUID/);
});

test("rejects a lease without a signed edition type", () => {
  const { publicKeyPem, lease } = leaseFixture({}, { editionType: "TRIAL" });
  const result = verifyOfflineLease(lease, {
    publicKeys: { "license-signing-2026-01": publicKeyPem },
  });

  assert.equal(result.verified, false);
  assert.match(result.reason, /editionType/);
});
