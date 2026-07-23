// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useStageTask } from "@/hooks/use-stage-task";
import { queryKeys } from "@/lib/query-keys";
import type { NarrativePlanningQueryHooks } from "@/modules/narrative_planning/application/query-hooks";
import {
  deriveEpisodeStats,
  derivePipelineEpisodeStatuses,
  mergeEpisodeCatalog,
  resolveSelectedEpisode,
} from "@/modules/narrative_planning/domain/episode";
import { backendErrorToastMessage, BillingRuleNotConfiguredError } from "@/shared/api/errors";

interface CharacterListQuery {
  data?: { data: readonly unknown[] };
}

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
  error: unknown;
}

export interface EpisodesPageControllerDependencies {
  useCharacters(project: string): CharacterListQuery;
  useGenerationCreditCost(kind: string, value: string): CreditCostQuery;
}

export interface EpisodesPageControllerOptions {
  project: string;
  selectedEpisodeNumber: number | null;
  onBackToEpisodes(): void;
  onSelectEpisode(episodeNumber: number): void;
}

function creditCostDisplay(
  query: CreditCostQuery,
  billingRuleFallback: string,
): string | null {
  return (
    query.data?.data.display ??
    (query.error instanceof BillingRuleNotConfiguredError
      ? billingRuleFallback
      : null)
  );
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
    const stats = useMemo(() => deriveEpisodeStats(episodes), [episodes]);
    const totalCharacters = charactersResponse?.data.length ?? 0;
    const completedEpisodes = useMemo(
      () => pipelineEpisodes.filter((episode) => episode.compose).length,
      [pipelineEpisodes],
    );

    const planEpisodes = queries.usePlanEpisodes(project);
    const planEpisodesCost = dependencies.useGenerationCreditCost(
      "feature",
      "build_episodes",
    );
    const planIdentitiesCost = dependencies.useGenerationCreditCost(
      "feature",
      "identity_planner",
    );
    const planScenesCost = dependencies.useGenerationCreditCost(
      "feature",
      "episode_scene_planner",
    );
    const planPropsCost = dependencies.useGenerationCreditCost(
      "feature",
      "episode_prop_planner",
    );
    const billingRuleFallback = t("common.billingRuleNotConfiguredShort");
    const planTask = useStageTask({
      taskType: "build_episodes",
      project,
      episode: 0,
      invalidateKeys: [
        queryKeys.episodes(project),
        queryKeys.pipelineStatus(project),
      ],
    });

    const handlePlan = async () => {
      try {
        const response = await planEpisodes.mutateAsync({});
        if (response.ok === false) {
          toast.error(backendErrorToastMessage(response.error, t));
          return;
        }
        planTask.start();
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
      planEpisodesCostDisplay: creditCostDisplay(
        planEpisodesCost,
        billingRuleFallback,
      ),
      planIdentitiesCostDisplay: creditCostDisplay(
        planIdentitiesCost,
        billingRuleFallback,
      ),
      planPending: planEpisodes.isPending || planTask.started,
      planPropsCostDisplay: creditCostDisplay(
        planPropsCost,
        billingRuleFallback,
      ),
      planScenesCostDisplay: creditCostDisplay(
        planScenesCost,
        billingRuleFallback,
      ),
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
