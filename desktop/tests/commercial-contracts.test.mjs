import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCommercialBootstrapWire,
  projectCommercialAuthorization,
  projectCommercialBootstrap,
  projectCommercialInvocationDetails,
  projectCommercialInvocationKeyState,
  projectCommercialInvocationList,
  projectCommercialQuota,
  projectCommercialRelease,
  selectReleaseArtifactId,
} from "../src/commercial-contracts.ts";

const IDS = {
  license: "11111111-1111-4111-8111-111111111111",
  device: "22222222-2222-4222-8222-222222222222",
  activation: "33333333-3333-4333-8333-333333333333",
  lease: "44444444-4444-4444-8444-444444444444",
  invocation: "55555555-5555-4555-8555-555555555555",
  reservation: "66666666-6666-4666-8666-666666666666",
  release: "77777777-7777-4777-8777-777777777777",
  artifact: "88888888-8888-4888-8888-888888888888",
  artifactAlt: "99999999-9999-4999-8999-999999999999",
  model: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

function authorization(editionType, allowsCustomModels, activated = true) {
  return {
    license: {
      id: IDS.license,
      versionCode: "professional-2026",
      versionName: "Professional",
      status: "ACTIVE",
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-02T03:04:05Z",
      maxDevices: 3,
      activeDevices: activated ? 1 : 0,
      editionType,
      allowsCustomModels,
    },
    device: activated
      ? {
          id: IDS.device,
          publicKeyHash: "sha256:device",
          deviceName: "Studio Mac",
          platform: "macos",
          arch: "arm64",
          clientVersion: "1.1.62",
          status: "ACTIVE",
          createdAt: "2026-08-01T00:00:00Z",
          lastSeenAt: "2026-08-07T10:20:30Z",
        }
      : null,
    activation: activated
      ? {
          id: IDS.activation,
          licenseId: IDS.license,
          deviceId: IDS.device,
          status: "ACTIVE",
          activatedAt: "2026-08-01T00:00:00Z",
          lastHeartbeatAt: "2026-08-07T10:20:30Z",
          endedAt: "",
          endReason: "",
        }
      : null,
    lease: activated
      ? {
          id: IDS.lease,
          activationId: IDS.activation,
          issuedAt: "2026-08-07T10:00:00Z",
          expiresAt: "2026-08-08T10:00:00Z",
          payloadJson: '{"secret":"must-not-cross-ipc"}',
          signature: "lease-signature",
          keyId: "lease-2026-08-v1",
        }
      : null,
  };
}

function releaseArtifact(id, target, arch, installerKind) {
  return {
    id,
    versionId: IDS.release,
    target,
    arch,
    installerKind,
    fileId: 10,
    manifestFileId: 11,
    sha256: "a".repeat(64),
    sizeBytes: 1024,
    manifestSha256: "b".repeat(64),
    manifestSizeBytes: 128,
    fileName: `${target}.${installerKind}`,
    manifestFileName: "latest.yml",
    contentType: "application/octet-stream",
    manifestContentType: "text/yaml",
    createdAt: "2026-08-01T00:00:00Z",
  };
}

function release(artifacts) {
  return {
    available: true,
    required: false,
    reason: "NEW_VERSION",
    version: {
      id: IDS.release,
      version: "1.1.63",
      notes: "Contract update",
      pubDate: "2026-08-08T00:00:00Z",
      minimumSupportedVersion: "1.1.0",
      status: "PUBLISHED",
      createdAt: "2026-08-01T00:00:00Z",
      publishedAt: "2026-08-08T00:00:00Z",
      artifacts,
    },
  };
}

function invocation() {
  return {
    id: IDS.invocation,
    modelCode: "GPT_IMAGE_2",
    operation: "IMAGE_GENERATION",
    executionMode: "SYNC",
    status: "SUCCEEDED",
    quotaStatus: "COMMITTED",
    reservationId: IDS.reservation,
    reservedUnits: 10,
    chargedUnits: 8,
    refundedUnits: 2,
    balanceBefore: 960,
    balanceAfter: 952,
    errorCode: "",
    errorMessage: "",
    createdAt: "2026-08-01T00:00:00Z",
    startedAt: "2026-08-01T00:00:01Z",
    completedAt: "2026-08-01T00:00:02Z",
    durationMs: 1000,
  };
}

test("STANDARD edition cannot enable BYOK even when the raw flag is true", () => {
  const snapshot = projectCommercialAuthorization(
    authorization("STANDARD", true),
  );

  assert.equal(snapshot.capabilities.allowsCloudModels, true);
  assert.equal(snapshot.capabilities.allowsCustomModels, false);
});

test("authorization projection maps current Gateway fields without aliases", () => {
  const snapshot = projectCommercialAuthorization(
    authorization("PROFESSIONAL", true),
  );

  assert.equal(snapshot.license.validUntil, "2027-01-02T03:04:05Z");
  assert.equal(
    snapshot.activation?.lastHeartbeatAt,
    "2026-08-07T10:20:30Z",
  );
});

test("validated Bootstrap wire is projected without parsing model items twice", () => {
  const wire = parseCommercialBootstrapWire({
    softwareAuthorization: null,
    personalQuota: null,
    models: {
      catalogVersion: "catalog-v1",
      items: [
        {
          id: IDS.model,
          code: "cloud-text",
          displayName: "Cloud Text",
          operation: "TEXT",
          capabilityJson: "{}",
          parameterSchemaJson: "{}",
          unitsPerCall: 10,
          clientVisible: true,
          status: "ACTIVE",
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-02T00:00:00Z",
          isDefault: true,
        },
      ],
    },
    release: null,
    warnings: [],
  });

  const projected = projectCommercialBootstrap(wire);

  assert.equal(projected.models.items[0].id, IDS.model);
  assert.equal(projected.models.items[0].code, "cloud-text");
  assert.equal("createdAt" in projected.models.items[0], false);
  assert.equal("updatedAt" in projected.models.items[0], false);
});

test("release projection accepts the canonical empty version when no update is available", () => {
  const projected = projectCommercialRelease({
    available: false,
    required: false,
    reason: "already up to date",
    version: {
      id: "",
      version: "",
      notes: "",
      pubDate: "",
      minimumSupportedVersion: "",
      status: "",
      createdAt: "",
      publishedAt: "",
      artifacts: [],
    },
  });

  assert.equal(projected.available, false);
  assert.equal(projected.version.id, "");
  assert.deepEqual(projected.version.artifacts, []);
});

test("release artifact selection picks the UUID matching platform and arch", () => {
  const projected = selectReleaseArtifactId(
    release([
      releaseArtifact(IDS.artifactAlt, "windows", "arm64", "nsis"),
      releaseArtifact(IDS.artifact, "windows", "x86_64", "nsis"),
    ]),
    "windows",
    "x86_64",
  );

  assert.equal(projected.artifactId, IDS.artifact);
});

test("release artifact selection returns null when no artifact matches", () => {
  const projected = selectReleaseArtifactId(
    release([releaseArtifact(IDS.artifact, "windows", "arm64", "nsis")]),
    "macos",
    "arm64",
  );

  assert.equal(projected.artifactId, null);
});

test("release artifact selection prefers the macOS updater ZIP", () => {
  const projected = selectReleaseArtifactId(
    release([
      releaseArtifact(IDS.artifact, "macos", "arm64", "zip"),
      releaseArtifact(IDS.artifactAlt, "macos", "arm64", "dmg"),
    ]),
    "macos",
    "arm64",
  );

  assert.equal(projected.artifactId, IDS.artifact);
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

test("invocation projections retain the approved settled quota fields", () => {
  const item = invocation();
  const list = projectCommercialInvocationList({ items: [item], total: 1 });
  const details = projectCommercialInvocationDetails({ invocation: item });

  assert.deepEqual(list.items[0], item);
  assert.deepEqual(details.invocation, item);
  assert.equal(Object.hasOwn(list, "page"), false);
  assert.equal(Object.hasOwn(item, "requestId"), false);
});

test("invocation key state requires JSON null before invocation creation", () => {
  const pending = {
    operation: "IMAGE",
    idempotencyKey: "image-request-key",
    cancellationRequested: true,
    cancellationReason: "user cancelled",
    cancellationRequestedAt: "2026-09-02T00:00:00Z",
    invocationCreated: false,
    invocation: null,
  };

  assert.equal(projectCommercialInvocationKeyState(pending).invocation, null);
  assert.throws(
    () =>
      projectCommercialInvocationKeyState({
        ...pending,
        invocation: {},
      }),
    /must be null before invocation creation/,
  );
});

test("strict client projections reject missing and extra response fields", () => {
  const quota = {
    account: {
      id: IDS.license,
      subjectType: "USER",
      subjectId: 42,
      status: "ACTIVE",
      availableUnits: 10,
      reservedUnits: 0,
      version: 1,
    },
    buckets: [],
    spendableUnits: 10,
  };

  assert.throws(
    () => projectCommercialQuota({ ...quota, username: "not-approved" }),
    /fields must be exactly/,
  );
  const { spendableUnits: _removed, ...missing } = quota;
  assert.throws(() => projectCommercialQuota(missing), /fields must be exactly/);
  assert.throws(
    () =>
      projectCommercialAuthorization({
        ...authorization("STANDARD", false),
        license: {
          ...authorization("STANDARD", false).license,
          id: 1,
        },
      }),
    /UUID string/,
  );
});
