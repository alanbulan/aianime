// Copyright (c) 2026 AI anime
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type {
  DataResponse,
  EpisodeUpdatePayload,
  GenerateRewriteParams,
  GenerateScriptParams,
  InsertManualShotParams,
  NarrativePlanningGateway,
  PlanEpisodeAssetsResponse,
  PlanEpisodeAssetsResult,
} from "@/modules/narrative_planning/application/ports";
import { mergeEpisodeIntoList } from "@/modules/narrative_planning/domain/episode";
import type {
  Beat,
  BeatUpdate,
  Episode,
} from "@/modules/narrative_planning/domain/types";

export function isPlanEpisodeAssetsResult(
  response: PlanEpisodeAssetsResponse,
): response is DataResponse<PlanEpisodeAssetsResult> {
  if (response.ok === false) return false;
  const data = "data" in response ? response.data : undefined;
  return Boolean(
    data &&
      typeof data === "object" &&
      "episode" in data &&
      "total_count" in data,
  );
}

function cacheEpisodeUpdate(
  queryClient: QueryClient,
  project: string,
  episode: Episode,
) {
  queryClient.setQueryData<DataResponse<Episode[]> | undefined>(
    queryKeys.episodes(project),
    (old) =>
      old?.ok
        ? { ...old, data: mergeEpisodeIntoList(old.data, episode) }
        : old,
  );
  queryClient.setQueryData<DataResponse<Episode>>(
    queryKeys.episodeDetail(project, episode.number),
    { ok: true, data: episode },
  );
}

