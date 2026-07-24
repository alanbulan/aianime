// Copyright (c) 2026 AI anime
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import type { PanoViewerManifest } from "@/features/viewer-kit/pano/panoManifest";
import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";
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

export function useBeatDirectorStageManifest(
  project: string,
  episode: number,
  beatNum: number,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.beatDirectorStageManifest(project, episode, beatNum),
    queryFn: ({ signal }) =>
      api
        .get(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/director-stage/manifest`,
          { signal },
        )
        .json<ApiResponse<DirectorStageManifest>>(),
    enabled: enabled && !!project && episode > 0 && beatNum > 0,
    // Freezone can commit this manifest from a separate app/query cache.
    // Treat mainline reads as externally mutable so tab focus refreshes it.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export interface BeatBackgroundAnchorItem {
  id: string;
  label: string;
  current: boolean;
  exists: boolean;
  path?: string;
  rel_path?: string | null;
  url?: string | null;
  snapshot_to_selected_background?: boolean;
}

export interface BeatBackgroundAnchorsData {
  episode: number;
  beat_num: number;
  scene_id: string;
  can_choose: boolean;
  render_anchor_id?: string;
  current_source?: string;
  current_anchor: string;
  current_reference?: BeatBackgroundReference | null;
  display_reference?: BeatBackgroundReference | null;
  render_input?: BeatBackgroundReference | null;
  anchors: BeatBackgroundAnchorItem[];
  error?: string;
}

export interface BeatBackgroundReference {
    id: string;
    label: string;
    anchor_id?: string;
    path?: string;
    rel_path?: string | null;
    url?: string | null;
}

export function useBeatBackgroundAnchors(project: string, episode: number, beatNum: number) {
  return useQuery({
    queryKey: queryKeys.beatBackgroundAnchors(project, episode, beatNum),
    queryFn: ({ signal }) =>
      api
        .get(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/background-anchors`,
          { signal },
        )
        .json<ApiResponse<BeatBackgroundAnchorsData>>(),
    enabled: !!project && episode > 0 && beatNum > 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useUpdateBeatBackgroundAnchor(project: string, episode: number, beatNum: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ anchorId }: { anchorId: string }) =>
      api
        .patch(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/background-anchor`,
          { json: { anchor_id: anchorId } },
        )
        .json<ApiResponse<BeatBackgroundAnchorsData>>(),
    onSuccess: (data) => {
      if (data.ok) {
        qc.setQueryData(queryKeys.beatBackgroundAnchors(project, episode, beatNum), data);
      }
      qc.invalidateQueries({ queryKey: queryKeys.beatBackgroundAnchors(project, episode, beatNum) });
      qc.invalidateQueries({ queryKey: queryKeys.beats(project, episode) });
      qc.invalidateQueries({ queryKey: queryKeys.grids(project, episode) });
    },
  });
}

export function useUploadBeatBackgroundAnchor(project: string, episode: number, beatNum: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file }: { file: File }) => {
      const form = new FormData();
      form.append("file", file, file.name);
      return api
        .post(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/background-anchor/upload`,
          { body: form },
        )
        .json<ApiResponse<BeatBackgroundAnchorsData>>();
    },
    onSuccess: (data) => {
      if (data.ok) {
        qc.setQueryData(queryKeys.beatBackgroundAnchors(project, episode, beatNum), data);
      }
      qc.invalidateQueries({ queryKey: queryKeys.beatBackgroundAnchors(project, episode, beatNum) });
      qc.invalidateQueries({ queryKey: queryKeys.beats(project, episode) });
      qc.invalidateQueries({ queryKey: queryKeys.grids(project, episode) });
    },
  });
}

export interface BeatBackgroundAnchorCropParams {
  anchorId: string;
  crop: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function useCropBeatBackgroundAnchor(project: string, episode: number, beatNum: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ anchorId, crop }: BeatBackgroundAnchorCropParams) =>
      api
        .post(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/background-anchor/crop`,
          {
            json: {
              anchor_id: anchorId,
              x: crop.x,
              y: crop.y,
              width: crop.width,
              height: crop.height,
            },
          },
        )
        .json<ApiResponse<BeatBackgroundAnchorsData>>(),
    onSuccess: (data) => {
      if (data.ok) {
        qc.setQueryData(queryKeys.beatBackgroundAnchors(project, episode, beatNum), data);
      }
      qc.invalidateQueries({ queryKey: queryKeys.beatBackgroundAnchors(project, episode, beatNum) });
      qc.invalidateQueries({ queryKey: queryKeys.beats(project, episode) });
      qc.invalidateQueries({ queryKey: queryKeys.grids(project, episode) });
    },
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

export interface DirectorControlFrameStatus {
  episode: number;
  beat_num: number;
  ready: boolean;
  path?: string | null;
  rel_path?: string | null;
  url?: string | null;
  scope: string;
}

export function useDirectorControlFrameStatus(
  project: string,
  episode: number,
  beatNum: number,
) {
  return useQuery({
    queryKey: queryKeys.directorControlFrame(project, episode, beatNum),
    queryFn: ({ signal }) =>
      api
        .get(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/director-control-frame`,
          { signal },
        )
        .json<ApiResponse<DirectorControlFrameStatus>>(),
    enabled: !!project && episode > 0 && beatNum > 0,
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
          | (TaskResponse & { data?: DirectorControlFrameStatus })
          | (ErrorResponse & { data?: DirectorControlFrameStatus })
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
