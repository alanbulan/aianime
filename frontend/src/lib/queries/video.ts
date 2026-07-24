// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/transport";
import { p } from "@/shared/api/path";
import { queryKeys } from "@/lib/query-keys";
import type { ErrorResponse, OkResponse, TaskResponse } from "@/types/api";

export interface NarratorVoiceStatusData {
  narration_style: string;
  source: string;
  reference_path: string;
  reference_url?: string;
  reference_sha256?: string;
  heading: string;
  detail: string;
  explanation: string;
  character_name?: string;
  identity_id?: string;
  identity_name?: string;
  error?: string;
  is_first_person: boolean;
}

export interface NarratorVoiceSourceOption {
  label: string;
  path: string;
  rel_path: string;
}

export interface NarratorVoiceSourcesData {
  options: NarratorVoiceSourceOption[];
}

function invalidateNarratorVoiceQueries(
  qc: ReturnType<typeof useQueryClient>,
  project: string,
) {
  qc.invalidateQueries({ queryKey: queryKeys.narratorVoice(project) });
  qc.invalidateQueries({ queryKey: queryKeys.narratorVoiceSources(project) });
  qc.invalidateQueries({
    queryKey: queryKeys.seedance2BeatStatusProject(project),
  });
}

export function useNarratorVoiceStatus(project: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.narratorVoice(project),
    queryFn: ({ signal }) =>
      api
        .get(p`api/v1/projects/${project}/narrator-voice`, { signal })
        .json<OkResponse<NarratorVoiceStatusData>>(),
    enabled: !!project && enabled,
  });
}

export function useNarratorVoiceSources(project: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.narratorVoiceSources(project),
    queryFn: ({ signal }) =>
      api
        .get(p`api/v1/projects/${project}/narrator-voice/sources`, { signal })
        .json<OkResponse<NarratorVoiceSourcesData>>(),
    enabled: !!project && enabled,
  });
}

export function useUploadNarratorVoice(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file, file.name);
      return api
        .post(p`api/v1/projects/${project}/narrator-voice/upload`, {
          body: formData,
        })
        .json<OkResponse<NarratorVoiceStatusData> | ErrorResponse>();
    },
    onSuccess: () => invalidateNarratorVoiceQueries(qc, project),
  });
}

export function useRecordNarratorVoice(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dataUrl: string) =>
      api
        .post(p`api/v1/projects/${project}/narrator-voice/record`, {
          json: { data_url: dataUrl },
        })
        .json<OkResponse<NarratorVoiceStatusData> | ErrorResponse>(),
    onSuccess: () => invalidateNarratorVoiceQueries(qc, project),
  });
}

export function useCopyProjectNarratorVoice(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourcePath: string) =>
      api
        .post(p`api/v1/projects/${project}/narrator-voice/copy`, {
          json: { source_path: sourcePath },
        })
        .json<OkResponse<NarratorVoiceStatusData> | ErrorResponse>(),
    onSuccess: () => invalidateNarratorVoiceQueries(qc, project),
  });
}

export function useTrimNarratorVoice(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      startSeconds,
      durationSeconds,
    }: {
      startSeconds: number;
      durationSeconds: number;
    }) =>
      api
        .post(p`api/v1/projects/${project}/narrator-voice/trim`, {
          json: {
            start_seconds: startSeconds,
            duration_seconds: durationSeconds,
          },
        })
        .json<OkResponse<NarratorVoiceStatusData> | ErrorResponse>(),
    onSuccess: () => invalidateNarratorVoiceQueries(qc, project),
  });
}

export function useDeleteNarratorVoice(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api
        .post(p`api/v1/projects/${project}/narrator-voice/delete`)
        .json<OkResponse<NarratorVoiceStatusData> | ErrorResponse>(),
    onSuccess: () => invalidateNarratorVoiceQueries(qc, project),
  });
}

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
