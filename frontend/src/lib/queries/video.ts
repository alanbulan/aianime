// Copyright (c) 2026 AI anime
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/transport";
import { p } from "@/shared/api/path";
import { queryKeys } from "@/lib/query-keys";
import type { OkResponse, TaskResponse } from "@/types/api";

export function useComposeEpisode(project: string, episode: number) {
  return useMutation({
    mutationFn: (params: {
      add_subtitles?: boolean;
      add_bgm?: boolean;
      resolution?: string;
    }) =>
      api
        .post(p`api/v1/projects/${project}/episodes/${episode}/videos/compose`, {
          json: params,
        })
        .json<TaskResponse>(),
  });
}

export interface FinalVideoData {
  exists: boolean;
  filename: string;
  video_url?: string;
}

// Hydrates the compose page on mount so a previously-composed episode shows
// the preview + download without requiring a fresh SSE event.
export function useFinalVideo(project: string, episode: number) {
  return useQuery({
    queryKey: queryKeys.finalVideo(project, episode),
    queryFn: ({ signal }) =>
      api
        .get(p`api/v1/projects/${project}/episodes/${episode}/final`, { signal })
        .json<OkResponse<FinalVideoData>>(),
    enabled: !!project && episode > 0,
  });
}
