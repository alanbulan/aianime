// Copyright (c) 2026 AI anime
import { useMemo } from "react";

import type { AspectSpec } from "@/lib/aspect-ratio";
import type { Beat } from "@/modules/narrative_planning/public";
import type {
  ProductionDataResponse,
  Seedance2BeatStatusResponse,
} from "@/modules/production/application/ports";
import type {
  BeatVideoGenerationController,
  BeatVideoGenerationControllerOptions,
} from "@/modules/production/application/use-beat-video-generation-controller";
import type {
  LegacyVideoPromptController,
  LegacyVideoPromptControllerOptions,
  LegacyVideoPromptUpdateCommand,
} from "@/modules/production/application/use-legacy-video-prompt-controller";
import type {
  Seedance2AssetOperationsController,
  Seedance2AssetOperationsControllerOptions,
} from "@/modules/production/application/use-seedance2-asset-operations-controller";
import type {
  Seedance2ConfigController,
  Seedance2ConfigControllerOptions,
  Seedance2ConfigUpdateCommand,
} from "@/modules/production/application/use-seedance2-config-controller";
import type {
  Seedance2MentionController,
  Seedance2MentionControllerOptions,
} from "@/modules/production/application/use-seedance2-mention-controller";
import type {
  VideoPaneMediaController,
  VideoPaneMediaControllerOptions,
} from "@/modules/production/application/use-video-pane-media-controller";
import { isSeedanceReferenceCropBackend } from "@/modules/production/domain/seedance2-crop";
import type {
  Seedance2AssetItem,
  Seedance2BeatStatus,
} from "@/modules/production/domain/seedance2-panel";
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";
import type { BeatStageState } from "@/types/beat-state";

interface Seedance2StatusQuery {
  data?: Seedance2BeatStatusResponse;
  refetch(): unknown;
}

interface VideoBackendsQuery {
  data?: ProductionDataResponse<VideoBackendOption[]>;
}

export interface VideoPaneControllerQueries {
  useSeedance2BeatStatus(
    project: string,
    episode: number,
    beatNumber: number,
    enabled: boolean,
  ): Seedance2StatusQuery;
  useVideoBackends(project: string): VideoBackendsQuery;
}

export interface VideoPaneControllerDependencies {
  useBeatVideoGenerationController(
    options: BeatVideoGenerationControllerOptions,
  ): BeatVideoGenerationController;
  useLegacyVideoPromptController(
    options: LegacyVideoPromptControllerOptions,
  ): LegacyVideoPromptController;
  useProjectAspectRatio(project: string): { spec: AspectSpec };
  useSeedance2AssetOperationsController(
    options: Seedance2AssetOperationsControllerOptions,
  ): Seedance2AssetOperationsController;
  useSeedance2ConfigController(
    options: Seedance2ConfigControllerOptions,
  ): Seedance2ConfigController;
  useSeedance2MentionController(
    options: Seedance2MentionControllerOptions,
  ): Seedance2MentionController;
  useVideoPaneMediaController(
    options: VideoPaneMediaControllerOptions,
  ): VideoPaneMediaController;
}

export interface VideoPaneControllerOptions {
  beat: Beat;
  defaultBackend: string;
  episode: number;
  project: string;
  savePending: boolean;
  state: BeatStageState;
  updateBeat(
    command:
      | LegacyVideoPromptUpdateCommand
      | Seedance2ConfigUpdateCommand,
  ): Promise<unknown>;
}

export interface VideoPaneController {
  assetOperations: Seedance2AssetOperationsController;
  beatNumber: number;
  config: Seedance2ConfigController;
  fallbackAudioReady: boolean;
  fallbackFrameReady: boolean;
  generation: BeatVideoGenerationController;
  legacyPrompt: LegacyVideoPromptController;
  media: VideoPaneMediaController;
  mention: Seedance2MentionController;
  modelReferenceAssets: Seedance2AssetItem[];
  projectAspect: "2:3" | "16:9";
  referenceCropAssets: Seedance2AssetItem[];
  savePending: boolean;
  showGrokVideoConfig: boolean;
  showHappyHorseConfig: boolean;
  showReferenceDetails: boolean;
  showSeedance2Config: boolean;
  sketchAspect: "2:3" | "16:9";
  status: Seedance2BeatStatus | null;
}

