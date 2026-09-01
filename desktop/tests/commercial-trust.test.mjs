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
    "5ef507de9f66914ec882f205dc82986c99e98fd3c0a823acd2b1b171e9745b6f",
  );
});
