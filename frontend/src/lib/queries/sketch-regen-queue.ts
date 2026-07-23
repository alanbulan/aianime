// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/shared/api/transport";
import { p } from "@/shared/api/path";
import { queryKeys } from "@/lib/query-keys";
import type { OkResponse } from "@/types/api";

export interface SketchRegenQueueItem {
  id: string;
  modeKey: string;
  modeLabel: string;
  beatNumbers: number[];
  sceneIds: string[];
  createdAt: string;
  taskScope?: string;
}

export interface SketchRegenQueueData {
  items: SketchRegenQueueItem[];
}

export function useSketchRegenQueue(project: string, episode: number) {
  return useQuery({
    queryKey: queryKeys.sketchRegenQueue(project, episode),
    queryFn: ({ signal }) =>
      api
        .get(p`api/v1/projects/${project}/episodes/${episode}/sketch-regen-queue`, {
          signal,
        })
        .json<OkResponse<SketchRegenQueueData>>(),
    enabled: !!project && episode > 0,
  });
}

export function useSaveSketchRegenQueue(project: string, episode: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: SketchRegenQueueItem[]) =>
      api
        .put(p`api/v1/projects/${project}/episodes/${episode}/sketch-regen-queue`, {
          json: { items },
        })
        .json<OkResponse<SketchRegenQueueData>>(),
    onSuccess: (res) => {
      if (!res.ok) return;
      qc.setQueryData<OkResponse<SketchRegenQueueData>>(
        queryKeys.sketchRegenQueue(project, episode),
        res,
      );
    },
  });
}
