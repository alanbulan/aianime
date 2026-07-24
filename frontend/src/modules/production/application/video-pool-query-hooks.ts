// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { patchBeatQueryCache } from "@/modules/production/application/beat-query-cache";
import type {
  ProductionVideoGateway,
  VideoPoolResponse,
} from "@/modules/production/application/ports";

export function createVideoPoolQueryHooks(gateway: ProductionVideoGateway) {
  function useVideoPool(project: string, episode: number) {
    return useQuery({
      queryKey: queryKeys.videoPool(project, episode),
      queryFn: ({ signal }) => gateway.getVideoPool(project, episode, signal),
      enabled: !!project && episode > 0,
    });
  }

  function useVideoPoolSelect(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({
        beatNum,
        poolId,
      }: {
        beatNum: number;
        poolId: string;
      }) => {
        const response = await gateway.selectVideoPoolEntry(
          project,
          episode,
          beatNum,
          poolId,
        );
        if (!response.ok) throw new Error(response.error ?? "切换视频失败");
        return response;
      },
      onSuccess: (response, { beatNum, poolId }) => {
        queryClient.setQueryData<VideoPoolResponse>(
          queryKeys.videoPool(project, episode),
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
        const nextUrl = response.data?.video_url;
        if (!nextUrl) return;
        patchBeatQueryCache(queryClient, project, episode, beatNum, {
          video_url: nextUrl,
        });
      },
    });
  }

  return {
    useVideoPool,
    useVideoPoolSelect,
  };
}
