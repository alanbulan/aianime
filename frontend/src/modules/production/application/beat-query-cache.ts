// Copyright (c) 2026 AI anime
import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { Beat } from "@/modules/narrative_planning/public";
import type { ProductionDataResponse } from "@/modules/production/application/ports";

export function patchBeatQueryCache(
  queryClient: QueryClient,
  project: string,
  episode: number,
  beatNumber: number,
  patch: Partial<Beat>,
) {
  queryClient.setQueryData<ProductionDataResponse<Beat[]>>(
    queryKeys.beats(project, episode),
    (old) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: old.data.map((beat) =>
          beat.beat_number === beatNumber ? { ...beat, ...patch } : beat,
        ),
      };
    },
  );
}
