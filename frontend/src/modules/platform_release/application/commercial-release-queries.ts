import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { CommercialReleaseGateway } from "@/modules/platform_release/application/commercial-release-ports";

export function createCommercialReleaseQueries(gateway: CommercialReleaseGateway) {
  function useCommercialRelease(enabled = true) {
    return useQuery({
      queryKey: queryKeys.commercialRelease(),
      queryFn: () => gateway.check(),
      enabled,
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
      refetchOnWindowFocus: false,
    });
  }

  return { useCommercialRelease };
}
