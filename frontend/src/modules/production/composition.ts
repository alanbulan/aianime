// Copyright (c) 2026 AI anime
import { useAppStore } from "@/stores/app-store";
import { createNarratorVoiceQueryHooks } from "@/modules/production/application/narrator-voice-query-hooks";
import { createVideoBackendQueryHooks } from "@/modules/production/application/video-backend-query-hooks";
import { createVideoGenerationQueryHooks } from "@/modules/production/application/video-generation-query-hooks";
import { createVideoPoolQueryHooks } from "@/modules/production/application/video-pool-query-hooks";
import { createSeedance2PanelQueryHooks } from "@/modules/production/application/seedance2-panel-query-hooks";
import { httpProductionVideoGateway } from "@/modules/production/infrastructure/http-production-video-gateway";
import { promptLanguageFromLocale } from "@/modules/production/domain/video-generation";

export const { useVideoBackends } = createVideoBackendQueryHooks(
  httpProductionVideoGateway,
);
export const { useVideoPool, useVideoPoolSelect } = createVideoPoolQueryHooks(
  httpProductionVideoGateway,
);
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
