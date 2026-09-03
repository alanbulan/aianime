// Copyright (c) 2026 AI anime
import { useMemo } from "react";

import type { AspectSpec } from "@/shared/aspect-ratio";
import type { Beat } from "@/modules/narrative_planning/public";
import type { VideoReferenceBeatStatusResponse } from "@/modules/production/application/ports";
import type {
  BeatVideoGenerationController,
  BeatVideoGenerationControllerOptions,
} from "@/modules/production/application/use-beat-video-generation-controller";
import type {
  BasicVideoPromptController,
  BasicVideoPromptControllerOptions,
  BasicVideoPromptUpdateCommand,
} from "@/modules/production/application/use-basic-video-prompt-controller";
import type {
  VideoReferenceAssetOperationsController,
  VideoReferenceAssetOperationsControllerOptions,
} from "@/modules/production/application/use-video-reference-asset-operations-controller";
import type {
  BeatVideoConfigController,
  BeatVideoConfigControllerOptions,
  BeatVideoConfigUpdateCommand,
} from "@/modules/production/application/use-beat-video-config-controller";
import type {
  VideoReferenceMentionController,
  VideoReferenceMentionControllerOptions,
} from "@/modules/production/application/use-video-reference-mention-controller";
import type {
  VideoPaneMediaController,
  VideoPaneMediaControllerOptions,
} from "@/modules/production/application/use-video-pane-media-controller";
import type {
  VideoReferenceAssetItem,
  VideoReferenceBeatStatus,
} from "@/modules/production/domain/video-reference-panel";
import {
  resolveVideoModelOption,
  type VideoModelOption,
} from "@/modules/production/domain/video-model";
import type { BeatStageState } from "@/modules/production/domain/beat-state";

interface VideoReferenceStatusQuery {
  data?: VideoReferenceBeatStatusResponse;
  refetch(): unknown;
}

interface VideoModelsQuery {
  data: VideoModelOption[];
}

export interface VideoPaneControllerQueries {
  useVideoReferenceBeatStatus(
    project: string,
    episode: number,
    beatNumber: number,
    enabled: boolean,
  ): VideoReferenceStatusQuery;
  useVideoModels(enabled?: boolean): VideoModelsQuery;
}

export interface VideoPaneControllerDependencies {
  useBeatVideoGenerationController(
    options: BeatVideoGenerationControllerOptions,
  ): BeatVideoGenerationController;
  useBasicVideoPromptController(
    options: BasicVideoPromptControllerOptions,
  ): BasicVideoPromptController;
  useProjectAspectRatio(project: string): { spec: AspectSpec };
  useVideoReferenceAssetOperationsController(
    options: VideoReferenceAssetOperationsControllerOptions,
  ): VideoReferenceAssetOperationsController;
  useBeatVideoConfigController(
    options: BeatVideoConfigControllerOptions,
  ): BeatVideoConfigController;
  useVideoReferenceMentionController(
    options: VideoReferenceMentionControllerOptions,
  ): VideoReferenceMentionController;
  useVideoPaneMediaController(
    options: VideoPaneMediaControllerOptions,
  ): VideoPaneMediaController;
}

export interface VideoPaneControllerOptions {
  beat: Beat;
  defaultModel: string;
  episode: number;
  project: string;
  savePending: boolean;
  state: BeatStageState;
  updateBeat(
    command:
      | BasicVideoPromptUpdateCommand
      | BeatVideoConfigUpdateCommand,
  ): Promise<unknown>;
}

