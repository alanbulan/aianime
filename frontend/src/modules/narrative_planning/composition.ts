import { createElement, type ReactNode } from "react";

import { formatCreditCost } from "@/components/credits/credit-visual";
import { openPresetProjectionInMyCanvas } from "@/features/freezone/openPresetProjection";
import {
  useAssetWorkspaceNavigation,
  useCharacters,
} from "@/modules/asset_world/public";
import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import { useTasks } from "@/lib/queries/tasks";
import { TASK_TYPES, isActiveStatus } from "@/lib/task-types";
import {
  createNarrativePlanningQueryHooks,
  isPlanEpisodeAssetsResult,
} from "@/modules/narrative_planning/application/query-hooks";
import { createUseBeatsPageController } from "@/modules/narrative_planning/application/use-beats-page-controller";
import { createUseBeatsSketchPlanController } from "@/modules/narrative_planning/application/use-beats-sketch-plan-controller";
import { createUseEpisodeListItemController } from "@/modules/narrative_planning/application/use-episode-list-item-controller";
import { createUseEpisodesPageController } from "@/modules/narrative_planning/application/use-episodes-page-controller";
import { createUseScriptPageController } from "@/modules/narrative_planning/application/use-script-page-controller";
import { createUseSingleBeatPanelController } from "@/modules/narrative_planning/application/use-single-beat-panel-controller";
import { createUseSketchStudioController } from "@/modules/narrative_planning/application/use-sketch-studio-controller";
import type { Episode } from "@/modules/narrative_planning/domain/types";
import { httpNarrativePlanningGateway } from "@/modules/narrative_planning/infrastructure/http-narrative-planning-gateway";
import { BeatsPageView } from "@/modules/narrative_planning/presentation/BeatsPageView";
import {
  EpisodeListItemView,
  EpisodesPageView,
} from "@/modules/narrative_planning/presentation/EpisodesPageView";
import { ScriptPageView } from "@/modules/narrative_planning/presentation/ScriptPageView";
import {
  DEFAULT_VIDEO_BACKEND,
  createSketchRegenPlanItems,
  getLockedSketchRegenItemIds,
  sketchRegenModelCallCount,
  useGridsByBeat,
  useRebuildPoolIndex,
  useRegenerateSketches,
  useSketchSettings,
  useVideoBackends,
} from "@/modules/production/public";
import {
  useProject,
  useUpdateProject,
} from "@/modules/project_workspace/public";
import { saveScopes, useSaveState } from "@/stores/save-status-store";

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
const useScriptPageController = createUseScriptPageController(
  narrativePlanningQueries,
  { useCharacters, useGenerationCreditCost, useProject },
);
const useBeatsSketchPlanController = createUseBeatsSketchPlanController({
  createSketchPlanItems: createSketchRegenPlanItems,
  formatCreditCost,
  getLockedSketchItemIds: (tasks, items) =>
    getLockedSketchRegenItemIds(
      tasks,
      items,
      (task) =>
        task.task_type === TASK_TYPES.SKETCH_REGEN &&
        isActiveStatus(task.status),
    ),
  sketchModelCallCount: sketchRegenModelCallCount,
  useGenerationCreditCost,
  useRegenerateSketches,
  useTasks,
});
const useSketchStudioController = createUseSketchStudioController(
  { useScript: narrativePlanningQueries.useScript },
  { useCharacters },
);
export const useSingleBeatPanelController =
  createUseSingleBeatPanelController(
    { useGridsByBeat, useVideoBackends },
    {
      beatTextScope: saveScopes.beatText,
      useAssetWorkspaceNavigation,
      useSaveState,
    },
  );
const useBeatsPageController = createUseBeatsPageController(
  narrativePlanningQueries,
  {
    defaultVideoBackend: DEFAULT_VIDEO_BACKEND,
    openEpisodeFreezone: openPresetProjectionInMyCanvas,
    useGenerationCreditCost,
    useProject,
    useRebuildPoolIndex,
    useSketchSettings,
    useUpdateProject,
  },
  useBeatsSketchPlanController,
  useSketchStudioController,
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

export function ScriptPageContent({
  episodeNumber,
  project,
}: {
  episodeNumber: number;
  project: string;
}) {
  const controller = useScriptPageController({ episodeNumber, project });
  return createElement(ScriptPageView, { controller });
}

export function BeatsPageContent({
  clearFocusBeat,
  deepLinkBeat,
  episodeNumber,
  focusBeat,
  project,
  setBeat,
  targetSection,
}: Parameters<typeof useBeatsPageController>[0]) {
  const controller = useBeatsPageController({
    clearFocusBeat,
    deepLinkBeat,
    episodeNumber,
    focusBeat,
    project,
    setBeat,
    targetSection,
  });
  return createElement(BeatsPageView, { controller });
}

export { isPlanEpisodeAssetsResult };
