import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import test from "node:test";

import { COMMERCIAL_LEASE_SIGNING_KEYS } from "../src/commercial-trust.ts";

test("production offline lease trust root stays parseable and pinned", () => {
  assert.deepEqual(Object.keys(COMMERCIAL_LEASE_SIGNING_KEYS), [
    "lease-2026-08-v1",
  ]);
  const publicKey = createPublicKey(
    COMMERCIAL_LEASE_SIGNING_KEYS["lease-2026-08-v1"],
  );
  assert.equal(publicKey.asymmetricKeyType, "ed25519");
  const fingerprint = createHash("sha256")
    .update(publicKey.export({ type: "spki", format: "der" }))
    .digest("hex");
  assert.equal(
    fingerprint,
    "f2a6404d48738c0a2294f634e4d1d90569f5fd61983fbf4d7e26b330f631f9f0",
  );
});
