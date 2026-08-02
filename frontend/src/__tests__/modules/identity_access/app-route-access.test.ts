import { describe, expect, it, vi } from "vitest";

import {
  createAppRouteAccessResolver,
  type AppRouteAccessDependencies,
} from "@/modules/identity_access/application/app-route-access";
import type { CommercialEntitlement } from "@/modules/identity_access/domain/commercial-entitlement";

const activatedEntitlement: CommercialEntitlement = {
  license: {
    id: "license-1",
    editionType: "STANDARD",
    allowsCustomModels: false,
  },
  device: { id: "device-1" },
  activation: { id: "activation-1" },
  lease: null,
  capabilities: {
    editionType: "STANDARD",
    deviceActivated: true,
    allowsCloudModels: true,
    allowsCustomModels: false,
  },
};

function dependencies(
  overrides: Partial<AppRouteAccessDependencies> = {},
): AppRouteAccessDependencies {
  return {
    initializeCommercialSession: vi.fn(async () => undefined),
    readCommercialSession: vi.fn(() => ({
      configured: false,
      authenticated: false,
    })),
    initializeCommercialEntitlement: vi.fn(async () => activatedEntitlement),
    readLocalUsername: vi.fn(() => null),
    getCurrentLocalUser: vi.fn(async () => null),
    ...overrides,
  };
}

describe("application route access", () => {
  it("keeps the non-commercial runtime on the local workspace session", async () => {
    const input = dependencies({ readLocalUsername: () => "local-user" });

    await expect(createAppRouteAccessResolver(input)()).resolves.toBe("granted");
    expect(input.initializeCommercialEntitlement).not.toHaveBeenCalled();
  });

  it("rejects a configured commercial runtime without a restored session", async () => {
    const input = dependencies({
      readCommercialSession: () => ({ configured: true, authenticated: false }),
    });

    await expect(createAppRouteAccessResolver(input)()).resolves.toBe(
      "unauthenticated",
    );
    expect(input.initializeCommercialEntitlement).not.toHaveBeenCalled();
  });

  it("sends a restored session without an assigned license to license handling", async () => {
    const input = dependencies({
      readCommercialSession: () => ({ configured: true, authenticated: true }),
      initializeCommercialEntitlement: vi.fn(async () => {
        throw new Error("当前账户没有可用的软件许可");
      }),
    });

    await expect(createAppRouteAccessResolver(input)()).resolves.toBe(
      "license-required",
    );
    expect(input.getCurrentLocalUser).not.toHaveBeenCalled();
  });

  it("blocks an assigned license until the current device is activated", async () => {
    const input = dependencies({
      readCommercialSession: () => ({ configured: true, authenticated: true }),
      initializeCommercialEntitlement: async () => ({
        ...activatedEntitlement,
        device: null,
        activation: null,
        capabilities: {
          ...activatedEntitlement.capabilities,
          deviceActivated: false,
          allowsCloudModels: false,
        },
      }),
    });

    await expect(createAppRouteAccessResolver(input)()).resolves.toBe(
      "license-required",
    );
  });

  it("admits a successful commercial login with an active local cookie", async () => {
    const getCurrentLocalUser = vi.fn(async () => null);
    const input = dependencies({
      readCommercialSession: () => ({ configured: true, authenticated: true }),
      readLocalUsername: () => "desktop-user",
      getCurrentLocalUser,
    });

    await expect(createAppRouteAccessResolver(input)()).resolves.toBe("granted");
    expect(getCurrentLocalUser).not.toHaveBeenCalled();
  });

  it("restores the local workspace user after validating the cloud session and license", async () => {
    const input = dependencies({
      readCommercialSession: () => ({ configured: true, authenticated: true }),
      getCurrentLocalUser: async () => ({ username: "desktop-user" }),
    });

    await expect(createAppRouteAccessResolver(input)()).resolves.toBe("granted");
  });
});
