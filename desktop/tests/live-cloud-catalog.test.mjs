import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { projectCommercialModelCatalog } from "../src/commercial-contracts.ts";
import { mergeModelCapabilities } from "../src/commercial-ipc-support.ts";
import { sidecarModelCapability } from "../src/backend-model-capability.ts";

test("actual authorized cloud catalog projects into Electron and Python without losing billing guards", {
  skip: !process.env.AI_ANIME_PUBLIC_CATALOG_FILE,
}, async () => {
  const raw = JSON.parse(await readFile(process.env.AI_ANIME_PUBLIC_CATALOG_FILE, "utf8"));
  const catalog = projectCommercialModelCatalog(raw);
  assert(catalog.items.length > 0);
  const capabilities = new Map();
  mergeModelCapabilities(catalog, capabilities);
  assert.equal(capabilities.size, catalog.items.length);
  for (const item of catalog.items) {
    assert.equal(item.billingVersion, "METERED_V2");
    assert.equal(item.quoteRequired, true);
    assert(!("unitsPerCall" in item));
    const capability = capabilities.get(item.code);
    assert.equal(capability.billingVersion, item.billingVersion);
    assert.equal(capability.pricingAvailable, item.pricingAvailable);
  }
  const body = { allowsCustomModels: false, mode: "mixed", modelCapabilities: [...capabilities.values()].map(sidecarModelCapability) };
  if (process.env.AI_ANIME_SIDECAR_CONTRACT_FILE) {
    assert(process.env.AI_ANIME_SIDECAR_CONTRACT_FILE.startsWith("/tmp/aianime-"));
    await writeFile(process.env.AI_ANIME_SIDECAR_CONTRACT_FILE, JSON.stringify(body), { mode: 0o600 });
  }
  console.log(`LIVE_CATALOG_CONTRACT models=${catalog.items.length} generationRequests=0`);
});
