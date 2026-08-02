import assert from "node:assert/strict";
import test from "node:test";

import { projectCommercialAuthorization } from "../src/commercial-contracts.ts";

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
