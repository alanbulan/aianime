// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type {
  SketchRegenQueueData,
  SketchRegenQueueItem,
} from "@/modules/production/domain/sketch-regen-queue";

export function createSketchRegenQueueQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useSketchRegenQueue(project: string, episode: number) {
    return useQuery({
      queryKey: queryKeys.sketchRegenQueue(project, episode),
      queryFn: ({ signal }) =>
        gateway.getSketchRegenQueue(project, episode, signal),
      enabled: !!project && episode > 0,
    });
  }

  function useSaveSketchRegenQueue(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (items: SketchRegenQueueItem[]) =>
        gateway.saveSketchRegenQueue(project, episode, items),
      onSuccess: (response) => {
        if (!response.ok) return;
        queryClient.setQueryData<{ ok: true; data: SketchRegenQueueData }>(
          queryKeys.sketchRegenQueue(project, episode),
          response,
        );
      },
    });
  }

  return { useSketchRegenQueue, useSaveSketchRegenQueue };
}
