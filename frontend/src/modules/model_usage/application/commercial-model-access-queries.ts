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

  function cacheCatalog(operation: string, catalog: CommercialModelCatalog) {
    catalogCache.set(operation, { catalog, updatedAt: Date.now() });
  }

  async function loadCommercialModelCatalog(operation?: string) {
    const normalizedOperation = normalizeOperation(operation);
    const cached = catalogCache.get(normalizedOperation);
    if (cached && Date.now() - cached.updatedAt < CATALOG_STALE_TIME_MS) {
      return cached.catalog;
    }
    const active = catalogRequests.get(normalizedOperation);
    if (active) return active;
    const request = gateway
      .fetchCatalog(normalizedOperation || undefined)
      .then((catalog) => {
        cacheCatalog(normalizedOperation, catalog);
        return catalog;
      });
    catalogRequests.set(normalizedOperation, request);
    try {
      return await request;
    } finally {
      catalogRequests.delete(normalizedOperation);
    }
  }

  function seedCommercialBootstrap(queryClient: QueryClient, value: unknown) {
    const bootstrap = parseCommercialModelUsageBootstrap(value);
    clearCommercialModelCatalogCache();
    if (bootstrap.quota) {
      queryClient.setQueryData(queryKeys.commercialQuota(), bootstrap.quota);
    }
    if (!bootstrap.catalog) return bootstrap;

    cacheCatalog("", bootstrap.catalog);
    queryClient.setQueryData(
      queryKeys.commercialModels(""),
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
      cacheCatalog(operation, catalog);
      queryClient.setQueryData(queryKeys.commercialModels(operation), catalog);
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

  function useCommercialModelCatalog(operation?: string, enabled = true) {
    const normalizedOperation = normalizeOperation(operation);
    return useQuery({
      queryKey: queryKeys.commercialModels(normalizedOperation),
      queryFn: () => loadCommercialModelCatalog(normalizedOperation || undefined),
      enabled,
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
      mutationFn: () => gateway.selectCloud(),
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
    useCommercialQuota,
    useConfigureByok,
    useSelectCloudModels,
  };
}