export interface VideoPaneController {
  assetOperations: VideoReferenceAssetOperationsController;
  beatNumber: number;
  config: BeatVideoConfigController;
  fallbackAudioReady: boolean;
  fallbackFrameReady: boolean;
  generation: BeatVideoGenerationController;
  basicPrompt: BasicVideoPromptController;
  media: VideoPaneMediaController;
  mention: VideoReferenceMentionController;
  modelLabel: string;
  modelReferenceAssets: VideoReferenceAssetItem[];
  projectAspect: "2:3" | "16:9";
  referenceCropAssets: VideoReferenceAssetItem[];
  savePending: boolean;
  showAdvancedVideoConfig: boolean;
  showReferenceVideoConfig: boolean;
  showReferenceDetails: boolean;
  sketchAspect: "2:3" | "16:9";
  status: VideoReferenceBeatStatus | null;
}

export function createUseVideoPaneController(
  queries: VideoPaneControllerQueries,
  dependencies: VideoPaneControllerDependencies,
) {
  return function useVideoPaneController({
    beat,
    defaultModel,
    episode,
    project,
    savePending,
    state,
    updateBeat,
  }: VideoPaneControllerOptions): VideoPaneController {
    const { spec } = dependencies.useProjectAspectRatio(project);
    const basicPrompt = dependencies.useBasicVideoPromptController({
      beat,
      episode,
      project,
      updateBeat,
    });
    const { data: videoModels } = queries.useVideoModels(Boolean(project));
    const assetOperations =
      dependencies.useVideoReferenceAssetOperationsController({
        beatNumber: beat.beat_number,
        episode,
        project,
      });
    const selectedModel = resolveVideoModelOption(videoModels, defaultModel);
    const showAdvancedVideoConfig =
      selectedModel?.workflow === "advanced-reference" ||
      (selectedModel?.workflow === "standard" &&
        selectedModel.supportsAdvancedConfig);
    const showReferenceVideoConfig = selectedModel?.workflow === "reference";
    const showPromptConfig =
      showAdvancedVideoConfig || showReferenceVideoConfig;
    const showReferenceDetails =
      showPromptConfig || (selectedModel?.referenceImageMax ?? 0) > 0;
    const videoReferenceStatus = queries.useVideoReferenceBeatStatus(
      project,
      episode,
      beat.beat_number,
      showReferenceDetails,
    );
    const status =
      videoReferenceStatus.data?.ok === true
        ? videoReferenceStatus.data.data
        : null;
    const config = dependencies.useBeatVideoConfigController({
      model: defaultModel,
      beat,
      episode,
      project,
      projectAspect: spec.renderAspect,
      selectedModel,
      showAdvancedVideoConfig,
      showReferenceVideoConfig,
      refetchStatus: videoReferenceStatus.refetch,
      updateBeat,
    });
    const assetItems = status?.assets.items ?? [];
    const modelReferenceAssets = useMemo(
      () =>
        showReferenceVideoConfig
          ? assetItems.filter((asset) => asset.media_type === "image")
          : assetItems,
      [assetItems, showReferenceVideoConfig],
    );
    const mention = dependencies.useVideoReferenceMentionController({
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
          : basicPrompt.prompt,
        promptKind: showPromptConfig ? "configured" : "basic",
        saveDraft: (draft) =>
          config.saveDraft(draft, { suppressSuccess: true }),
      });
    const media = dependencies.useVideoPaneMediaController({
      beatNumber: beat.beat_number,
      episode,
      project,
      state,
      videoActive: generation.started,
      videoModels,
      videoProgress: generation.progress,
      videoTask: generation.stream,
      videoUrl: beat.video_url,
      useVideoReferencePreview: showAdvancedVideoConfig,
    });

    return {
      assetOperations,
      beatNumber: beat.beat_number,
      config,
      fallbackAudioReady: Boolean(beat.audio_url),
      fallbackFrameReady: Boolean(beat.frame_url),
      generation,
      basicPrompt,
      media,
      mention,
      modelLabel: selectedModel?.label ?? defaultModel,
      modelReferenceAssets,
      projectAspect: spec.renderAspect,
      referenceCropAssets,
      savePending,
      showAdvancedVideoConfig,
      showReferenceVideoConfig,
      showReferenceDetails,
      sketchAspect: spec.sketchAspect,
      status,
    };
  };
}
