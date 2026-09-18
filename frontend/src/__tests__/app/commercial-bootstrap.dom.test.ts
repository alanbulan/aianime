import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  ensureCommercialBootstrap,
} from "@/app/commercial-access";
import { queryClient } from "@/app/query-client";
import { queryKeys } from "@/lib/query-keys";
import { useCommercialEntitlementStore } from "@/modules/identity_access/public";
import {
  loadCommercialModelCatalog,
  useCommercialQuota,
  type CommercialModelCatalog,
  type CommercialQuota,
} from "@/modules/model_usage/public";
import type { CommercialReleaseStatus } from "@/modules/platform_release/public";
import currentQuota from "../../../../tests/fixtures/commercial-quota-current.json";

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
  personalQuota: currentQuota,
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
        billingVersion: "METERED_V2",
        pricingMode: "METERED",
        quoteRequired: true,
        minimumClientVersion: "1.1.75",
        pricingDescription: "测试文本积分报价",
        pricingAvailable: true,
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
        billingVersion: "METERED_V2",
        pricingMode: "METERED",
        quoteRequired: true,
        minimumClientVersion: "1.1.75",
        pricingDescription: "测试图片积分报价",
        pricingAvailable: true,
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
    ).toEqual({ spendableUnits: 4750000, availableUnits: 10000000, reservedUnits: 2000000, refundFrozenUnits: 3000000, assetVersion: "MICRO_POINT_V1" });
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

  it("rejects a malformed current balance, then recovers on retry without resetting the license", async () => {
    const broken = structuredClone(bootstrapPayload);
    broken.personalQuota.account.refundFrozenUnits = -1;
    const bootstrap = vi.fn()
      .mockResolvedValueOnce(broken)
      .mockResolvedValueOnce(structuredClone(bootstrapPayload));
    window.aiAnimeDesktop = { commercial: { bootstrap } } as unknown as AIAnimeDesktopBridge;

    await expect(ensureCommercialBootstrap()).rejects.toThrow(/refundFrozenUnits/);
    expect(useCommercialEntitlementStore.getState().status).not.toBe("ready");
    expect(queryClient.getQueryData(queryKeys.commercialQuota())).toBeUndefined();
    await expect(ensureCommercialBootstrap()).resolves.toMatchObject({
      license: { status: "ACTIVE" }, capabilities: { allowsCloudModels: true },
    });
    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(useCommercialEntitlementStore.getState().status).toBe("ready");
    expect(queryClient.getQueryData<CommercialQuota>(queryKeys.commercialQuota())?.refundFrozenUnits).toBe(3000000);
  });

  it("ordinary quota refresh uses the same current contract as startup", async () => {
    const next = structuredClone(currentQuota);
    next.account.refundFrozenUnits = 1000000;
    next.buckets[0].refundFrozenUnits = 1000000;
    next.spendableUnits = 6750000;
    const quotaBalance = vi.fn(async () => next);
    window.aiAnimeDesktop = {
      commercial: { bootstrap: vi.fn(async () => bootstrapPayload), quotaBalance },
    } as unknown as AIAnimeDesktopBridge;
    await ensureCommercialBootstrap();
    const hook = renderHook(() => {
      const { data, error, refetch } = useCommercialQuota();
      return { data, error, refetch };
    }, {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client: queryClient }, children),
    });
    await act(async () => {
      const refreshed = await hook.result.current.refetch();
      expect(refreshed.error).toBeNull();
      expect(refreshed.data?.refundFrozenUnits).toBe(1000000);
    });
    await waitFor(() => expect(hook.result.current.data?.refundFrozenUnits).toBe(1000000));
    expect(hook.result.current.data?.spendableUnits).toBe(6750000);
    expect(hook.result.current.error).toBeNull();
    expect(quotaBalance).toHaveBeenCalled();
    hook.unmount();
  });

  it.skipIf(!process.env.AI_ANIME_RENDERER_CONTRACT_FILE)("boots with actual cloud quota and model data already projected by Electron", async () => {
    const projected = JSON.parse(readFileSync(process.env.AI_ANIME_RENDERER_CONTRACT_FILE!, "utf8"));
    const payload = { ...bootstrapPayload, personalQuota: projected.personalQuota, models: projected.models };
    window.aiAnimeDesktop = { commercial: { bootstrap: vi.fn(async () => payload) } } as unknown as AIAnimeDesktopBridge;
    await expect(ensureCommercialBootstrap()).resolves.toMatchObject({ license: { status: "ACTIVE" } });
    expect(useCommercialEntitlementStore.getState().status).toBe("ready");
    expect(queryClient.getQueryData<CommercialQuota>(queryKeys.commercialQuota())).toMatchObject({
      assetVersion: "MICRO_POINT_V1",
      spendableUnits: projected.personalQuota.spendableUnits,
      refundFrozenUnits: projected.personalQuota.account.refundFrozenUnits,
    });
  });
});
