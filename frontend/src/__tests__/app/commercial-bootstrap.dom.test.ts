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
      id: "license-1",
      editionType: "PROFESSIONAL",
      allowsCustomModels: true,
    },
    device: { id: "device-1" },
    activation: { id: "activation-1" },
    lease: null,
    capabilities: {
      editionType: "PROFESSIONAL",
      deviceActivated: true,
      allowsCloudModels: true,
      allowsCustomModels: true,
    },
  },
  personalQuota: {
    spendableUnits: 73,
    account: { availableUnits: 75, reservedUnits: 2 },
    buckets: [],
  },
  models: {
    catalogVersion: "catalog-1",
    items: [
      {
        id: "text-1",
        code: "cloud/text-standard",
        displayName: "Text Standard",
        operation: "TEXT",
        capabilityJson: "{}",
        parameterSchemaJson: "{}",
      },
      {
        id: "image-1",
        code: "cloud/image-standard",
        displayName: "Image Standard",
        operation: "IMAGE",
        capabilityJson: "{}",
        parameterSchemaJson: "{}",
      },
    ],
  },
  release: { available: true, required: false, reason: "new-version" },
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
