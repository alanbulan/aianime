// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ratioToCss } from "@/lib/aspect-ratio";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  useUpdateBeat,
  type Beat,
} from "@/modules/narrative_planning/public";
import {
  BeatVideoGenerationAction,
  BeatVideoGenerationConfirmDialog,
  clampDuration,
  isSeedanceReferenceCropBackend,
  normalizeHappyHorseMode,
  normalizeHappyHorseRatio,
  normalizeSeedance2Resolution,
  LegacyVideoPromptView,
  Seedance2AssetCropDialog,
  Seedance2AudioTrimDialog,
  Seedance2ConfigView,
  Seedance2ReferenceCropAssetsView,
  seedance2CropAspectForMode,
  useBeatVideoGenerationController,
  useLegacyVideoPromptController,
  useSeedance2AssetOperationsController,
  useSeedance2BeatStatus,
  useSeedance2ConfigController,
  useSeedance2MentionController,
  useVideoBackends,
  useVideoPaneMediaController,
  VideoPaneMediaView,
  VideoParamField,
  videoInputCropAspectForProjectAspect,
} from "@/modules/production/public";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BeatStageState } from "@/types/beat-state";

const VIDEO_GRID_CLASS =
  "grid grid-cols-[auto_minmax(260px,1fr)] items-start gap-x-4 gap-y-3";
const VIDEO_PARAM_CONTROL_CLASS =
  "!h-[30px] rounded-[7px] border border-border bg-muted px-2.5 text-[12px] font-normal leading-none text-foreground/86 shadow-none transition-colors hover:border-foreground/25 hover:bg-accent focus-visible:border-primary/45 focus-visible:ring-primary/10 [&>svg]:size-3.5";
const VIDEO_PARAM_ACTION_CLASS =
  "!h-[30px] gap-1.5 rounded-[7px] border border-border bg-muted px-2.5 text-[12px] font-normal leading-none text-foreground/86 shadow-none transition-[background-color,border-color,color,transform] hover:border-foreground/25 hover:bg-accent hover:text-foreground active:scale-95 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/45 [&_svg]:size-3.5";
interface VideoPaneProps {
  beat: Beat;
  project: string;
  episode: number;
  state: BeatStageState;
  /** Episode-level video backend selected in the video panel. */
  defaultBackend: string;
  showAudioMediaStatus?: boolean;
}

/**
 * 视频 sub-tab — first-frame preview + video preview + per-beat regen.
 * Per-beat backend override is deferred (see v3 spec P4 follow-up).
 */
