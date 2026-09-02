import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";

import { queryKeys } from "@/lib/query-keys";
import type {
  CommercialInvocationGateway,
  CommercialInvocationQuery,
} from "@/modules/model_usage/application/commercial-invocation-ports";
import {
  shouldRefreshCommercialInvocation,
  type CommercialInvocationId,
} from "@/modules/model_usage/domain/commercial-invocation";

const INVOCATION_REFRESH_INTERVAL_MS = 5000;

export function createCommercialInvocationQueries(
  gateway: CommercialInvocationGateway,
) {
  function useCommercialInvocations(
    query: CommercialInvocationQuery,
    enabled = true,
  ) {
    const queryClient = useQueryClient();
    const normalized = {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status?.trim().toUpperCase() ?? "",
      operation: query.operation?.trim().toUpperCase() ?? "",
    };
    const result = useQuery({
      queryKey: queryKeys.commercialInvocations(normalized),
      queryFn: () =>
        gateway.list({
          page: normalized.page,
          pageSize: normalized.pageSize,
          ...(normalized.status ? { status: normalized.status } : {}),
          ...(normalized.operation ? { operation: normalized.operation } : {}),
        }),
      enabled,
      refetchInterval: INVOCATION_REFRESH_INTERVAL_MS,
      refetchOnWindowFocus: "always",
    });
    useEffect(() => {
      if (enabled && result.data) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.commercialQuota() });
      }
    }, [enabled, result.data, queryClient]);
    return result;
  }

  function useCommercialInvocationDetails(
    id: CommercialInvocationId | null,
    enabled = true,
  ) {
    const queryClient = useQueryClient();
    const normalizedId = id === null ? "" : String(id);
    const result = useQuery({
      queryKey: queryKeys.commercialInvocation(normalizedId),
      queryFn: () => gateway.details(id as CommercialInvocationId),
      enabled: enabled && id !== null,
      refetchInterval: (query) =>
        query.state.data && shouldRefreshCommercialInvocation(query.state.data)
          ? INVOCATION_REFRESH_INTERVAL_MS
          : false,
      refetchOnWindowFocus: "always",
    });
    useEffect(() => {
      if (enabled && id !== null && result.data) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.commercialQuota() });
      }
    }, [enabled, id, result.data, queryClient]);
    return result;
  }

  function useCancelCommercialInvocation() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        id,
        reason,
      }: {
        id: CommercialInvocationId;
        reason: string;
      }) => gateway.cancel(id, reason),
      onSuccess: (invocation) => {
        queryClient.setQueryData(
          queryKeys.commercialInvocation(String(invocation.id)),
          invocation,
        );
        void queryClient.invalidateQueries({
          queryKey: queryKeys.commercialInvocations(),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.commercialQuota(),
        });
      },
    });
  }

  function useSaveCommercialInvocationResult() {
    return useMutation({
      mutationFn: (id: CommercialInvocationId) => gateway.saveResult(id),
    });
  }

  return {
    useCancelCommercialInvocation,
    useCommercialInvocationDetails,
    useCommercialInvocations,
    useSaveCommercialInvocationResult,
  };
}