export function createUseVideoPaneController(
  queries: VideoPaneControllerQueries,
  dependencies: VideoPaneControllerDependencies,
) {
  return function useVideoPaneController({
    beat,
    defaultBackend,
    episode,
    project,
    savePending,
    state,
    updateBeat,
  }: VideoPaneControllerOptions): VideoPaneController {
    const { spec } = dependencies.useProjectAspectRatio(project);
    const legacyPrompt = dependencies.useLegacyVideoPromptController({
      beat,
      episode,
      project,
      updateBeat,
    });
    const { data: videoBackendsResponse } =
      queries.useVideoBackends(project);
    const videoBackends = videoBackendsResponse?.data ?? [];
    const assetOperations =
      dependencies.useSeedance2AssetOperationsController({
        beatNumber: beat.beat_number,
        episode,
        project,
      });
    const selectedBackend = videoBackends.find(
      (backend) => backend.value === defaultBackend,
    );
    const showSeedance2Config = selectedBackend?.is_seedance2 === true;
    const showHappyHorseConfig = selectedBackend?.is_happyhorse === true;
    const showGrokVideoConfig = selectedBackend?.is_grok_video === true;
    const showPromptConfig =
      showSeedance2Config || showHappyHorseConfig || showGrokVideoConfig;
    const showReferenceDetails =
      showPromptConfig || isSeedanceReferenceCropBackend(defaultBackend);
    const seedance2Status = queries.useSeedance2BeatStatus(
      project,
      episode,
      beat.beat_number,
      showReferenceDetails,
    );
    const status =
      seedance2Status.data?.ok === true
        ? seedance2Status.data.data
        : null;
    const config = dependencies.useSeedance2ConfigController({
      backend: defaultBackend,
      beat,
      episode,
      project,
      projectAspect: spec.renderAspect,
      selectedBackend,
      showGrokVideoConfig,
      showHappyHorseConfig,
      showSeedance2Config,
      refetchStatus: seedance2Status.refetch,
      updateBeat,
    });
    const assetItems = status?.assets.items ?? [];
    const modelReferenceAssets = useMemo(
      () =>
        showHappyHorseConfig || showGrokVideoConfig
          ? assetItems.filter((asset) => asset.media_type === "image")
          : assetItems,
      [assetItems, showGrokVideoConfig, showHappyHorseConfig],
    );
    const mention = dependencies.useSeedance2MentionController({
      assets: modelReferenceAssets,
      beatNumber: beat.beat_number,
      changeDraft: config.changeDraft,
      draft: config.draft,
      enabled: showPromptConfig,
    });
    const referenceCropAssets = useMemo(() => {
      const imageAssets = assetItems.filter(
        (asset) =>
          asset.media_type === "image" &&
          asset.exists !== false &&
          Boolean(asset.url || asset.path),
      );
      if (showPromptConfig) return imageAssets;
      return imageAssets.filter((asset) => asset.key === "first_frame");
    }, [assetItems, showPromptConfig]);
    const generation =
      dependencies.useBeatVideoGenerationController({
        applyNormalizedDraft: config.applyDraft,
        beatNumber: beat.beat_number,
        episode,
        generationInput: config.generationInput,
        project,
        prompt: showPromptConfig
          ? config.draft.final_prompt
          : legacyPrompt.prompt,
        promptKind: showPromptConfig ? "seedance2" : "legacy",
        saveDraft: (draft) =>
          config.saveDraft(draft, { suppressSuccess: true }),
      });
    const media = dependencies.useVideoPaneMediaController({
      beatNumber: beat.beat_number,
      episode,
      project,
      state,
      videoActive: generation.started,
      videoBackends,
      videoProgress: generation.progress,
      videoUrl: beat.video_url,
      useSeedance2Preview: showSeedance2Config,
    });

    return {
      assetOperations,
      beatNumber: beat.beat_number,
      config,
      fallbackAudioReady: Boolean(beat.audio_url),
      fallbackFrameReady: Boolean(beat.frame_url),
      generation,
      legacyPrompt,
      media,
      mention,
      modelReferenceAssets,
      projectAspect: spec.renderAspect,
      referenceCropAssets,
      savePending,
      showGrokVideoConfig,
      showHappyHorseConfig,
      showReferenceDetails,
      showSeedance2Config,
      sketchAspect: spec.sketchAspect,
      status,
    };
  };
}
