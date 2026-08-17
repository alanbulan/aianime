// Copyright (c) 2026 AI anime
import { createElement } from "react";

import { formatCreditCost } from "@/components/credit-visual";
import { withImageCacheBust } from "@/shared/media/image-cache";
import { useNow } from "@/shared/hooks/use-now";
import { useTaskController } from "@/modules/task_execution/public";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  useCommercialModelCatalog,
  loadCommercialModelCatalog,
  useGenerationCreditCost,
  useGenerationCreditCosts,
} from "@/modules/model_usage/public";
import { useTasks } from "@/modules/task_execution/public";
import {
  useEpisodeBeats,
  useEpisodeDetail,
  type Beat,
} from "@/modules/narrative_planning/public";
import {
  useProject,
  useUpdateProject,
} from "@/modules/project_workspace/public";
import { useAppStore } from "@/modules/project_workspace/public";
import { useProjectAspectRatio } from "@/shared/stores/aspect-ratio-store";
import { createAudioGenerationQueryHooks } from "@/modules/production/application/audio-generation-query-hooks";
import { createAuthorizedProductionImageGateway } from "@/modules/production/application/authorized-image-generation-gateway";
import { createUseAudioModels } from "@/modules/production/application/audio-model-query-hooks";
import { createEpisodeComposeQueryHooks } from "@/modules/production/application/episode-compose-query-hooks";
import { createImageSettingsQueryHooks } from "@/modules/production/application/image-settings-query-hooks";
import { createUseImageModels } from "@/modules/production/application/image-model-query-hooks";
import { createImageGridQueryHooks } from "@/modules/production/application/image-grid-query-hooks";
import { createImagePoolQueryHooks } from "@/modules/production/application/image-pool-query-hooks";
import { createNarratorVoiceQueryHooks } from "@/modules/production/application/narrator-voice-query-hooks";
import { createRenderPlanQueryHooks } from "@/modules/production/application/render-plan-query-hooks";
import { createUseVideoModels } from "@/modules/production/application/video-model-query-hooks";
import { createVideoGenerationQueryHooks } from "@/modules/production/application/video-generation-query-hooks";
import { createVideoPoolQueryHooks } from "@/modules/production/application/video-pool-query-hooks";
import { createSeedance2PanelQueryHooks } from "@/modules/production/application/seedance2-panel-query-hooks";
import { createSketchPoseEditorQueryHooks } from "@/modules/production/application/sketch-pose-editor-query-hooks";
import { createSketchMarkerQueryHooks } from "@/modules/production/application/sketch-marker-query-hooks";
import { createSketchGenerationQueryHooks } from "@/modules/production/application/sketch-generation-query-hooks";
import { createUseAudioPaneController } from "@/modules/production/application/use-audio-pane-controller";
import { createUseBatchBarController } from "@/modules/production/application/use-batch-bar-controller";
import { createUseBeatStates } from "@/modules/production/application/use-beat-states";
import { createUseBeatVideoGenerationController } from "@/modules/production/application/use-beat-video-generation-controller";
import { createUseEpisodeComposePageController } from "@/modules/production/application/use-episode-compose-page-controller";
import { createUseLegacyVideoPromptController } from "@/modules/production/application/use-legacy-video-prompt-controller";
import { createUseNarratorVoicePanelController } from "@/modules/production/application/use-narrator-voice-panel-controller";
import {
  createUseRenderGridCardController,
  createUseRenderGridGalleryController,
} from "@/modules/production/application/use-render-grid-gallery-controller";
import { createUseRenderPlanDialogController } from "@/modules/production/application/use-render-plan-dialog-controller";
import { createUseSketchCropDialogController } from "@/modules/production/application/use-sketch-crop-dialog-controller";
import { createUseSketchPoseEditorDialogController } from "@/modules/production/application/use-sketch-pose-editor-dialog-controller";
import { createUseSeedance2AssetOperationsController } from "@/modules/production/application/use-seedance2-asset-operations-controller";
import { createUseSeedance2ConfigController } from "@/modules/production/application/use-seedance2-config-controller";
import {
  createUseSketchGridCardController,
  createUseSketchGridGalleryController,
} from "@/modules/production/application/use-sketch-grid-gallery-controller";
import { createUseVideoPaneMediaController } from "@/modules/production/application/use-video-pane-media-controller";
import { createUseVideoPaneController } from "@/modules/production/application/use-video-pane-controller";
import { useSeedance2MentionController } from "@/modules/production/application/use-seedance2-mention-controller";
import { httpProductionVideoGateway } from "@/modules/production/infrastructure/http-production-video-gateway";
import { promptLanguageFromLocale } from "@/modules/production/domain/video-generation";
import { AudioPaneView } from "@/modules/production/presentation/AudioPaneView";
import { EpisodeComposePageView } from "@/modules/production/presentation/EpisodeComposePageView";
import type { VoiceConfigurationTarget } from "@/modules/production/domain/audio-prerequisite";
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";
import { BatchBarView } from "@/modules/production/presentation/BatchBarView";
import { NarratorVoicePanelView } from "@/modules/production/presentation/NarratorVoicePanelView";
import { RenderPlanDialogView } from "@/modules/production/presentation/RenderPlanDialogView";
import { createBrowserVoiceRecorder } from "@/shared/voice-recording/browser-voice-recorder";
import type { BeatStageState } from "@/modules/production/domain/beat-state";

