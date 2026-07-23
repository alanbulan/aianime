import { createElement, type ReactNode } from "react";

import { useCharacters } from "@/lib/queries/characters";
import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import {
  createNarrativePlanningQueryHooks,
  isPlanEpisodeAssetsResult,
} from "@/modules/narrative_planning/application/query-hooks";
import { createUseEpisodeListItemController } from "@/modules/narrative_planning/application/use-episode-list-item-controller";
import { createUseEpisodesPageController } from "@/modules/narrative_planning/application/use-episodes-page-controller";
import type { Episode } from "@/modules/narrative_planning/domain/types";
import { httpNarrativePlanningGateway } from "@/modules/narrative_planning/infrastructure/http-narrative-planning-gateway";
import {
  EpisodeListItemView,
  EpisodesPageView,
} from "@/modules/narrative_planning/presentation/EpisodesPageView";

export const narrativePlanningQueries = createNarrativePlanningQueryHooks(
  httpNarrativePlanningGateway,
);

export const {
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
} = narrativePlanningQueries;

export const readPipelineStatus = (
  project: string,
  signal?: AbortSignal,
) => httpNarrativePlanningGateway.getPipelineStatus(project, signal);

const useEpisodesPageController = createUseEpisodesPageController(
  narrativePlanningQueries,
  { useCharacters, useGenerationCreditCost },
);
const useEpisodeListItemController = createUseEpisodeListItemController(
  narrativePlanningQueries,
);

function EpisodeListItemContent({
  episode,
  identityCostDisplay,
  onSelect,
  project,
  propCostDisplay,
  sceneCostDisplay,
}: {
  episode: Episode;
  identityCostDisplay?: string | null;
  onSelect(): void;
  project: string;
  propCostDisplay?: string | null;
  sceneCostDisplay?: string | null;
}) {
  const controller = useEpisodeListItemController({
    episode,
    identityCostDisplay,
    onSelect,
    project,
    propCostDisplay,
    sceneCostDisplay,
  });
  return createElement(EpisodeListItemView, { controller });
}

export function EpisodesPageContent({
  episodeContent,
  onBackToEpisodes,
  onSelectEpisode,
  project,
  selectedEpisodeNumber,
}: {
  episodeContent: ReactNode;
  onBackToEpisodes(): void;
  onSelectEpisode(episodeNumber: number): void;
  project: string;
  selectedEpisodeNumber: number | null;
}) {
  const controller = useEpisodesPageController({
    onBackToEpisodes,
    onSelectEpisode,
    project,
    selectedEpisodeNumber,
  });
  const renderEpisodeListItem = (episode: Episode) =>
    createElement(EpisodeListItemContent, {
      episode,
      identityCostDisplay: controller.planIdentitiesCostDisplay,
      key: episode.number,
      onSelect: () => onSelectEpisode(episode.number),
      project,
      propCostDisplay: controller.planPropsCostDisplay,
      sceneCostDisplay: controller.planScenesCostDisplay,
    });

  return createElement(EpisodesPageView, {
    controller,
    episodeContent,
    renderEpisodeListItem,
  });
}

export { isPlanEpisodeAssetsResult };
