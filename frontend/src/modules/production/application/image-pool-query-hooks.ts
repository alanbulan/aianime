// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type { PoolImage } from "@/modules/production/domain/image-pool";

export function createImagePoolQueryHooks(gateway: ProductionVideoGateway) {
  function useGrids(project: string, episode: number) {
    return useQuery({
      queryKey: queryKeys.grids(project, episode),
      queryFn: ({ signal }) => gateway.getImagePool(project, episode, signal),
      enabled: !!project && episode > 0,
    });
  }

  function useRebuildPoolIndex(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.rebuildImagePoolIndex(project, episode),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.grids(project, episode),
        });
      },
    });
  }

  function useGridsByBeat(project: string, episode: number) {
    const { data: response } = useGrids(project, episode);
    const data = response?.data;
    return useMemo(() => {
      const images = data?.images ?? [];
      const assignments = data?.beat_assignments ?? {};
      const byBeat = new Map<number, PoolImage[]>();
      for (const image of images) {
        let items = byBeat.get(image.original_beat);
        if (!items) {
          items = [];
          byBeat.set(image.original_beat, items);
        }
        items.push(image);
      }
      return { byBeat, assignments };
    }, [data]);
  }

  return { useGrids, useGridsByBeat, useRebuildPoolIndex };
}
