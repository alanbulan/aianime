// Copyright (c) 2026 AI anime
import { createElement } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { formatCreditCost } from "@/components/credits/credit-visual";
import { withImageCacheBust } from "@/features/canvas/application/imageData";
import { openPresetProjectionInMyCanvas } from "@/features/freezone/openPresetProjection";
import { useNow } from "@/hooks/use-now";
import {
  useGenerationCreditCost,
  useGenerationCreditCosts,
} from "@/lib/queries/generation-credit-cost";
import { useTasks } from "@/lib/queries/tasks";
import { queryKeys } from "@/lib/query-keys";
import type { Beat } from "@/modules/narrative_planning/public";
import { useAppStore } from "@/stores/app-store";
import { useSeenPoolStore } from "@/stores/seen-pool-store";
import { createAudioGenerationQueryHooks } from "@/modules/production/application/audio-generation-query-hooks";
import { createEpisodeComposeQueryHooks } from "@/modules/production/application/episode-compose-query-hooks";
import { createImageSettingsQueryHooks } from "@/modules/production/application/image-settings-query-hooks";
import { createImageGridQueryHooks } from "@/modules/production/application/image-grid-query-hooks";
import { createImagePoolQueryHooks } from "@/modules/production/application/image-pool-query-hooks";
import { createNarratorVoiceQueryHooks } from "@/modules/production/application/narrator-voice-query-hooks";
import { createRenderPlanQueryHooks } from "@/modules/production/application/render-plan-query-hooks";
import { createVideoBackendQueryHooks } from "@/modules/production/application/video-backend-query-hooks";
import { createVideoGenerationQueryHooks } from "@/modules/production/application/video-generation-query-hooks";
import { createVideoPoolQueryHooks } from "@/modules/production/application/video-pool-query-hooks";
import { createSeedance2PanelQueryHooks } from "@/modules/production/application/seedance2-panel-query-hooks";
import { createSketchRegenQueueQueryHooks } from "@/modules/production/application/sketch-regen-queue-query-hooks";
import { createSketchPoseEditorQueryHooks } from "@/modules/production/application/sketch-pose-editor-query-hooks";
import { createSketchMarkerQueryHooks } from "@/modules/production/application/sketch-marker-query-hooks";
import { createSketchGenerationQueryHooks } from "@/modules/production/application/sketch-generation-query-hooks";
import { createUseAudioPaneController } from "@/modules/production/application/use-audio-pane-controller";
import { createUseBatchPanelController } from "@/modules/production/application/use-batch-panel-controller";
import { createUseBeatVideoGenerationController } from "@/modules/production/application/use-beat-video-generation-controller";
import { createUseLegacyVideoPromptController } from "@/modules/production/application/use-legacy-video-prompt-controller";
import { createUseNarratorVoicePanelController } from "@/modules/production/application/use-narrator-voice-panel-controller";
import {
  createUseRenderGridCardController,
  createUseRenderGridGalleryController,
} from "@/modules/production/application/use-render-grid-gallery-controller";
import { createUseRenderSectionController } from "@/modules/production/application/use-render-section-controller";
import { createUseRenderPlanDialogController } from "@/modules/production/application/use-render-plan-dialog-controller";
import { createUseSeedance2AssetOperationsController } from "@/modules/production/application/use-seedance2-asset-operations-controller";
import { createUseSeedance2ConfigController } from "@/modules/production/application/use-seedance2-config-controller";
import {
  createUseSketchGridCardController,
  createUseSketchGridGalleryController,
} from "@/modules/production/application/use-sketch-grid-gallery-controller";
import { createUseSketchSectionController } from "@/modules/production/application/use-sketch-section-controller";
import { createUseVideoPaneMediaController } from "@/modules/production/application/use-video-pane-media-controller";
import { httpProductionVideoGateway } from "@/modules/production/infrastructure/http-production-video-gateway";
import { promptLanguageFromLocale } from "@/modules/production/domain/video-generation";
import { AudioPaneView } from "@/modules/production/presentation/AudioPaneView";
import type { VoiceConfigurationTarget } from "@/modules/production/domain/audio-prerequisite";
import { createBrowserVoiceRecorder } from "@/shared/voice-recording/browser-voice-recorder";
import type { BeatStageState } from "@/types/beat-state";

