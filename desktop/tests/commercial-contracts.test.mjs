import assert from "node:assert/strict";
import test from "node:test";

import {
  projectCommercialAuthorization,
  selectReleaseArtifactId,
} from "../src/commercial-contracts.ts";

function authorization(editionType, allowsCustomModels, activated = true) {
  return {
    license: {
      id: "license-id",
      editionType,
      allowsCustomModels,
    },
    device: activated ? { id: "device-id" } : null,
    activation: activated ? { id: "activation-id" } : null,
    lease: {
      id: "lease-id",
      payloadJson: '{"secret":"must-not-cross-ipc"}',
      signature: "lease-signature",
      keyId: "license-signing-2026-01",
    },
  };
}

test("STANDARD edition cannot enable BYOK even when the raw flag is true", () => {
  const snapshot = projectCommercialAuthorization(
    authorization("STANDARD", true),
  );

  assert.equal(snapshot.capabilities.allowsCloudModels, true);
  assert.equal(snapshot.capabilities.allowsCustomModels, false);
});

test("authorization projection maps the current gateway timestamp fields", () => {
  const value = authorization("PROFESSIONAL", true);
  value.license.validUntil = "2027-01-02T03:04:05Z";
  value.activation.lastHeartbeatAt = "2026-08-07T10:20:30Z";

  const snapshot = projectCommercialAuthorization(value);

  assert.equal(snapshot.license?.expiresAt, "2027-01-02T03:04:05Z");
  assert.equal(snapshot.activation?.lastSeenAt, "2026-08-07T10:20:30Z");
});

test("release artifact selection picks the id matching platform and arch", () => {
  const projected = selectReleaseArtifactId(
    {
      available: true,
      required: false,
      version: {
        versionCode: "1.1.0",
        artifacts: [
          { id: 1, target: "windows", arch: "arm64", fileName: "a.exe" },
          { id: 2, target: "windows", arch: "x86_64", fileName: "b.exe" },
          { id: 3, target: "macos", arch: "arm64", fileName: "c.dmg" },
        ],
      },
    },
    "windows",
    "x86_64",
  );

  assert.equal(projected.artifactId, 2);
});

test("release artifact selection returns null when no artifact matches", () => {
  const projected = selectReleaseArtifactId(
    {
      available: true,
      required: false,
      version: {
        artifacts: [{ id: 1, target: "windows", arch: "arm64" }],
      },
    },
    "macos",
    "arm64",
  );

  assert.equal(projected.artifactId, null);
});

test("release artifact selection prefers the installable macOS DMG", () => {
  const projected = selectReleaseArtifactId(
    {
      available: true,
      required: false,
      version: {
        artifacts: [
          {
            id: "mac-zip",
            target: "macos",
            arch: "arm64",
            installerKind: "zip",
          },
          {
            id: "mac-dmg",
            target: "macos",
            arch: "arm64",
            installerKind: "DMG",
          },
        ],
      },
    },
    "macos",
    "arm64",
  );

  assert.equal(projected.artifactId, "mac-dmg");
});

test("PROFESSIONAL BYOK requires both server capability and device activation", () => {
  assert.equal(
    projectCommercialAuthorization(
      authorization("PROFESSIONAL", true),
    ).capabilities.allowsCustomModels,
    true,
  );
  assert.equal(
    projectCommercialAuthorization(
      authorization("PROFESSIONAL", true, false),
    ).capabilities.allowsCustomModels,
    false,
  );
  assert.equal(
    projectCommercialAuthorization(
      authorization("PROFESSIONAL", false),
    ).capabilities.allowsCustomModels,
    false,
  );
});

test("lease payload and signature never cross the renderer projection", () => {
  const snapshot = projectCommercialAuthorization(
    authorization("PROFESSIONAL", true),
  );

  assert.equal(snapshot.lease?.verifiedOffline, false);
  assert.equal(Object.hasOwn(snapshot.lease, "payloadJson"), false);
  assert.equal(Object.hasOwn(snapshot.lease, "signature"), false);
});
