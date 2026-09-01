import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensureCommercialBootstrap,
} from "@/app/commercial-access";
import { queryClient } from "@/app/query-client";
import { queryKeys } from "@/lib/query-keys";
import { useCommercialEntitlementStore } from "@/modules/identity_access/public";
import {
  loadCommercialModelCatalog,
  type CommercialModelCatalog,
  type CommercialQuota,
} from "@/modules/model_usage/public";
import type { CommercialReleaseStatus } from "@/modules/platform_release/public";

const bootstrapPayload = {
  softwareAuthorization: {
    license: {
      id: "11111111-1111-4111-8111-111111111111",
      versionCode: "professional-2026",
      versionName: "Professional",
      editionType: "PROFESSIONAL",
      allowsCustomModels: true,
      status: "ACTIVE",
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2027-01-01T00:00:00Z",
      maxDevices: 3,
      activeDevices: 1,
    },
    device: {
      id: "22222222-2222-4222-8222-222222222222",
      publicKeyHash: "device-hash",
      name: "Desktop",
      platform: "windows",
      arch: "x86_64",
      clientVersion: "1.1.62",
      status: "ACTIVE",
      createdAt: "2026-08-01T00:00:00Z",
      lastSeenAt: "2026-08-01T01:00:00Z",
    },
    activation: {
      id: "33333333-3333-4333-8333-333333333333",
      licenseId: "11111111-1111-4111-8111-111111111111",
      deviceId: "22222222-2222-4222-8222-222222222222",
      status: "ACTIVE",
      activatedAt: "2026-08-01T00:00:00Z",
      lastHeartbeatAt: "2026-08-01T01:00:00Z",
      endedAt: "",
      endReason: "",
    },
    lease: null,
    capabilities: {
      editionType: "PROFESSIONAL",
      deviceActivated: true,
      allowsCloudModels: true,
      allowsCustomModels: true,
    },
  },
  personalQuota: {
    account: {
      id: "44444444-4444-4444-8444-444444444444",
      subjectType: "USER",
      subjectId: 1001,
      status: "ACTIVE",
      availableUnits: 75,
      reservedUnits: 2,
      version: 1,
    },
    buckets: [],
    spendableUnits: 73,
  },
  models: {
    catalogVersion: "catalog-1",
    items: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        code: "cloud/text-standard",
        displayName: "Text Standard",
        operation: "TEXT",
        capabilityJson: "{}",
        parameterSchemaJson: "{}",
        unitsPerCall: 1,
        clientVisible: true,
        status: "ACTIVE",
        isDefault: true,
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        code: "cloud/image-standard",
        displayName: "Image Standard",
        operation: "IMAGE",
        capabilityJson: "{}",
        parameterSchemaJson: "{}",
        unitsPerCall: 2,
        clientVisible: true,
        status: "ACTIVE",
        isDefault: true,
      },
    ],
  },
  release: {
    available: true,
    required: false,
    version: {
      id: "77777777-7777-4777-8777-777777777777",
      version: "1.1.6",
      notes: "Release notes",
      pubDate: "2026-08-02T00:00:00Z",
      minimumSupportedVersion: "1.1.5",
      status: "PUBLISHED",
      createdAt: "2026-08-01T00:00:00Z",
      publishedAt: "2026-08-02T00:00:00Z",
      artifacts: [],
    },
    reason: "new-version",
  },
  warnings: [],
};

describe("commercial application bootstrap", () => {
  beforeEach(() => {
    queryClient.clear();
    useCommercialEntitlementStore.getState().reset();
  });

  it("single-flights Bootstrap and projects each bounded-context cache", async () => {
    const bootstrap = vi.fn(async () => bootstrapPayload);
    const modelCatalog = vi.fn(async () => {
      throw new Error("Bootstrap cache was not used");
    });
    window.aiAnimeDesktop = {
      commercial: {
        bootstrap,
        modelCatalog,
      },
    } as unknown as AIAnimeDesktopBridge;

    const [first, second] = await Promise.all([
      ensureCommercialBootstrap(),
      ensureCommercialBootstrap(),
    ]);

    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(bootstrap).toHaveBeenCalledWith({ modelOperation: "TEXT" });
    expect(first).toEqual(second);
    expect(useCommercialEntitlementStore.getState()).toMatchObject({
      status: "ready",
      entitlement: {
        license: { editionType: "PROFESSIONAL" },
        capabilities: { allowsCustomModels: true },
      },
    });
    expect(
      queryClient.getQueryData<CommercialQuota>(queryKeys.commercialQuota()),
    ).toMatchObject({ spendableUnits: 73 });
    expect(
      queryClient.getQueryData<CommercialModelCatalog>(
        queryKeys.commercialModels("TEXT"),
      ),
    ).toMatchObject({
      catalogVersion: "catalog-1",
      items: [{ code: "cloud/text-standard", operation: "TEXT" }],
    });
    expect(
      queryClient.getQueryData<CommercialReleaseStatus>(
        queryKeys.commercialRelease(),
      ),
    ).toEqual({
      available: true,
      required: false,
      reason: "new-version",
      artifactId: null,
    });

    await expect(loadCommercialModelCatalog("TEXT")).resolves.toMatchObject({
      items: [{ code: "cloud/text-standard" }],
    });
    expect(modelCatalog).not.toHaveBeenCalled();
  });
});
