// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { patchBeatQueryCache } from "@/modules/production/application/beat-query-cache";
import { StalePoolSelectError } from "@/modules/production/application/image-pool-errors";
import type {
  ImagePoolResponse,
  ProductionVideoGateway,
} from "@/modules/production/application/ports";
import type {
  BeatImageType,
  PoolImage,
} from "@/modules/production/domain/image-pool";

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

  function usePoolSelect(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({
        beatNum,
        poolId,
        force,
      }: {
        beatNum: number;
        poolId: string;
        force?: boolean;
      }) => {
        const response = await gateway.selectImagePoolEntry(
          project,
          episode,
          beatNum,
          poolId,
          force ?? false,
        );
        if (!response.ok) {
          const message = response.error ?? "选择失败";
          if (response.stale) throw new StalePoolSelectError(message);
          throw new Error(message);
        }
        return response;
      },
      onSuccess: (response, { beatNum, poolId }) => {
        const selected = response.data;
        if (selected?.frameUrl) {
          queryClient.setQueryData<ImagePoolResponse>(
            queryKeys.grids(project, episode),
            (old) => {
              if (!old?.data) return old;
              return {
                ...old,
                data: {
                  ...old.data,
                  beat_assignments: {
                    ...old.data.beat_assignments,
                    [String(beatNum)]: poolId,
                  },
                },
              };
            },
          );
          patchBeatQueryCache(queryClient, project, episode, beatNum, {
            frame_url: selected.frameUrl,
          });
        }
        if (selected?.sketchUrl) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.sketchCropSource(project, episode, beatNum),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.sketchPoseEditor(project, episode, beatNum),
          });
          patchBeatQueryCache(queryClient, project, episode, beatNum, {
            sketch_url: selected.sketchUrl,
          });
        }
      },
    });
  }

  function usePoolDelete(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({ poolId }: { poolId: string }) => {
        const response = await gateway.deleteImagePoolEntry(
          project,
          episode,
          poolId,
        );
        if (!response.ok) throw new Error(response.error || "删除失败");
        return response;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.grids(project, episode),
        });
      },
    });
  }

  function useUploadBeatImage(
    project: string,
    episode: number,
    imageType: BeatImageType,
  ) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ beatNum, file }: { beatNum: number; file: File }) =>
        gateway.uploadBeatImage(
          project,
          episode,
          beatNum,
          imageType,
          file,
        ),
      onSuccess: (response) => {
        if (!response.ok) return;
        queryClient.invalidateQueries({
          queryKey: queryKeys.grids(project, episode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.beats(project, episode),
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

  return {
    useGrids,
    useGridsByBeat,
    usePoolDelete,
    usePoolSelect,
    useRebuildPoolIndex,
    useUploadBeatImage,
  };
}
