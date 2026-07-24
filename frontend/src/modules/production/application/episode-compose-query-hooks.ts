// Copyright (c) 2026 AI anime
import { useMutation, useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type { ComposeEpisodeCommand } from "@/modules/production/domain/episode-compose";

export function createEpisodeComposeQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useComposeEpisode(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: ComposeEpisodeCommand) =>
        gateway.composeEpisode(project, episode, command),
    });
  }

  function useFinalVideo(project: string, episode: number) {
    return useQuery({
      queryKey: queryKeys.finalVideo(project, episode),
      queryFn: ({ signal }) => gateway.getFinalVideo(project, episode, signal),
      enabled: !!project && episode > 0,
    });
  }

  return { useComposeEpisode, useFinalVideo };
}
