// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import { createCommercialModelAccessQueries } from "@/modules/model_usage/application/commercial-model-access-queries";

describe("commercial model catalog cache", () => {
  it("keeps active and cloud catalogs in separate cache entries", async () => {
    const fetchCatalog = vi.fn(async (_operation?: string, source = "active") => ({
      catalogVersion: `${source}-v1`,
      items: [],
    }));
    const queries = createCommercialModelAccessQueries({
      fetchCatalog,
      fetchQuota: vi.fn(),
      fetchModelDetails: vi.fn(),
      fetchAccessStatus: vi.fn(),
      configureByok: vi.fn(),
      selectCloud: vi.fn(),
      clearByok: vi.fn(),
      fetchByokProviderModels: vi.fn(),
    });

    await expect(queries.loadCommercialModelCatalog("TEXT", "active")).resolves.toMatchObject({
      catalogVersion: "active-v1",
    });
    await expect(queries.loadCommercialModelCatalog("TEXT", "cloud")).resolves.toMatchObject({
      catalogVersion: "cloud-v1",
    });
    await queries.loadCommercialModelCatalog("TEXT", "active");

    expect(fetchCatalog).toHaveBeenCalledTimes(2);
    expect(fetchCatalog).toHaveBeenNthCalledWith(1, "TEXT", "active");
    expect(fetchCatalog).toHaveBeenNthCalledWith(2, "TEXT", "cloud");
  });
});
