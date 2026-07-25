// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BeatVideoGenerationController } from "@/modules/production/application/use-beat-video-generation-controller";
import type { LegacyVideoPromptController } from "@/modules/production/application/use-legacy-video-prompt-controller";
import type { Seedance2AssetOperationsController } from "@/modules/production/application/use-seedance2-asset-operations-controller";
import type { Seedance2ConfigController } from "@/modules/production/application/use-seedance2-config-controller";
import type { Seedance2MentionController } from "@/modules/production/application/use-seedance2-mention-controller";
import type { VideoPaneMediaController } from "@/modules/production/application/use-video-pane-media-controller";
import {
  seedance2CropAspectForMode,
  videoInputCropAspectForProjectAspect,
} from "@/modules/production/domain/seedance2-crop";
import type {
  Seedance2AssetItem,
  Seedance2BeatStatus,
} from "@/modules/production/domain/seedance2-panel";
import {
  clampDuration,
  normalizeHappyHorseMode,
  normalizeHappyHorseRatio,
  normalizeSeedance2Resolution,
} from "@/modules/production/domain/video-config";
import {
  BeatVideoGenerationAction,
  BeatVideoGenerationConfirmDialog,
} from "@/modules/production/presentation/BeatVideoGenerationView";
import { LegacyVideoPromptView } from "@/modules/production/presentation/LegacyVideoPromptView";
import { Seedance2AssetCropDialog } from "@/modules/production/presentation/Seedance2AssetCropDialog";
import { Seedance2AudioTrimDialog } from "@/modules/production/presentation/Seedance2AudioTrimDialog";
import { Seedance2ConfigView } from "@/modules/production/presentation/Seedance2ConfigView";
import { Seedance2ReferenceCropAssetsView } from "@/modules/production/presentation/Seedance2ReferenceAssetsView";
import { VideoPaneMediaView } from "@/modules/production/presentation/VideoPaneMediaView";
import { VideoParamField } from "@/modules/production/presentation/VideoPaneParts";

const GRID_CLASS =
  "grid grid-cols-[auto_minmax(260px,1fr)] items-start gap-x-4 gap-y-3";
const PARAM_CONTROL_CLASS =
  "!h-[30px] rounded-[7px] border border-border bg-muted px-2.5 text-[12px] font-normal leading-none text-foreground/86 shadow-none transition-colors hover:border-foreground/25 hover:bg-accent focus-visible:border-primary/45 focus-visible:ring-primary/10 [&>svg]:size-3.5";
const PARAM_ACTION_CLASS =
  "!h-[30px] gap-1.5 rounded-[7px] border border-border bg-muted px-2.5 text-[12px] font-normal leading-none text-foreground/86 shadow-none transition-[background-color,border-color,color,transform] hover:border-foreground/25 hover:bg-accent hover:text-foreground active:scale-95 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/45 [&_svg]:size-3.5";

export interface VideoPaneViewProps {
  assetOperations: Seedance2AssetOperationsController;
  beatNumber: number;
  config: Seedance2ConfigController;
  fallbackAudioReady: boolean;
  fallbackFrameReady: boolean;
  frameAspectCss: string;
  generation: BeatVideoGenerationController;
  legacyPrompt: LegacyVideoPromptController;
  media: VideoPaneMediaController;
  mention: Seedance2MentionController;
  modelReferenceAssets: Seedance2AssetItem[];
  projectAspect: "2:3" | "16:9";
  referenceCropAspect: string;
  referenceCropAssets: Seedance2AssetItem[];
  referencesOpen: boolean;
  savePending: boolean;
  showAudioMediaStatus: boolean;
  showGrokVideoConfig: boolean;
  showHappyHorseConfig: boolean;
  showReferenceDetails: boolean;
  showSeedance2Config: boolean;
  status: Seedance2BeatStatus | null;
  onReferencesOpenChange(open: boolean): void;
}