const audioGenerationQueries = createAudioGenerationQueryHooks(
  httpProductionVideoGateway,
);
const useAudioPaneController = createUseAudioPaneController(
  audioGenerationQueries,
  { useGenerationCreditCost },
);
const videoPoolQueries = createVideoPoolQueryHooks(
  httpProductionVideoGateway,
);
const seedance2PanelQueries = createSeedance2PanelQueryHooks(
  httpProductionVideoGateway,
);
const imagePoolQueries = createImagePoolQueryHooks(
  httpProductionVideoGateway,
);
const imageGridQueries = createImageGridQueryHooks(
  httpProductionVideoGateway,
);
const imageSettingsQueries = createImageSettingsQueryHooks(
  httpProductionVideoGateway,
);
const renderPlanQueries = createRenderPlanQueryHooks(
  httpProductionVideoGateway,
);
const sketchGenerationQueries = createSketchGenerationQueryHooks(
  httpProductionVideoGateway,
);
const sketchRegenQueueQueries = createSketchRegenQueueQueryHooks(
  httpProductionVideoGateway,
);
const videoGenerationQueries = createVideoGenerationQueryHooks({
  gateway: httpProductionVideoGateway,
  currentPromptLanguage: () =>
    promptLanguageFromLocale(useAppStore.getState().language),
});
const narratorVoiceQueries = createNarratorVoiceQueryHooks(
  httpProductionVideoGateway,
);
const gridBrowserCommands = {
  copyText: (text: string) => navigator.clipboard?.writeText(text),
  downloadFile: (url: string, filename: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  },
};
export const useBeatVideoGenerationController =
  createUseBeatVideoGenerationController(videoGenerationQueries, {
    useGenerationCreditCost,
  });
export const useLegacyVideoPromptController =
  createUseLegacyVideoPromptController(videoGenerationQueries, {
    useGenerationCreditCost,
  });
export const useSeedance2ConfigController =
  createUseSeedance2ConfigController(videoGenerationQueries, {
    useGenerationCreditCost,
  });
export const useSeedance2AssetOperationsController =
  createUseSeedance2AssetOperationsController(seedance2PanelQueries);
export const useVideoPaneMediaController = createUseVideoPaneMediaController(
  videoPoolQueries,
  { useNow },
);
export const useNarratorVoicePanelController =
  createUseNarratorVoicePanelController(narratorVoiceQueries, {
    createVoiceRecorder: createBrowserVoiceRecorder,
  });
export const useRenderGridGalleryController =
  createUseRenderGridGalleryController({
    useGrids: imagePoolQueries.useGrids,
    useRebuildPoolIndex: imagePoolQueries.useRebuildPoolIndex,
  });
export const useRenderGridCardController =
  createUseRenderGridCardController(
    {
      useCutGrid: imageGridQueries.useCutGrid,
      useExportGridPrompt: imageGridQueries.useExportGridPrompt,
      useRegenerateGrid: sketchGenerationQueries.useRegenerateGrid,
      useUploadGrid: imageGridQueries.useUploadGrid,
    },
    gridBrowserCommands,
  );
export const useSketchGridGalleryController =
  createUseSketchGridGalleryController({
    useGrids: imagePoolQueries.useGrids,
  });
export const useSketchGridCardController =
  createUseSketchGridCardController(
    {
      useExportGridPrompt: imageGridQueries.useExportGridPrompt,
      useGenerateSketches: sketchGenerationQueries.useGenerateSketches,
      useSketchGridPreview: imageGridQueries.useSketchGridPreview,
      useUploadGrid: imageGridQueries.useUploadGrid,
    },
    gridBrowserCommands,
  );
