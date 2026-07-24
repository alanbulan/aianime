// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/transport";
import { jsonWithBackendError } from "@/shared/api/errors";
import { p } from "@/shared/api/path";
import { queryKeys } from "@/lib/query-keys";
import { useAppStore } from "@/stores/app-store";
import type { ErrorResponse, OkResponse, TaskResponse } from "@/types/api";
import type { Beat } from "@/modules/narrative_planning/public";
import { DEFAULT_VIDEO_BACKEND } from "@/modules/production/public";

function currentPromptLanguage(): "zh" | "en" {
  return useAppStore.getState().language?.startsWith("zh") ? "zh" : "en";
}

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

export function useGlobalOptimize(project: string, episode: number) {
  return useMutation({
    mutationFn: () =>
      api
        .post(
          p`api/v1/projects/${project}/episodes/${episode}/optimize/video-global`,
          { json: { language: currentPromptLanguage() } },
        )
        .json<TaskResponse | ErrorResponse>(),
  });
}

export interface Seedance2PromptResult {
  beat: Beat;
  seedance2_config_json: string;
  final_prompt: string;
  prompt_source?: string;
}

export interface BeatVideoPromptResult {
  beat: Beat;
  field: "video_prompt" | "keyframe_prompt";
  prompt: string;
}

export function useGenerateSeedance2Prompt(project: string, episode: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      beatNum,
      manualPromptReference,
      promptGuidance,
    }: {
      beatNum: number;
      manualPromptReference?: string;
      promptGuidance?: string;
    }) =>
      jsonWithBackendError<OkResponse<Seedance2PromptResult> | ErrorResponse>(
        api.post(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/seedance2-prompt/generate`,
          {
            json: {
              manual_prompt_reference: manualPromptReference ?? "",
              prompt_guidance: promptGuidance ?? "",
            },
            throwHttpErrors: false,
          },
        ),
      ),
    onSuccess: (res, { beatNum }) => {
      if (!res.ok) return;
      const patched = res.data.beat;
      qc.setQueryData<OkResponse<Beat[]>>(
        queryKeys.beats(project, episode),
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((b) =>
              b.beat_number === beatNum ? { ...b, ...patched } : b,
            ),
          };
        },
      );
    },
  });
}

export function useGenerateBeatVideoPrompt(project: string, episode: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ beatNum }: { beatNum: number }) =>
      jsonWithBackendError<OkResponse<BeatVideoPromptResult> | TaskResponse | ErrorResponse>(
        api.post(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/video-prompt/generate`,
          {
            json: { language: currentPromptLanguage() },
            throwHttpErrors: false,
          },
        ),
      ),
    onSuccess: (res, { beatNum }) => {
      if (!res.ok) return;
      if (!("data" in res)) return;
      const patched = res.data.beat;
      qc.setQueryData<OkResponse<Beat[]>>(
        queryKeys.beats(project, episode),
        (old) => {
          if (!old?.data) return old;
          return {
            ...old,
            data: old.data.map((b) =>
              b.beat_number === beatNum ? { ...b, ...patched } : b,
            ),
          };
        },
      );
    },
  });
}

export function useRegenerateBeatVideo(project: string, episode: number) {
  // Kick-off is an ack; the actual video_url lands on SSE task completion,
  // where the task controller handles invalidation. Invalidating here would
  // fire a redundant refetch before regeneration has finished.
  return useMutation({
    mutationFn: ({
      beatNum,
      videoBackend,
      use_director_render,
      resolution,
      duration,
      ratio,
      mode,
      seedance2ConfigJson,
      audioSetting,
    }: {
      beatNum: number;
      videoBackend?: string;
      use_director_render?: boolean;
      // seedance-1.5-pro 等非 seedance2 后端的清晰度/时长（视频时长须 >= 音频，后端兜底）。
      resolution?: string;
      duration?: number;
      ratio?: string;
      mode?: string;
      seedance2ConfigJson?: string;
      audioSetting?: string;
    }) =>
      jsonWithBackendError<TaskResponse | ErrorResponse>(
        api.post(
          p`api/v1/projects/${project}/episodes/${episode}/beats/${beatNum}/video`,
          {
            json: {
              video_backend: videoBackend ?? DEFAULT_VIDEO_BACKEND,
              use_director_render,
              ...(resolution !== undefined ? { resolution } : {}),
              ...(duration !== undefined ? { duration } : {}),
              ...(ratio !== undefined ? { ratio } : {}),
              ...(mode !== undefined ? { mode } : {}),
              ...(seedance2ConfigJson !== undefined
                ? { seedance2_config_json: seedance2ConfigJson }
                : {}),
              ...(audioSetting !== undefined ? { audio_setting: audioSetting } : {}),
            },
            throwHttpErrors: false,
          },
        ),
      ),
  });
}
