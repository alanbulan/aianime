// Copyright (c) 2026 AI anime
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import type { PanoViewerManifest } from "@/features/viewer-kit/pano/panoManifest";
import { api } from "@/shared/api/transport";
import { p } from "@/shared/api/path";
import { queryKeys } from "@/lib/query-keys";
import type { ApiResponse, ErrorResponse, TaskResponse } from "@/types/api";

export function useBeatPanoBackgroundManifest(
  project: string,
  episode: number,
  beatNum: number,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.beatPanoBackgroundManifest(project, episode, beatNum),
    queryFn: ({ signal }) =>
      api
        .get(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/pano-background/manifest`,
          { signal },
        )
        .json<ApiResponse<PanoViewerManifest>>(),
    enabled: enabled && !!project && episode > 0 && beatNum > 0,
  });
}

// Mirrors backend response from /sketches/generate-missing-manual:
// scopes / segments are surfaced for diagnostics only (not currently rendered).
export interface GenerateMissingManualResult {
  dispatched: number;
  scopes: string[];
  segments: number[][];
}

export function useGenerateMissingManualSketches(
  project: string,
  episode: number,
) {
  return useMutation({
    mutationFn: () =>
      api
        .post(
          p`api/v1/projects/${project}/episodes/${episode}/sketches/generate-missing-manual`,
          { json: {} },
        )
        .json<
          | (TaskResponse & { data: GenerateMissingManualResult })
          | { ok: false; error: string; data?: GenerateMissingManualResult }
        >(),
  });
}

export function useDirectorControlToSketch(
  project: string,
  episode: number,
  beatNum: number,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api
        .post(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/director-control-to-sketch`,
        )
        .json<
          | (TaskResponse & { data?: unknown })
          | (ErrorResponse & { data?: unknown })
        >(),
    onSuccess: (res) => {
      qc.invalidateQueries({
        queryKey: queryKeys.directorControlFrame(project, episode, beatNum),
      });
      if (!res.ok) return;
      qc.invalidateQueries({ queryKey: queryKeys.grids(project, episode) });
      qc.invalidateQueries({ queryKey: queryKeys.beats(project, episode) });
    },
  });
}
