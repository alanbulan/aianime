import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";

import { projectCommercialQuota, projectCommercialModelCatalog } from "../src/commercial-contracts.ts";
import { mergeModelCatalogs, mergeModelCapabilities } from "../src/commercial-ipc-support.ts";
import { sidecarModelCapability } from "../src/backend-model-capability.ts";
import { parseCommercialModelCatalog, parseCommercialModelUsageBootstrap } from "../../frontend/src/modules/model_usage/domain/commercial-model-access.ts";

test("live cloud quota and models traverse both desktop parsers and preserve pricing authority", {
  skip: !process.env.AI_ANIME_CURRENT_CLOUD_CONTRACT,
}, () => {
  const raw = JSON.parse(readFileSync(process.env.AI_ANIME_CURRENT_CLOUD_CONTRACT, "utf8"));
  const personalQuota = projectCommercialQuota(raw.quota);
  const cloud = projectCommercialModelCatalog(raw.catalog);
  const models = mergeModelCatalogs(cloud);
  const ipc = structuredClone({ personalQuota, models, softwareAuthorization: null, release: null, warnings: [] });
  const result = parseCommercialModelUsageBootstrap(ipc);
  assert.equal(result.quota.assetVersion, "MICRO_POINT_V1");
  assert.equal(result.quota.refundFrozenUnits, raw.quota.account.refundFrozenUnits);
  assert.equal(result.quota.spendableUnits, raw.quota.spendableUnits);
  assert.deepEqual(result.catalog, parseCommercialModelCatalog(models));
  assert(result.catalog.items.length > 0);

  const capabilities = new Map();
  mergeModelCapabilities(cloud, capabilities);
  for (const item of result.catalog.items) {
    assert.equal(item.billingVersion, "METERED_V2");
    assert.equal(item.quoteRequired, true);
    assert(!("unitsPerCall" in item));
  }
  const sidecar = { allowsCustomModels: false, mode: "mixed", modelCapabilities: [...capabilities.values()].map(sidecarModelCapability) };
  for (const item of sidecar.modelCapabilities) {
    assert(!("billingVersion" in item));
    assert(!("pricingAvailable" in item));
  }
  if (process.env.AI_ANIME_SIDECAR_CONTRACT_FILE) {
    assert(process.env.AI_ANIME_SIDECAR_CONTRACT_FILE.startsWith("/tmp/aianime-"));
    writeFileSync(process.env.AI_ANIME_SIDECAR_CONTRACT_FILE, JSON.stringify(sidecar), { mode: 0o600 });
  }
  if (process.env.AI_ANIME_RENDERER_CONTRACT_FILE) {
    assert(process.env.AI_ANIME_RENDERER_CONTRACT_FILE.startsWith("/tmp/aianime-"));
    writeFileSync(process.env.AI_ANIME_RENDERER_CONTRACT_FILE, JSON.stringify(ipc), { mode: 0o600 });
  }
  console.log(`LIVE_BOOTSTRAP_ROUNDTRIP models=${result.catalog.items.length} currentAsset=true quotaAndFrozenPreserved=true generationRequests=0`);
});
