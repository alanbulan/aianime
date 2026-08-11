import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { CommercialModelAccessGateway } from "@/modules/model_usage/application/commercial-model-access-ports";
import { COMMERCIAL_MODEL_ACCESS_CHANGED_EVENT } from "@/modules/model_usage/application/commercial-model-access-events";
import type { ByokModelAssignment } from "@/modules/model_usage/domain/commercial-model-access";
import {
  parseCommercialModelUsageBootstrap,
  type CommercialModelCatalog,
  type CommercialModelCatalogSource,
} from "@/modules/model_usage/domain/commercial-model-access";

const CATALOG_STALE_TIME_MS = 60_000;

export function createCommercialModelAccessQueries(
  gateway: CommercialModelAccessGateway,
) {
  const catalogCache = new Map<
    string,
    { catalog: CommercialModelCatalog; updatedAt: number }
  >();
  const catalogRequests = new Map<string, Promise<CommercialModelCatalog>>();

  const normalizeOperation = (operation?: string) =>
    operation?.trim().toUpperCase() ?? "";

  function clearCommercialModelCatalogCache() {
    catalogCache.clear();
    catalogRequests.clear();
  }

  const catalogCacheKey = (
    operation: string,
    source: CommercialModelCatalogSource,
  ) => `${source}:${operation}`;

  function cacheCatalog(
    operation: string,
    source: CommercialModelCatalogSource,
    catalog: CommercialModelCatalog,
  ) {
    catalogCache.set(catalogCacheKey(operation, source), {
      catalog,
      updatedAt: Date.now(),
    });
  }

  async function loadCommercialModelCatalog(
    operation?: string,
    source: CommercialModelCatalogSource = "active",
  ) {
    const normalizedOperation = normalizeOperation(operation);
    const key = catalogCacheKey(normalizedOperation, source);
    const cached = catalogCache.get(key);
    if (cached && Date.now() - cached.updatedAt < CATALOG_STALE_TIME_MS) {
      return cached.catalog;
    }
    const active = catalogRequests.get(key);
    if (active) return active;
    const request = gateway
      .fetchCatalog(normalizedOperation || undefined, source)
      .then((catalog) => {
        cacheCatalog(normalizedOperation, source, catalog);
        return catalog;
      });
    catalogRequests.set(key, request);
    try {
      return await request;
    } finally {
      catalogRequests.delete(key);
    }
  }

  function seedCommercialBootstrap(queryClient: QueryClient, value: unknown) {
    const bootstrap = parseCommercialModelUsageBootstrap(value);
    clearCommercialModelCatalogCache();
    if (bootstrap.quota) {
      queryClient.setQueryData(queryKeys.commercialQuota(), bootstrap.quota);
    }
    if (!bootstrap.catalog) return bootstrap;

    cacheCatalog("", "active", bootstrap.catalog);
    queryClient.setQueryData(
      queryKeys.commercialModels("", "active"),
      bootstrap.catalog,
    );
    const operations = new Set(
      bootstrap.catalog.items.map((item) => item.operation.trim().toUpperCase()),
    );
    for (const operation of operations) {
      if (!operation) continue;
      const catalog = {
        ...bootstrap.catalog,
        items: bootstrap.catalog.items.filter(
          (item) => item.operation.trim().toUpperCase() === operation,
        ),
      };
      cacheCatalog(operation, "active", catalog);
      queryClient.setQueryData(
        queryKeys.commercialModels(operation, "active"),
        catalog,
      );
    }
    return bootstrap;
  }

  function publishModelAccessChange(queryClient: ReturnType<typeof useQueryClient>) {
    clearCommercialModelCatalogCache();
    void queryClient.invalidateQueries({
      queryKey: ["commercial", "models"],
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(COMMERCIAL_MODEL_ACCESS_CHANGED_EVENT));
    }
  }

  function useCommercialQuota(enabled = true) {
    return useQuery({
      queryKey: queryKeys.commercialQuota(),
      queryFn: () => gateway.fetchQuota(),
      enabled,
      staleTime: 30_000,
    });
  }

  function useCommercialModelCatalog(
    operation?: string,
    enabled = true,
    source: CommercialModelCatalogSource = "active",
  ) {
    const normalizedOperation = normalizeOperation(operation);
    return useQuery({
      queryKey: queryKeys.commercialModels(normalizedOperation, source),
      queryFn: () =>
        loadCommercialModelCatalog(normalizedOperation || undefined, source),
      enabled,
      staleTime: CATALOG_STALE_TIME_MS,
    });
  }

  function useCommercialModelDetails(sku: string | null, enabled = true) {
    const normalizedSku = sku?.trim() ?? "";
    return useQuery({
      queryKey: queryKeys.commercialModel(normalizedSku),
      queryFn: () => gateway.fetchModelDetails(normalizedSku),
      enabled: enabled && Boolean(normalizedSku),
      staleTime: CATALOG_STALE_TIME_MS,
    });
  }

  function useCommercialModelAccessStatus(enabled = true) {
    return useQuery({
      queryKey: queryKeys.commercialModelAccess(),
      queryFn: () => gateway.fetchAccessStatus(),
      enabled,
    });
  }

  function useConfigureByok() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: {
        baseUrl: string;
        apiKey?: string;
        modelAssignments?: ByokModelAssignment[];
      }) =>
        gateway.configureByok(input),
      onSuccess: (status) => {
        queryClient.setQueryData(queryKeys.commercialModelAccess(), status);
        publishModelAccessChange(queryClient);
      },
    });
  }

  function useSelectCloudModels() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (modelAssignments?: ByokModelAssignment[]) =>
        gateway.selectCloud(modelAssignments),
      onSuccess: (status) => {
        queryClient.setQueryData(queryKeys.commercialModelAccess(), status);
        publishModelAccessChange(queryClient);
      },
    });
  }

  function useClearByok() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.clearByok(),
      onSuccess: (status) => {
        queryClient.setQueryData(queryKeys.commercialModelAccess(), status);
        publishModelAccessChange(queryClient);
      },
    });
  }

  return {
    clearCommercialModelCatalogCache,
    loadCommercialModelCatalog,
    seedCommercialBootstrap,
    useClearByok,
    useCommercialModelAccessStatus,
    useCommercialModelCatalog,
    useCommercialModelDetails,
    useCommercialQuota,
    useConfigureByok,
    useSelectCloudModels,
  };
}