export function VideoPane({
  beat,
  project,
  episode,
  state,
  defaultBackend,
  showAudioMediaStatus = true,
}: VideoPaneProps) {
  const { t } = useTranslation();
  const { spec } = useProjectAspectRatio(project);
  const frameAspectCss = ratioToCss(spec.renderAspect);
  const updateBeat = useUpdateBeat(project, episode);
  const legacyPrompt = useLegacyVideoPromptController({
    beat,
    episode,
    project,
    updateBeat: (command) => updateBeat.mutateAsync(command),
  });
  const { data: videoBackendsRes } = useVideoBackends(project);
  const videoBackends = videoBackendsRes?.data ?? [];
  const assetOperations = useSeedance2AssetOperationsController({
    beatNumber: beat.beat_number,
    episode,
    project,
  });
  const [seedance2ReferencesOpen, setSeedance2ReferencesOpen] = useState(true);
  const selectedBackend = videoBackends.find((b) => b.value === defaultBackend);
  const showSeedance2Config = selectedBackend?.is_seedance2 === true;
  const showHappyHorseConfig = selectedBackend?.is_happyhorse === true;
  const showGrokVideoConfig = selectedBackend?.is_grok_video === true;
  const showPromptConfig =
    showSeedance2Config || showHappyHorseConfig || showGrokVideoConfig;
  const showReferenceDetails =
    showSeedance2Config ||
    showHappyHorseConfig ||
    showGrokVideoConfig ||
    isSeedanceReferenceCropBackend(defaultBackend);
  const seedance2Status = useSeedance2BeatStatus(
    project,
    episode,
    beat.beat_number,
    showReferenceDetails,
  );
  const seedance2StatusData =
    seedance2Status.data?.ok === true ? seedance2Status.data.data : null;
  const videoConfig = useSeedance2ConfigController({
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
    updateBeat: updateBeat.mutateAsync,
  });
  const seedance2Draft = videoConfig.draft;
  const seedance2ResolutionOptions = videoConfig.seedance2ResolutionOptions;
  const seedance2DurationBounds = videoConfig.seedance2DurationBounds;
  const happyHorseResolutionOptions =
    videoConfig.happyHorseResolutionOptions;
  const happyHorseRatioOptions = videoConfig.happyHorseRatioOptions;
  const isSd15ProConfig = videoConfig.isSeedance15ProConfig;
  const sd15DurationBounds = videoConfig.seedance15DurationBounds;
  const sd15Resolution = videoConfig.seedance15Resolution;
  const sd15Duration = videoConfig.seedance15Duration;
  const setSd15Resolution = videoConfig.setSeedance15Resolution;
  const setSd15Duration = videoConfig.setSeedance15Duration;
  const changeSeedance2Draft = videoConfig.changeDraft;
  const updateSeedance2Draft = videoConfig.updateDraft;
  const updateSeedance2Mode = videoConfig.updateMode;
  const seedance2AssetItems = seedance2StatusData?.assets.items ?? [];
  const modelReferenceAssetItems = useMemo(
    () =>
      showHappyHorseConfig || showGrokVideoConfig
        ? seedance2AssetItems.filter((asset) => asset.media_type === "image")
        : seedance2AssetItems,
    [seedance2AssetItems, showGrokVideoConfig, showHappyHorseConfig],
  );
  const mentionController = useSeedance2MentionController({
    assets: modelReferenceAssetItems,
    beatNumber: beat.beat_number,
    changeDraft: changeSeedance2Draft,
    draft: seedance2Draft,
    enabled: showPromptConfig,
  });
  const referenceCropImageItems = useMemo(
    () => {
      const imageAssets = seedance2AssetItems.filter(
        (asset) =>
          asset.media_type === "image" &&
          asset.exists !== false &&
          Boolean(asset.url || asset.path),
      );
      if (showSeedance2Config || showHappyHorseConfig || showGrokVideoConfig) {
        return imageAssets;
      }
      return imageAssets.filter((asset) => asset.key === "first_frame");
    },
    [seedance2AssetItems, showGrokVideoConfig, showHappyHorseConfig, showSeedance2Config],
  );
  const generation = useBeatVideoGenerationController({
    applyNormalizedDraft: videoConfig.applyDraft,
    beatNumber: beat.beat_number,
    episode,
    generationInput: videoConfig.generationInput,
    project,
    prompt: showPromptConfig
      ? seedance2Draft.final_prompt
      : legacyPrompt.prompt,
    promptKind: showPromptConfig ? "seedance2" : "legacy",
    saveDraft: (draft) =>
      videoConfig.saveDraft(draft, { suppressSuccess: true }),
  });
  const mediaController = useVideoPaneMediaController({
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
  const hasGeneratedVideo = mediaController.hasGeneratedVideo;
  return (
    <div className={VIDEO_GRID_CLASS}>
      <VideoPaneMediaView
        controller={mediaController}
        frameAspectCss={frameAspectCss}
      />

      {!showPromptConfig && (
        <LegacyVideoPromptView
          className={showHappyHorseConfig ? "order-3" : undefined}
          controller={legacyPrompt}
        />
      )}

      {/* Full-width action row. Seedance2 keeps its generate action after config. */}
      {!showPromptConfig && (
        <div
          className={cn(
            "col-span-2 flex flex-wrap items-start gap-x-3 gap-y-2 pt-1",
            showHappyHorseConfig && "order-2",
          )}
        >
          {showHappyHorseConfig && (
            <>
              <VideoParamField
                label={t("episode.workbench.video.mode")}
                htmlFor={`happyhorse-${beat.beat_number}-mode`}
              >
                <Select
                  value={seedance2Draft.mode}
                  onValueChange={(v) =>
                    updateSeedance2Mode(normalizeHappyHorseMode(v))
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beat.beat_number}-mode`}
                    className={cn("w-28", VIDEO_PARAM_CONTROL_CLASS)}
                  >
                    <span
                      data-slot="select-value"
                      className="flex flex-1 items-center gap-1.5 text-left"
                    >
                      {t(
                        `episode.workbench.video.seedance2ModeLabels.${normalizeHappyHorseMode(
                          seedance2Draft.mode,
                        )}`,
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="first_frame">
                      {t("episode.workbench.video.seedance2ModeLabels.first_frame")}
                    </SelectItem>
                    <SelectItem value="multimodal_reference">
                      {t("episode.workbench.video.seedance2ModeLabels.multimodal_reference")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.duration")}
                htmlFor={`happyhorse-${beat.beat_number}-duration`}
              >
                <Input
                  id={`happyhorse-${beat.beat_number}-duration`}
                  aria-label={t("episode.workbench.video.duration")}
                  type="number"
                  min={seedance2DurationBounds.min}
                  max={seedance2DurationBounds.max}
                  value={seedance2Draft.duration}
                  onChange={(e) =>
                    updateSeedance2Draft(
                      "duration",
                      clampDuration(e.target.value, seedance2DurationBounds),
                    )
                  }
                  className={cn("w-20", VIDEO_PARAM_CONTROL_CLASS)}
                />
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.resolution")}
                htmlFor={`happyhorse-${beat.beat_number}-resolution`}
              >
                <Select
                  value={seedance2Draft.resolution}
                  onValueChange={(v) =>
                    updateSeedance2Draft(
                      "resolution",
                      normalizeSeedance2Resolution(v, happyHorseResolutionOptions[0]),
                    )
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beat.beat_number}-resolution`}
                    className={cn("w-24", VIDEO_PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {happyHorseResolutionOptions.map((resolution) => (
                      <SelectItem key={resolution} value={resolution}>
                        {resolution}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.ratio")}
                htmlFor={`happyhorse-${beat.beat_number}-ratio`}
              >
                <Select
                  value={seedance2Draft.ratio}
                  onValueChange={(v) =>
                    updateSeedance2Draft("ratio", normalizeHappyHorseRatio(v))
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beat.beat_number}-ratio`}
                    className={cn("w-24", VIDEO_PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {happyHorseRatioOptions.map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ratio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VideoParamField>
            </>
          )}
          {isSd15ProConfig && (
            <>
              <VideoParamField
                label={t("episode.workbench.video.duration")}
                htmlFor={`sd15-${beat.beat_number}-duration`}
              >
                <Input
                  id={`sd15-${beat.beat_number}-duration`}
                  aria-label={t("episode.workbench.video.duration")}
                  type="number"
                  min={sd15DurationBounds.min}
                  max={sd15DurationBounds.max}
                  value={sd15Duration}
                  onChange={(e) =>
                    setSd15Duration(
                      clampDuration(e.target.value, sd15DurationBounds),
                    )
                  }
                  className={cn("w-20", VIDEO_PARAM_CONTROL_CLASS)}
                />
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.resolution")}
                htmlFor={`sd15-${beat.beat_number}-resolution`}
              >
                <Select
                  value={sd15Resolution}
                  onValueChange={(v) =>
                    setSd15Resolution(
                      normalizeSeedance2Resolution(
                        v,
                        seedance2ResolutionOptions[0],
                      ),
                    )
                  }
                >
                  <SelectTrigger
                    id={`sd15-${beat.beat_number}-resolution`}
                    className={cn("w-24", VIDEO_PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {seedance2ResolutionOptions.map((resolution) => (
                      <SelectItem key={resolution} value={resolution}>
                        {resolution}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VideoParamField>
            </>
          )}
          <VideoParamField label="" hiddenLabel>
            <BeatVideoGenerationAction
              className={VIDEO_PARAM_ACTION_CLASS}
              controller={generation}
              hasGeneratedVideo={hasGeneratedVideo}
            />
          </VideoParamField>
        </div>
      )}

      {!showPromptConfig && showReferenceDetails && (
        <Seedance2ReferenceCropAssetsView
          aspectRatio={ratioToCss(spec.sketchAspect)}
          assets={referenceCropImageItems}
          className={showHappyHorseConfig ? "order-1" : undefined}
          controller={assetOperations}
          open={seedance2ReferencesOpen}
          onOpenChange={setSeedance2ReferencesOpen}
        />
      )}

      {showPromptConfig && (
        <Seedance2ConfigView
          assetOperations={assetOperations}
          assets={modelReferenceAssetItems}
          config={videoConfig}
          fallbackAudioReady={Boolean(beat.audio_url)}
          fallbackFrameReady={Boolean(beat.frame_url)}
          generation={generation}
          hasGeneratedVideo={hasGeneratedVideo}
          mediaCandidateCount={mediaController.candidateCount}
          mention={mentionController}
          projectAspect={spec.renderAspect}
          referencesOpen={seedance2ReferencesOpen}
          savePending={updateBeat.isPending}
          showAudioMediaStatus={showAudioMediaStatus}
          showGrokVideoConfig={showGrokVideoConfig}
          showHappyHorseConfig={showHappyHorseConfig}
          showSeedance2Config={showSeedance2Config}
          status={seedance2StatusData}
          onReferencesOpenChange={setSeedance2ReferencesOpen}
        />
      )}

      <Seedance2AssetCropDialog
        intent={assetOperations.cropIntent}
        targetCropAspect={
          showSeedance2Config
            ? seedance2CropAspectForMode(
                seedance2Draft.mode,
                seedance2Draft.ratio,
                spec.renderAspect,
              )
            : videoInputCropAspectForProjectAspect(spec.renderAspect)
        }
        pending={assetOperations.cropPending}
        onOpenChange={(open) => {
          if (!open) assetOperations.closeCrop();
        }}
        onSave={assetOperations.saveCrop}
      />
      <Seedance2AudioTrimDialog
        asset={assetOperations.trimAsset}
        start={assetOperations.trimStart}
        duration={assetOperations.trimDuration}
        pending={assetOperations.trimPending}
        onStartChange={assetOperations.setTrimStart}
        onDurationChange={assetOperations.setTrimDuration}
        onOpenChange={(open) => {
          if (!open) assetOperations.closeTrim();
        }}
        onSave={assetOperations.saveTrim}
      />

      <BeatVideoGenerationConfirmDialog
        controller={generation}
        hasGeneratedVideo={hasGeneratedVideo}
      />
    </div>
  );
}
