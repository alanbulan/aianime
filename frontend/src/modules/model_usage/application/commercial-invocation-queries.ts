import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type {
  CommercialInvocationGateway,
  CommercialInvocationQuery,
} from "@/modules/model_usage/application/commercial-invocation-ports";
import type { CommercialInvocationId } from "@/modules/model_usage/domain/commercial-invocation";

export function createCommercialInvocationQueries(
  gateway: CommercialInvocationGateway,
) {
  function useCommercialInvocations(
    query: CommercialInvocationQuery,
    enabled = true,
  ) {
    const normalized = {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status?.trim().toUpperCase() ?? "",
      operation: query.operation?.trim().toUpperCase() ?? "",
    };
    return useQuery({
      queryKey: queryKeys.commercialInvocations(normalized),
      queryFn: () =>
        gateway.list({
          page: normalized.page,
          pageSize: normalized.pageSize,
          ...(normalized.status ? { status: normalized.status } : {}),
          ...(normalized.operation ? { operation: normalized.operation } : {}),
        }),
      enabled,
    });
  }

  function useCommercialInvocationDetails(
    id: CommercialInvocationId | null,
    enabled = true,
  ) {
    const normalizedId = id === null ? "" : String(id);
    return useQuery({
      queryKey: queryKeys.commercialInvocation(normalizedId),
      queryFn: () => gateway.details(id as CommercialInvocationId),
      enabled: enabled && id !== null,
    });
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
          queryKey: ["commercial", "invocations"],
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
