import { formatCreditCost } from "@/components/credits/credit-visual";
import { openPresetProjectionInMyCanvas } from "@/modules/creative_canvas/public";
import {
  useAssetWorkspaceNavigation,
  useCharacters,
  useScenePlatePreview,
  useScenes,
} from "@/modules/asset_world/public";
import { useNavigateToAsset } from "@/modules/asset_world/public";
import { useGenerationCreditCost } from "@/modules/model_usage/public";
import { useTasks } from "@/modules/task_execution/public";
import { TASK_TYPES, isActiveStatus } from "@/modules/task_execution/public";
import { createUseActionPanelController } from "@/modules/narrative_planning/application/use-action-panel-controller";
import { createUseBeatCardGridController } from "@/modules/narrative_planning/application/use-beat-card-grid-controller";
import { createUseInsertManualShotDialogController } from "@/modules/narrative_planning/application/use-insert-manual-shot-dialog-controller";
import { createUseBeatsPageController } from "@/modules/narrative_planning/application/use-beats-page-controller";
import { createUseBeatsSketchPlanController } from "@/modules/narrative_planning/application/use-beats-sketch-plan-controller";
import { createUseEpisodeListItemController } from "@/modules/narrative_planning/application/use-episode-list-item-controller";
import { createUseEpisodesPageController } from "@/modules/narrative_planning/application/use-episodes-page-controller";
import { createUseScriptPageController } from "@/modules/narrative_planning/application/use-script-page-controller";
import { createUseSingleBeatPanelController } from "@/modules/narrative_planning/application/use-single-beat-panel-controller";
import { createUseSketchStudioController } from "@/modules/narrative_planning/application/use-sketch-studio-controller";
import { createUseTextPaneController } from "@/modules/narrative_planning/application/use-text-pane-controller";
import { narrativePlanningQueries } from "@/modules/narrative_planning/query-composition";
import { useEpisodeWorkbenchSectionState } from "@/modules/narrative_planning/infrastructure/episode-workbench-section-state";
import { useBeatSelection } from "@/modules/narrative_planning/infrastructure/use-beat-selection";
import { useBeatsViewToggles } from "@/modules/narrative_planning/infrastructure/use-beats-view-toggles";
import {
  createSketchRegenPlanItems,
  getLockedSketchRegenItemIds,
  sketchRegenModelCallCount,
  useBeatStates,
  useGridsByBeat,
  useRebuildPoolIndex,
  useRegenerateSketches,
  useSketchSettings,
  useVideoModels,
} from "@/modules/production/public";
import {
  useProject,
  useUpdateProject,
} from "@/modules/project_workspace/public";
import {
  saveScopes,
  trackSave,
  useSaveState,
} from "@/stores/save-status-store";

export const useInsertManualShotDialogController =
  createUseInsertManualShotDialogController({
    useEpisodeBeats: narrativePlanningQueries.useEpisodeBeats,
    useEpisodeDetail: narrativePlanningQueries.useEpisodeDetail,
    useInsertManualShot: narrativePlanningQueries.useInsertManualShot,
  });
export const useBeatCardGridController = createUseBeatCardGridController(
  {
    useDeleteManualShot: narrativePlanningQueries.useDeleteManualShot,
    useGridsByBeat,
  },
  {
    openBeatFreezone: openPresetProjectionInMyCanvas,
  },
);
export const useTextPaneController = createUseTextPaneController(
  {
    useEpisodeDetail: narrativePlanningQueries.useEpisodeDetail,
    useScenePlatePreview,
    useScenes,
    useUpdateBeat: narrativePlanningQueries.useUpdateBeat,
  },
  {
    beatTextScope: saveScopes.beatText,
    trackSave,
    useAssetNavigation: useNavigateToAsset,
  },
);

export const useEpisodesPageController = createUseEpisodesPageController(
  narrativePlanningQueries,
  {
    useCharacters,
    useGenerationCreditCost,
  },
);
export const useEpisodeListItemController = createUseEpisodeListItemController(
  narrativePlanningQueries,
);
export const useScriptPageController = createUseScriptPageController(
  narrativePlanningQueries,
  {
    useCharacters,
    useGenerationCreditCost,
    useProject,
  },
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
    {
      useGridsByBeat,
      useVideoModels,
    },
    {
      beatTextScope: saveScopes.beatText,
      useAssetWorkspaceNavigation,
      useSaveState,
    },
  );
export const useActionPanelController = createUseActionPanelController({
  useSectionState: useEpisodeWorkbenchSectionState,
});
export const useBeatsPageController = createUseBeatsPageController(
  narrativePlanningQueries,
  {
    openEpisodeFreezone: openPresetProjectionInMyCanvas,
    useGenerationCreditCost,
    useBeatSelection,
    useBeatStates,
    useProject,
    useRebuildPoolIndex,
    useSketchSettings,
    useUpdateProject,
    useVideoModels,
    useViewToggles: useBeatsViewToggles,
  },
  useBeatsSketchPlanController,
  useSketchStudioController,
);