const audioGenerationQueries = createAudioGenerationQueryHooks(
  httpProductionVideoGateway,
);
const authorizedProductionImageGateway =
  createAuthorizedProductionImageGateway(httpProductionVideoGateway, {
    load: () => loadCommercialModelCatalog("IMAGE"),
  });
const useAudioModels = createUseAudioModels(useCommercialModelCatalog);
const useAudioPaneController = createUseAudioPaneController(
  audioGenerationQueries,
  { useAudioModels, useGenerationCreditCost },
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
const useImageModels = createUseImageModels(useCommercialModelCatalog);
const renderPlanQueries = createRenderPlanQueryHooks(
  authorizedProductionImageGateway,
);
const sketchGenerationQueries = createSketchGenerationQueryHooks(
  authorizedProductionImageGateway,
);
const sketchPoseEditorQueries = createSketchPoseEditorQueryHooks(
  httpProductionVideoGateway,
);
const videoGenerationQueries = createVideoGenerationQueryHooks({
  gateway: httpProductionVideoGateway,
  currentPromptLanguage: () =>
    promptLanguageFromLocale(useAppStore.getState().language),
});
const useVideoModels = createUseVideoModels(useCommercialModelCatalog);
const sketchMarkerQueries = createSketchMarkerQueryHooks(
  httpProductionVideoGateway,
);
const narratorVoiceQueries = createNarratorVoiceQueryHooks(
  httpProductionVideoGateway,
);
const episodeComposeQueries = createEpisodeComposeQueryHooks(
  httpProductionVideoGateway,
);
export const useBeatStates = createUseBeatStates({
  useEpisodeBeats,
  useProject,
  useTasks,
});
const downloadBlob = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
};
const useEpisodeComposePageController =
  createUseEpisodeComposePageController(
    {
      ...episodeComposeQueries,
      useEpisodeBeats,
      useEpisodeDetail,
      useProject,
      useUpdateProject,
    },
    {
      downloadFile: downloadBlob,
      exportEpisode: (...args) =>
        httpProductionVideoGateway.exportEpisode(...args),
      useBeatStates,
      useTaskController,
    },
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
export const useVideoPaneController = createUseVideoPaneController(
  {
    useSeedance2BeatStatus: seedance2PanelQueries.useSeedance2BeatStatus,
    useVideoModels,
  },
  {
    useBeatVideoGenerationController,
    useLegacyVideoPromptController,
    useProjectAspectRatio,
    useSeedance2AssetOperationsController,
    useSeedance2ConfigController,
    useSeedance2MentionController,
    useVideoPaneMediaController,
  },
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
export const useBatchBarController = createUseBatchBarController(
  {
    useAssignColors: sketchMarkerQueries.useAssignColors,
    useDetectIdentities: sketchMarkerQueries.useDetectIdentities,
    useGenerateAudio: audioGenerationQueries.useGenerateAudio,
    useGlobalOptimize: videoGenerationQueries.useGlobalOptimize,
    useProductionWorkflow: videoGenerationQueries.useProductionWorkflow,
    useRenderSettings: imageSettingsQueries.useRenderSettings,
    useSketchSettings: imageSettingsQueries.useSketchSettings,
    useUpdateRenderSettings: imageSettingsQueries.useUpdateRenderSettings,
    useUpdateSketchSettings: imageSettingsQueries.useUpdateSketchSettings,
    useAudioModels,
    useImageModels,
    useVideoModels,
  },
  { formatCreditCost, useGenerationCreditCost },
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
export const useSketchCropDialogController =
  createUseSketchCropDialogController(
    {
      useCropSketch: sketchPoseEditorQueries.useCropSketch,
      useSketchCropSource: sketchPoseEditorQueries.useSketchCropSource,
    },
    {
      cacheBustImage: withImageCacheBust,
      resolveMediaUrl,
      useProjectAspectRatio,
    },
  );
export const useSketchPoseEditorDialogController =
  createUseSketchPoseEditorDialogController(
    {
      useSaveSketchPoseEditor:
        sketchPoseEditorQueries.useSaveSketchPoseEditor,
      useSketchPoseEditor: sketchPoseEditorQueries.useSketchPoseEditor,
    },
    { resolveMediaUrl },
  );
export { useVideoModels };
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
  useProductionWorkflow,
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
export const { useAssignColors, useDetectIdentities } = sketchMarkerQueries;
export const {
  useDirectorControlToSketch,
  useGenerateSketches,
  useRegenerateGrid,
  useRegenerateRenderBeats,
  useRegenerateSketches,
} = sketchGenerationQueries;
export const { useComposeEpisode, useFinalVideo } =
  episodeComposeQueries;

export interface EpisodeComposePageProps {
  episode: number;
  onOpenBeat(beatNumber: number): void;
  project: string;
}

export function EpisodeComposePage(props: EpisodeComposePageProps) {
  const controller = useEpisodeComposePageController(props);
  return createElement(EpisodeComposePageView, { controller });
}

export interface BatchBarProps {
  beats: Beat[];
  episode: number;
  onSketchAspectRatioChange(aspectRatio: SketchAspectRatio): void;
  project: string;
  sketchAspectRatio: SketchAspectRatio;
  spineTemplate?: "drama" | "narrated";
  videoModel: string;
}

export function BatchBar({
  beats,
  episode,
  onSketchAspectRatioChange,
  project,
  sketchAspectRatio,
  spineTemplate = "drama",
  videoModel,
}: BatchBarProps) {
  const controller = useBatchBarController({
    beats,
    episode,
    onSketchAspectRatioChange,
    project,
    sketchAspectRatio,
    spineTemplate,
    videoModel,
  });

  return createElement(BatchBarView, { controller });
}

export interface NarratorVoicePanelProps {
  allowFirstPersonProjectVoice?: boolean;
  project: string;
}

export function NarratorVoicePanel({
  allowFirstPersonProjectVoice = false,
  project,
}: NarratorVoicePanelProps) {
  const controller = useNarratorVoicePanelController({
    allowFirstPersonProjectVoice,
    project,
  });

  return createElement(NarratorVoicePanelView, { controller });
}

export interface RenderPlanDialogProps {
  aspectMode: string;
  beatIndices: number[];
  defaultForceOneByOne?: boolean;
  episode: number;
  onDispatched(taskIds: string[]): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
}

export function RenderPlanDialog({
  aspectMode,
  beatIndices,
  defaultForceOneByOne = false,
  episode,
  onDispatched,
  onOpenChange,
  open,
  project,
}: RenderPlanDialogProps) {
  const controller = useRenderPlanDialogController({
    aspectMode,
    beatIndices,
    defaultForceOneByOne,
    episode,
    onDispatched,
    onOpenChange,
    open,
    project,
  });

  return createElement(RenderPlanDialogView, controller);
}

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