export function VideoPaneView({
  assetOperations,
  beatNumber,
  config,
  fallbackAudioReady,
  fallbackFrameReady,
  frameAspectCss,
  generation,
  legacyPrompt,
  media,
  mention,
  modelReferenceAssets,
  projectAspect,
  referenceCropAspect,
  referenceCropAssets,
  referencesOpen,
  savePending,
  showAudioMediaStatus,
  showGrokVideoConfig,
  showHappyHorseConfig,
  showReferenceDetails,
  showSeedance2Config,
  status,
  onReferencesOpenChange,
}: VideoPaneViewProps) {
  const { t } = useTranslation();
  const showPromptConfig =
    showSeedance2Config || showHappyHorseConfig || showGrokVideoConfig;
  const draft = config.draft;

  return (
    <div className={GRID_CLASS}>
      <VideoPaneMediaView
        controller={media}
        frameAspectCss={frameAspectCss}
      />

      {!showPromptConfig && (
        <LegacyVideoPromptView
          className={showHappyHorseConfig ? "order-3" : undefined}
          controller={legacyPrompt}
        />
      )}

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
                htmlFor={`happyhorse-${beatNumber}-mode`}
              >
                <Select
                  value={draft.mode}
                  onValueChange={(value) =>
                    config.updateMode(normalizeHappyHorseMode(value))
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beatNumber}-mode`}
                    className={cn("w-28", PARAM_CONTROL_CLASS)}
                  >
                    <span
                      data-slot="select-value"
                      className="flex flex-1 items-center gap-1.5 text-left"
                    >
                      {t(
                        `episode.workbench.video.seedance2ModeLabels.${normalizeHappyHorseMode(
                          draft.mode,
                        )}`,
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="first_frame">
                      {t(
                        "episode.workbench.video.seedance2ModeLabels.first_frame",
                      )}
                    </SelectItem>
                    <SelectItem value="multimodal_reference">
                      {t(
                        "episode.workbench.video.seedance2ModeLabels.multimodal_reference",
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.duration")}
                htmlFor={`happyhorse-${beatNumber}-duration`}
              >
                <Input
                  id={`happyhorse-${beatNumber}-duration`}
                  aria-label={t("episode.workbench.video.duration")}
                  type="number"
                  min={config.seedance2DurationBounds.min}
                  max={config.seedance2DurationBounds.max}
                  value={draft.duration}
                  onChange={(event) =>
                    config.updateDraft(
                      "duration",
                      clampDuration(
                        event.target.value,
                        config.seedance2DurationBounds,
                      ),
                    )
                  }
                  className={cn("w-20", PARAM_CONTROL_CLASS)}
                />
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.resolution")}
                htmlFor={`happyhorse-${beatNumber}-resolution`}
              >
                <Select
                  value={draft.resolution}
                  onValueChange={(value) =>
                    config.updateDraft(
                      "resolution",
                      normalizeSeedance2Resolution(
                        value,
                        config.happyHorseResolutionOptions[0],
                      ),
                    )
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beatNumber}-resolution`}
                    className={cn("w-24", PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {config.happyHorseResolutionOptions.map((resolution) => (
                      <SelectItem key={resolution} value={resolution}>
                        {resolution}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.ratio")}
                htmlFor={`happyhorse-${beatNumber}-ratio`}
              >
                <Select
                  value={draft.ratio}
                  onValueChange={(value) =>
                    config.updateDraft(
                      "ratio",
                      normalizeHappyHorseRatio(value),
                    )
                  }
                >
                  <SelectTrigger
                    id={`happyhorse-${beatNumber}-ratio`}
                    className={cn("w-24", PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {config.happyHorseRatioOptions.map((ratio) => (
                      <SelectItem key={ratio} value={ratio}>
                        {ratio}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </VideoParamField>
            </>
          )}
          {config.isSeedance15ProConfig && (
            <>
              <VideoParamField
                label={t("episode.workbench.video.duration")}
                htmlFor={`sd15-${beatNumber}-duration`}
              >
                <Input
                  id={`sd15-${beatNumber}-duration`}
                  aria-label={t("episode.workbench.video.duration")}
                  type="number"
                  min={config.seedance15DurationBounds.min}
                  max={config.seedance15DurationBounds.max}
                  value={config.seedance15Duration}
                  onChange={(event) =>
                    config.setSeedance15Duration(
                      clampDuration(
                        event.target.value,
                        config.seedance15DurationBounds,
                      ),
                    )
                  }
                  className={cn("w-20", PARAM_CONTROL_CLASS)}
                />
              </VideoParamField>
              <VideoParamField
                label={t("episode.workbench.video.resolution")}
                htmlFor={`sd15-${beatNumber}-resolution`}
              >
                <Select
                  value={config.seedance15Resolution}
                  onValueChange={(value) =>
                    config.setSeedance15Resolution(
                      normalizeSeedance2Resolution(
                        value,
                        config.seedance2ResolutionOptions[0],
                      ),
                    )
                  }
                >
                  <SelectTrigger
                    id={`sd15-${beatNumber}-resolution`}
                    className={cn("w-24", PARAM_CONTROL_CLASS)}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {config.seedance2ResolutionOptions.map((resolution) => (
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
              className={PARAM_ACTION_CLASS}
              controller={generation}
              hasGeneratedVideo={media.hasGeneratedVideo}
            />
          </VideoParamField>
        </div>
      )}

      {!showPromptConfig && showReferenceDetails && (
        <Seedance2ReferenceCropAssetsView
          aspectRatio={referenceCropAspect}
          assets={referenceCropAssets}
          className={showHappyHorseConfig ? "order-1" : undefined}
          controller={assetOperations}
          open={referencesOpen}
          onOpenChange={onReferencesOpenChange}
        />
      )}

      {showPromptConfig && (
        <Seedance2ConfigView
          assetOperations={assetOperations}
          assets={modelReferenceAssets}
          config={config}
          fallbackAudioReady={fallbackAudioReady}
          fallbackFrameReady={fallbackFrameReady}
          generation={generation}
          hasGeneratedVideo={media.hasGeneratedVideo}
          mediaCandidateCount={media.candidateCount}
          mention={mention}
          projectAspect={projectAspect}
          referencesOpen={referencesOpen}
          savePending={savePending}
          showAudioMediaStatus={showAudioMediaStatus}
          showGrokVideoConfig={showGrokVideoConfig}
          showHappyHorseConfig={showHappyHorseConfig}
          showSeedance2Config={showSeedance2Config}
          status={status}
          onReferencesOpenChange={onReferencesOpenChange}
        />
      )}

      <Seedance2AssetCropDialog
        intent={assetOperations.cropIntent}
        targetCropAspect={
          showSeedance2Config
            ? seedance2CropAspectForMode(
                draft.mode,
                draft.ratio,
                projectAspect,
              )
            : videoInputCropAspectForProjectAspect(projectAspect)
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
        hasGeneratedVideo={media.hasGeneratedVideo}
      />
    </div>
  );
}
