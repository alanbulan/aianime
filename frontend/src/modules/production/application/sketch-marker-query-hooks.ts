// Copyright (c) 2026 AI anime
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";

export function createSketchMarkerQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useAssignColors(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.assignSketchColors(project, episode),
      onSuccess: (response) => {
        if (!response.ok) return;
        queryClient.invalidateQueries({
          queryKey: queryKeys.beats(project, episode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.grids(project, episode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.script(project, episode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.episodeDetail(project, episode),
        });
      },
    });
  }

  function useDetectIdentities(project: string, episode: number) {
    return useMutation({
      mutationFn: () => gateway.detectSketchIdentities(project, episode),
    });
  }

  return { useAssignColors, useDetectIdentities };
}
