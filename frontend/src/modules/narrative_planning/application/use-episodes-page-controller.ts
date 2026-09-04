// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { TASK_TYPES, useTaskController } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import type { NarrativePlanningQueryHooks } from "@/modules/narrative_planning/application/query-hooks";
import {
  deriveEpisodeStats,
  derivePipelineEpisodeStatuses,
  mergeEpisodeCatalog,
  resolveSelectedEpisode,
} from "@/modules/narrative_planning/domain/episode";
import {
  backendErrorResponseToastMessage,
  backendErrorToastMessage,
} from "@/shared/api/errors";

interface CharacterListQuery {
  data?: {
    data: readonly { identities?: readonly unknown[] | null }[];
  };
}

interface AssetListQuery {
  data?: { data: readonly unknown[] };
}

export interface EpisodesPageControllerDependencies {
  useCharacters(project: string): CharacterListQuery;
  useScenes(project: string): AssetListQuery;
  useProps(project: string): AssetListQuery;
}

export interface EpisodesPageControllerOptions {
  project: string;
  selectedEpisodeNumber: number | null;
  onBackToEpisodes(): void;
  onSelectEpisode(episodeNumber: number): void;
}

export function createUseEpisodesPageController(
  queries: NarrativePlanningQueryHooks,
  dependencies: EpisodesPageControllerDependencies,
) {
  return function useEpisodesPageController(
    options: EpisodesPageControllerOptions,
  ) {
    const { project, selectedEpisodeNumber } = options;
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const {
      data: episodesResponse,
      isLoading: episodesLoading,
      isFetching: episodesFetching,
    } = queries.useEpisodes(project);
    const {
      data: pipelineResponse,
      isLoading: pipelineLoading,
      isFetching: pipelineFetching,
    } = queries.usePipelineStatus(project);
    const { data: charactersResponse } = dependencies.useCharacters(project);
    const { data: scenesResponse } = dependencies.useScenes(project);
    const { data: propsResponse } = dependencies.useProps(project);
    const selectedEpisodeKey = selectedEpisodeNumber ?? 0;
    const { data: selectedEpisodeResponse } = queries.useEpisodeDetail(
      project,
      selectedEpisodeKey,
    );
    const { data: selectedBeatsResponse } = queries.useEpisodeBeats(
      project,
      selectedEpisodeKey,
    );

    const episodes = episodesResponse?.data ?? [];
    const pipelineEpisodes = useMemo(
      () => derivePipelineEpisodeStatuses(pipelineResponse?.data),
      [pipelineResponse?.data],
    );
    const fallbackTitle = (episodeNumber: number) =>
      t("episode.list.episodeNumber", { n: episodeNumber });
    const displayEpisodes = useMemo(
      () => mergeEpisodeCatalog(episodes, pipelineEpisodes, fallbackTitle),
      [episodes, pipelineEpisodes, t],
    );
    const selectedEpisode = useMemo(
      () =>
        resolveSelectedEpisode(
          episodes,
          selectedEpisodeNumber,
          fallbackTitle,
        ),
      [episodes, selectedEpisodeNumber, t],
    );
    const episodeStats = useMemo(() => deriveEpisodeStats(episodes), [episodes]);
    const stats = useMemo(
      () => ({
        ...episodeStats,
        totalIdentities:
          charactersResponse?.data.reduce(
            (sum, character) => sum + (character.identities?.length ?? 0),
            0,
          ) ?? episodeStats.totalIdentities,
        totalScenes: scenesResponse?.data.length ?? episodeStats.totalScenes,
        totalProps: propsResponse?.data.length ?? episodeStats.totalProps,
      }),
      [
        charactersResponse?.data,
        episodeStats,
        propsResponse?.data.length,
        scenesResponse?.data.length,
      ],
    );
    const totalCharacters = charactersResponse?.data.length ?? 0;
    const completedEpisodes = useMemo(
      () => pipelineEpisodes.filter((episode) => episode.compose).length,
      [pipelineEpisodes],
    );

    const planEpisodes = queries.usePlanEpisodes(project);
    const planTask = useTaskController({
      key: {
        taskType: TASK_TYPES.BUILD_EPISODES,
        project,
        episode: 0,
      },
      invalidateKeys: [
        queryKeys.episodes(project),
        queryKeys.pipelineStatus(project),
      ],
    });

    const handlePlan = async () => {
      try {
        const response = await planEpisodes.mutateAsync({});
        if (response.ok === false) {
          toast.error(backendErrorResponseToastMessage(response, t));
          return;
        }
        planTask.start({ scope: response.scope, taskId: response.task_id });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handleRefresh = async () => {
      try {
        const invalidations = [
          queryClient.invalidateQueries({
            queryKey: queryKeys.episodes(project),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.pipelineStatus(project),
          }),
        ];
        if (selectedEpisodeNumber !== null) {
          invalidations.push(
            queryClient.invalidateQueries({
              queryKey: queryKeys.episodeDetail(
                project,
                selectedEpisodeNumber,
              ),
            }),
          );
        }
        await Promise.all(invalidations);
        return true;
      } catch {
        toast.error(t("common.error"));
        return false;
      }
    };

    return {
      ...options,
      completedEpisodes,
      displayEpisodes,
      handlePlan,
      handleRefresh,
      isLoading: episodesLoading || pipelineLoading,
      planPending: planEpisodes.isPending || planTask.started,
      planTask,
      refreshPending: episodesFetching || pipelineFetching,
      selectedBeatCount: selectedBeatsResponse?.data.length ?? 0,
      selectedEpisode,
      selectedEpisodeDetail: selectedEpisodeResponse?.data ?? selectedEpisode,
      stats,
      totalCharacters,
    };
  };
}

export type EpisodesPageController = ReturnType<
  ReturnType<typeof createUseEpisodesPageController>
>;
