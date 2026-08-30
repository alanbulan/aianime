// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCommercialModelAccessQueries } from "@/modules/model_usage/application/commercial-model-access-queries";
import type { CommercialModelCatalog } from "@/modules/model_usage/domain/commercial-model-access";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("commercial model catalog cache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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
    expect(fetchCatalog).toHaveBeenNthCalledWith(1, "TEXT", "active", undefined);
    expect(fetchCatalog).toHaveBeenNthCalledWith(2, "TEXT", "cloud", undefined);
  });

  it("revalidates stale metadata with catalogVersion and reuses unchanged data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T00:00:00Z"));
    const firstCatalog = {
      catalogVersion: "text-v1",
      items: [{
        id: "text-1",
        code: "QWEN3_8_27B",
        displayName: "Qwen3.8-27B",
        operation: "TEXT",
        capabilities: {},
        parameterSchema: {},
      }],
    };
    const fetchCatalog = vi.fn()
      .mockResolvedValueOnce(firstCatalog)
      .mockResolvedValueOnce({ ...firstCatalog, items: [] });
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

    const initial = await queries.loadCommercialModelCatalog("TEXT");
    vi.advanceTimersByTime(60_001);
    const refreshed = await queries.loadCommercialModelCatalog("TEXT");

    expect(fetchCatalog).toHaveBeenLastCalledWith("TEXT", "active", "text-v1");
    expect(refreshed).toBe(initial);
  });

  it("clears an old schema without allowing an in-flight response to restore it", async () => {
    const stale = deferred<CommercialModelCatalog>();
    const fresh = deferred<CommercialModelCatalog>();
    const fetchCatalog = vi.fn()
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => fresh.promise);
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
    const staleCatalog: CommercialModelCatalog = {
      catalogVersion: "text-v1",
      items: [],
    };
    const freshCatalog: CommercialModelCatalog = {
      catalogVersion: "text-v2",
      items: [{
        id: "text-1",
        code: "QWEN3_8_27B",
        displayName: "Qwen3.8-27B",
        operation: "TEXT",
        capabilities: {},
        parameterSchema: {
          type: "object",
          properties: {
            reasoning_effort: {
              type: "string",
              enum: ["none", "low", "medium", "high"],
              default: "low",
            },
          },
        },
      }],
    };

    const staleLoad = queries.loadCommercialModelCatalog("TEXT");
    queries.clearCommercialModelCatalogCache();
    const freshLoad = queries.loadCommercialModelCatalog("TEXT");
    stale.resolve(staleCatalog);
    await staleLoad;
    const deduplicatedFreshLoad = queries.loadCommercialModelCatalog("TEXT");

    expect(fetchCatalog).toHaveBeenCalledTimes(2);
    expect(fetchCatalog).toHaveBeenNthCalledWith(2, "TEXT", "active", undefined);

    fresh.resolve(freshCatalog);
    await expect(freshLoad).resolves.toBe(freshCatalog);
    await expect(deduplicatedFreshLoad).resolves.toBe(freshCatalog);
    await expect(queries.loadCommercialModelCatalog("TEXT")).resolves.toBe(freshCatalog);
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });
});
