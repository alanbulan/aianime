import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { CommercialAnnouncementGateway } from "@/modules/platform_release/application/commercial-announcement-ports";

export function createCommercialAnnouncementQueries(
  gateway: CommercialAnnouncementGateway,
) {
  function useCommercialAnnouncements(enabled = true, limit = 20) {
    return useQuery({
      queryKey: queryKeys.commercialAnnouncements(limit),
      queryFn: () => gateway.fetch(limit),
      enabled,
      staleTime: 5 * 60_000,
    });
  }

  return { useCommercialAnnouncements };
}
