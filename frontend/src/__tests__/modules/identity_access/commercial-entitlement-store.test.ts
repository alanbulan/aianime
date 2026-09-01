import { describe, expect, it, vi } from "vitest";

import type { CommercialEntitlementGateway } from "@/modules/identity_access/application/commercial-entitlement-ports";
import { createCommercialEntitlementStore } from "@/modules/identity_access/application/commercial-entitlement-store";
import type { CommercialEntitlement } from "@/modules/identity_access/domain/commercial-entitlement";

const deactivatedEntitlement: CommercialEntitlement = {
  license: {
    id: "11111111-1111-4111-8111-111111111111",
    versionCode: "standard-2026",
    versionName: "Standard",
    editionType: "STANDARD",
    allowsCustomModels: false,
    status: "ACTIVE",
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: "2027-01-01T00:00:00Z",
    maxDevices: 1,
    activeDevices: 0,
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
