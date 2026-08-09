import { describe, expect, it, vi } from "vitest";

import type { CommercialEntitlementGateway } from "@/modules/identity_access/application/commercial-entitlement-ports";
import { createCommercialEntitlementStore } from "@/modules/identity_access/application/commercial-entitlement-store";
import type { CommercialEntitlement } from "@/modules/identity_access/domain/commercial-entitlement";

const deactivatedEntitlement: CommercialEntitlement = {
  license: {
    id: "license-1",
    editionType: "STANDARD",
    allowsCustomModels: false,
  },
  device: null,
  activation: null,
  lease: null,
  capabilities: {
    editionType: "STANDARD",
    deviceActivated: false,
    allowsCloudModels: false,
    allowsCustomModels: false,
  },
};

describe("commercial entitlement store", () => {
  it("publishes the refreshed authorization after device deactivation", async () => {
    const deactivateCurrentDevice = vi.fn(async () => deactivatedEntitlement);
    const gateway: CommercialEntitlementGateway = {
      current: vi.fn(),
      activateCurrentDevice: vi.fn(),
      refreshLease: vi.fn(),
      deactivateCurrentDevice,
    };
    const store = createCommercialEntitlementStore(gateway);

    await store.getState().deactivateCurrentDevice("user requested");

    expect(deactivateCurrentDevice).toHaveBeenCalledWith("user requested");
    expect(store.getState()).toMatchObject({
      status: "ready",
      entitlement: deactivatedEntitlement,
      error: null,
    });
  });
});