export function createNarrativePlanningQueryHooks(
  gateway: NarrativePlanningGateway,
) {
  function episodesQueryOptions(project: string) {
    return {
      queryKey: queryKeys.episodes(project),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        gateway.listEpisodes(project, signal),
    };
  }

  function useEpisodes(project: string) {
    return useQuery({
      ...episodesQueryOptions(project),
      enabled: !!project,
    });
  }

  function pipelineStatusQueryOptions(project: string) {
    return {
      queryKey: queryKeys.pipelineStatus(project),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        gateway.getPipelineStatus(project, signal),
    };
  }

  function usePipelineStatus(project: string) {
    return useQuery({
      ...pipelineStatusQueryOptions(project),
      enabled: !!project,
    });
  }

  function usePlanEpisodes(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (params?: {
        target_episodes?: number;
        planning_mode?: string;
      }) => gateway.planEpisodes(project, params),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.episodes(project) });
      },
    });
  }

  function useUpdateEpisode(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        episodeNum,
        data,
      }: {
        episodeNum: number;
        data: EpisodeUpdatePayload;
      }) => gateway.updateEpisode(project, episodeNum, data),
      onSuccess: (_response, variables) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.episodes(project) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.episodeDetail(project, variables.episodeNum),
        });
        if ("beat_source_text" in variables.data) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.script(project, variables.episodeNum),
          });
        }
      },
    });
  }

  function usePlanIdentities(project: string) {
    return useMutation({
      mutationFn: (episode: number) => gateway.planIdentities(project, episode),
    });
  }

  function usePlanEpisodeAssets(project: string, kind: "scene" | "prop") {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (episode: number) =>
        gateway.planEpisodeAssets(project, episode, kind),
      onSuccess: (response, episode) => {
        if (response.ok === false) return;
        if (isPlanEpisodeAssetsResult(response)) {
          cacheEpisodeUpdate(queryClient, project, response.data.episode);
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.episodes(project) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.episodeDetail(project, episode),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) });
        queryClient.invalidateQueries({
          queryKey:
            kind === "scene"
              ? queryKeys.scenes(project)
              : queryKeys.props(project),
        });
      },
    });
  }

  const usePlanEpisodeScenes = (project: string) =>
    usePlanEpisodeAssets(project, "scene");
  const usePlanEpisodeProps = (project: string) =>
    usePlanEpisodeAssets(project, "prop");

  function episodeDetailQueryOptions(project: string, episode: number) {
    return {
      queryKey: queryKeys.episodeDetail(project, episode),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        gateway.getEpisode(project, episode, signal),
    };
  }

  function useEpisodeDetail(
    project: string,
    episode: number,
    options?: { enabled?: boolean },
  ) {
    return useQuery({
      ...episodeDetailQueryOptions(project, episode),
      enabled: !!project && episode > 0 && (options?.enabled ?? true),
    });
  }

  function prefetchEpisodeDetail(
    queryClient: QueryClient,
    project: string,
    episode: number,
  ) {
    if (!project || episode <= 0) return;
    void queryClient.prefetchQuery(episodeDetailQueryOptions(project, episode));
  }

  function episodeBeatsQueryOptions(project: string, episode: number) {
    return {
      queryKey: queryKeys.beats(project, episode),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        gateway.getBeats(project, episode, signal),
    };
  }

  function useEpisodeBeats(
    project: string,
    episode: number,
    options?: { enabled?: boolean },
  ) {
    return useQuery({
      ...episodeBeatsQueryOptions(project, episode),
      enabled: !!project && episode > 0 && (options?.enabled ?? true),
    });
  }

  function prefetchEpisodeBeats(
    queryClient: QueryClient,
    project: string,
    episode: number,
  ) {
    if (!project || episode <= 0) return;
    void queryClient.prefetchQuery(episodeBeatsQueryOptions(project, episode));
  }

  function useInsertManualShot(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (data: InsertManualShotParams) =>
        gateway.insertManualShot(project, episode, data),
      onSuccess: (response) => {
        if (response.ok === false) return;
        queryClient.invalidateQueries({
          queryKey: queryKeys.beats(project, episode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.script(project, episode),
        });
      },
    });
  }

  function useDeleteManualShot(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (beat: number) =>
        gateway.deleteManualShot(project, episode, beat),
      onSuccess: (response) => {
        if (response.ok === false) return;
        queryClient.invalidateQueries({
          queryKey: queryKeys.beats(project, episode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.script(project, episode),
        });
      },
    });
  }

  function useScript(project: string, episode: number) {
    return useQuery({
      queryKey: queryKeys.script(project, episode),
      queryFn: ({ signal }) => gateway.getScript(project, episode, signal),
      enabled: !!project && episode > 0,
    });
  }

  function useGenerateScript(project: string, episode: number) {
    return useMutation({
      mutationFn: (params?: GenerateScriptParams) =>
        gateway.generateScript(project, episode, params),
    });
  }

  function useGenerateRewrite(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (params?: GenerateRewriteParams) =>
        gateway.generateRewrite(project, episode, params),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.episodeDetail(project, episode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.script(project, episode),
        });
      },
    });
  }

  function useUpdateBeat(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ beatNum, data }: { beatNum: number; data: BeatUpdate }) =>
        gateway.updateBeat(project, episode, beatNum, data),
      onSuccess: (response, { beatNum }) => {
        const patched = response.data;
        if (patched) {
          queryClient.setQueryData<DataResponse<Beat[]>>(
            queryKeys.beats(project, episode),
            (old) => {
              if (!old?.data) return old;
              return {
                ...old,
                data: old.data.map((beat) =>
                  beat.beat_number === beatNum
                    ? { ...beat, ...patched }
                    : beat,
                ),
              };
            },
          );
        }
        queryClient.invalidateQueries({
          queryKey: queryKeys.script(project, episode),
        });
      },
    });
  }

  function useSaveScript(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (beats: Beat[]) => gateway.saveScript(project, episode, beats),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.script(project, episode),
        });
      },
    });
  }

  return {
    episodeBeatsQueryOptions,
    episodeDetailQueryOptions,
    episodesQueryOptions,
    pipelineStatusQueryOptions,
    prefetchEpisodeBeats,
    prefetchEpisodeDetail,
    useDeleteManualShot,
    useEpisodeBeats,
    useEpisodeDetail,
    useEpisodes,
    useGenerateRewrite,
    useGenerateScript,
    useInsertManualShot,
    usePipelineStatus,
    usePlanEpisodeProps,
    usePlanEpisodeScenes,
    usePlanEpisodes,
    usePlanIdentities,
    useSaveScript,
    useScript,
    useUpdateBeat,
    useUpdateEpisode,
  };
}

export type NarrativePlanningQueryHooks = ReturnType<
  typeof createNarrativePlanningQueryHooks
>;
