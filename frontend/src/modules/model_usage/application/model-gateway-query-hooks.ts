import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ModelGatewayGateway } from "@/modules/model_usage/application/model-gateway-ports";

export function createModelGatewayQueries(gateway: ModelGatewayGateway) {
  function useModelGatewayConfig(enabled = true) {
    return useQuery({
      queryKey: queryKeys.modelGateway(),
      queryFn: ({ signal }) => gateway.fetchConfig(signal),
      enabled,
    });
  }

  return { useModelGatewayConfig };
}