export const useBatchPanelController = createUseBatchPanelController(
  {
    useGenerateAudio: audioGenerationQueries.useGenerateAudio,
    useRegenerateSketches: sketchGenerationQueries.useRegenerateSketches,
    useSaveSketchRegenQueue:
      sketchRegenQueueQueries.useSaveSketchRegenQueue,
    useSketchRegenQueue: sketchRegenQueueQueries.useSketchRegenQueue,
    useSketchSettings: imageSettingsQueries.useSketchSettings,
  },
  {
    formatCreditCost,
    removeStoredValue: (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
    useGenerationCreditCost,
    useTasks,
  },
);
export const useRenderPlanDialogController =
  createUseRenderPlanDialogController(
    {
      useRenderExecute: renderPlanQueries.useRenderExecute,
      useRenderPlan: renderPlanQueries.useRenderPlan,
      useRenderSettings: imageSettingsQueries.useRenderSettings,
    },
    {
      formatCreditCost,
      useGenerationCreditCosts,
    },
  );
export const useSketchSectionController = createUseSketchSectionController(
  {
    useDirectorControlToSketch:
      sketchGenerationQueries.useDirectorControlToSketch,
    usePoolSelect: imagePoolQueries.usePoolSelect,
    useRegenerateSketches: sketchGenerationQueries.useRegenerateSketches,
    useSketchSettings: imageSettingsQueries.useSketchSettings,
    useUploadBeatImage: imagePoolQueries.useUploadBeatImage,
  },
  {
    cacheBustImage: withImageCacheBust,
    downloadFile: (url, filename) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    },
    openSketchFreezone: (project, episode, beatNumber) =>
      openPresetProjectionInMyCanvas(project, {
        scope: "beat",
        episode,
        beat: beatNumber,
        primary_slot: "sketch",
      }),
    useGenerationCreditCost,
    useNow,
    useSeenSketchCandidates: (project, episode) => ({
      markSeen: useSeenPoolStore((state) => state.markSeen),
      seenIds: useSeenPoolStore(
        (state) => state.seen[`${project}:${episode}`],
      ),
    }),
  },
);
export const useRenderSectionController = createUseRenderSectionController(
  {
    usePoolSelect: imagePoolQueries.usePoolSelect,
    useRegenerateRenderBeats:
      sketchGenerationQueries.useRegenerateRenderBeats,
    useRenderSettings: imageSettingsQueries.useRenderSettings,
    useUploadBeatImage: imagePoolQueries.useUploadBeatImage,
  },
  {
    downloadFile: (url, filename) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    },
    openRenderFreezone: (project, episode, beatNumber) =>
      openPresetProjectionInMyCanvas(project, {
        scope: "beat",
        episode,
        beat: beatNumber,
        primary_slot: "frame",
      }),
    useGenerationCreditCost,
    useNow,
    useRefreshDirectorControlFrame: (project, episode, beatNumber) => {
      const queryClient = useQueryClient();
      return () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.directorControlFrame(
            project,
            episode,
            beatNumber,
          ),
        });
    },
    useSeenRenderCandidates: (project, episode) => ({
      markSeen: useSeenPoolStore((state) => state.markSeen),
      seenIds: useSeenPoolStore(
        (state) => state.seen[`${project}:${episode}`],
      ),
    }),
  },
);

export const { useVideoBackends } = createVideoBackendQueryHooks(
  httpProductionVideoGateway,
);
export const { useVideoPool, useVideoPoolSelect } = videoPoolQueries;
export const {
  useGrids,
  useGridsByBeat,
  usePoolSelect,
  useRebuildPoolIndex,
  useUploadBeatImage,
} = imagePoolQueries;
export const {
  useCutGrid,
  useExportGridPrompt,
  useSketchGridPreview,
  useUploadGrid,
} = imageGridQueries;
export const {
  useSeedance2BeatStatus,
  useUploadSeedance2Asset,
  useDeleteSeedance2Asset,
  useCropSeedance2Asset,
  useTrimSeedance2Asset,
} = seedance2PanelQueries;
export const {
  useGlobalOptimize,
  useGenerateSeedance2Prompt,
  useGenerateBeatVideoPrompt,
  useRegenerateBeatVideo,
} = videoGenerationQueries;
export const {
  useNarratorVoiceStatus,
  useNarratorVoiceSources,
  useUploadNarratorVoice,
  useRecordNarratorVoice,
  useCopyProjectNarratorVoice,
  useTrimNarratorVoice,
  useDeleteNarratorVoice,
} = narratorVoiceQueries;
export const { useGenerateAudio, useRegenerateBeatAudio } =
  audioGenerationQueries;
export const {
  useRenderSettings,
  useUpdateRenderSettings,
  useSketchSettings,
  useUpdateSketchSettings,
} = imageSettingsQueries;
export const { useSketchRegenQueue, useSaveSketchRegenQueue } =
  sketchRegenQueueQueries;
export const {
  useSketchPoseEditor,
  useSaveSketchPoseEditor,
  useCropSketch,
} = createSketchPoseEditorQueryHooks(httpProductionVideoGateway);
export const { useAssignColors, useDetectIdentities } =
  createSketchMarkerQueryHooks(httpProductionVideoGateway);
export const {
  useDirectorControlToSketch,
  useGenerateSketches,
  useRegenerateGrid,
  useRegenerateRenderBeats,
  useRegenerateSketches,
} = sketchGenerationQueries;
export const { useComposeEpisode, useFinalVideo } =
  createEpisodeComposeQueryHooks(httpProductionVideoGateway);

export function AudioPaneContent({
  beat,
  episode,
  onConfigureVoice,
  project,
  state,
}: {
  beat: Beat;
  episode: number;
  onConfigureVoice(target: VoiceConfigurationTarget): void;
  project: string;
  state: BeatStageState;
}) {
  const controller = useAudioPaneController({
    beat,
    episode,
    onConfigureVoice,
    project,
    state,
  });
  return createElement(AudioPaneView, { controller });
}
