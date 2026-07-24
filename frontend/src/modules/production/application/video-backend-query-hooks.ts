// Copyright (c) 2026 AI anime
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";

export function createVideoBackendQueryHooks(gateway: ProductionVideoGateway) {
  function useVideoBackends(project: string) {
    return useQuery({
      queryKey: queryKeys.videoBackends(project),
      queryFn: ({ signal }) =>
        gateway.listVideoBackends(project, signal),
      enabled: !!project,
    });
  }

  return { useVideoBackends };
}
