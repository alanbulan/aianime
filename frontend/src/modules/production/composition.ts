// Copyright (c) 2026 AI anime
import { useAppStore } from "@/stores/app-store";
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
import { httpProductionVideoGateway } from "@/modules/production/infrastructure/http-production-video-gateway";
import { promptLanguageFromLocale } from "@/modules/production/domain/video-generation";

export const { useVideoBackends } = createVideoBackendQueryHooks(
  httpProductionVideoGateway,
);
export const { useVideoPool, useVideoPoolSelect } = createVideoPoolQueryHooks(
  httpProductionVideoGateway,
);
export const {
  useGrids,
  useGridsByBeat,
  usePoolSelect,
  useRebuildPoolIndex,
  useUploadBeatImage,
} = createImagePoolQueryHooks(httpProductionVideoGateway);
export const {
  useCutGrid,
  useExportGridPrompt,
  useSketchGridPreview,
  useUploadGrid,
} = createImageGridQueryHooks(httpProductionVideoGateway);
export const {
  useSeedance2BeatStatus,
  useUploadSeedance2Asset,
  useDeleteSeedance2Asset,
  useCropSeedance2Asset,
  useTrimSeedance2Asset,
} = createSeedance2PanelQueryHooks(httpProductionVideoGateway);
export const {
  useGlobalOptimize,
  useGenerateSeedance2Prompt,
  useGenerateBeatVideoPrompt,
  useRegenerateBeatVideo,
} = createVideoGenerationQueryHooks({
  gateway: httpProductionVideoGateway,
  currentPromptLanguage: () =>
    promptLanguageFromLocale(useAppStore.getState().language),
});
export const {
  useNarratorVoiceStatus,
  useNarratorVoiceSources,
  useUploadNarratorVoice,
  useRecordNarratorVoice,
  useCopyProjectNarratorVoice,
  useTrimNarratorVoice,
  useDeleteNarratorVoice,
} = createNarratorVoiceQueryHooks(httpProductionVideoGateway);
export const { useGenerateAudio, useRegenerateBeatAudio } =
  createAudioGenerationQueryHooks(httpProductionVideoGateway);
export const {
  useRenderSettings,
  useUpdateRenderSettings,
  useSketchSettings,
  useUpdateSketchSettings,
} = createImageSettingsQueryHooks(httpProductionVideoGateway);
export const { useRenderPlan, useRenderExecute } =
  createRenderPlanQueryHooks(httpProductionVideoGateway);
export const { useSketchRegenQueue, useSaveSketchRegenQueue } =
  createSketchRegenQueueQueryHooks(httpProductionVideoGateway);
export const {
  useSketchPoseEditor,
  useSaveSketchPoseEditor,
  useCropSketch,
} = createSketchPoseEditorQueryHooks(httpProductionVideoGateway);
export const { useAssignColors, useDetectIdentities } =
  createSketchMarkerQueryHooks(httpProductionVideoGateway);
export const {
  useGenerateSketches,
  useRegenerateGrid,
  useRegenerateRenderBeats,
  useRegenerateSketches,
} = createSketchGenerationQueryHooks(httpProductionVideoGateway);
export const { useComposeEpisode, useFinalVideo } =
  createEpisodeComposeQueryHooks(httpProductionVideoGateway);
