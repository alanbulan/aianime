// Copyright (c) 2026 AI anime
import { useState } from "react";

import { ratioToCss } from "@/shared/aspect-ratio";
import type { VideoPaneController } from "@/modules/production/application/use-video-pane-controller";
import {
  videoReferenceCropAspectForMode,
  videoInputCropAspectForProjectAspect,
} from "@/modules/production/domain/video-reference-crop";
import {
  BeatVideoGenerationAction,
  BeatVideoGenerationConfirmDialog,
} from "@/modules/production/presentation/BeatVideoGenerationView";
import { BasicVideoPromptView } from "@/modules/production/presentation/BasicVideoPromptView";
import { VideoReferenceAssetCropDialog } from "@/modules/production/presentation/VideoReferenceAssetCropDialog";
import { VideoReferenceAudioTrimDialog } from "@/modules/production/presentation/VideoReferenceAudioTrimDialog";
import { BeatVideoConfigView } from "@/modules/production/presentation/BeatVideoConfigView";
import { VideoReferenceCropAssetsView } from "@/modules/production/presentation/VideoReferenceAssetsView";
import { VideoPaneMediaView } from "@/modules/production/presentation/VideoPaneMediaView";
import { VideoParamField } from "@/modules/production/presentation/VideoPaneParts";

const GRID_CLASS =
  "grid grid-cols-[auto_minmax(260px,1fr)] items-start gap-x-4 gap-y-3";
const PARAM_ACTION_CLASS =
  "!h-[30px] gap-1.5 rounded-[7px] border border-border bg-muted px-2.5 text-[12px] font-normal leading-none text-foreground/86 shadow-none transition-[background-color,border-color,color,transform] hover:border-foreground/25 hover:bg-accent hover:text-foreground active:scale-95 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/45 [&_svg]:size-3.5";

export interface VideoPaneViewProps {
  controller: VideoPaneController;
  showAudioMediaStatus: boolean;
}

export function VideoPaneView({
  controller,
  showAudioMediaStatus,
}: VideoPaneViewProps) {
  const [referencesOpen, setReferencesOpen] = useState(true);
  const {
    assetOperations,
    config,
    fallbackAudioReady,
    fallbackFrameReady,
    generation,
    basicPrompt,
    media,
    mention,
    modelLabel,
    modelReferenceAssets,
    projectAspect,
    referenceCropAssets,
    savePending,
    showAdvancedVideoConfig,
    showReferenceDetails,
    showReferenceVideoConfig,
    sketchAspect,
    status,
  } = controller;
  const showPromptConfig =
    showAdvancedVideoConfig || showReferenceVideoConfig;
  const draft = config.draft;

  return (
    <div className={GRID_CLASS}>
      <VideoPaneMediaView
        controller={media}
        frameAspectCss={ratioToCss(projectAspect)}
      />

      {!showPromptConfig && (
        <BasicVideoPromptView controller={basicPrompt} />
      )}

      {!showPromptConfig && (
        <div className="col-span-2 flex flex-wrap items-start gap-x-3 gap-y-2 pt-1">
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
        <VideoReferenceCropAssetsView
          aspectRatio={ratioToCss(sketchAspect)}
          assets={referenceCropAssets}
          controller={assetOperations}
          open={referencesOpen}
          onOpenChange={setReferencesOpen}
        />
      )}

      {showPromptConfig && (
        <BeatVideoConfigView
          assetOperations={assetOperations}
          assets={modelReferenceAssets}
          config={config}
          fallbackAudioReady={fallbackAudioReady}
          fallbackFrameReady={fallbackFrameReady}
          generation={generation}
          hasGeneratedVideo={media.hasGeneratedVideo}
          mediaCandidateCount={media.candidateCount}
          mention={mention}
          modelLabel={modelLabel}
          projectAspect={projectAspect}
          referencesOpen={referencesOpen}
          savePending={savePending}
          showAudioMediaStatus={showAudioMediaStatus}
          showAdvancedVideoConfig={showAdvancedVideoConfig}
          showReferenceVideoConfig={showReferenceVideoConfig}
          status={status}
          onReferencesOpenChange={setReferencesOpen}
        />
      )}

      <VideoReferenceAssetCropDialog
        intent={assetOperations.cropIntent}
        targetCropAspect={
          showAdvancedVideoConfig
            ? videoReferenceCropAspectForMode(
                draft.mode,
                draft.ratio,
                projectAspect,
              )
            : showReferenceVideoConfig
            ? draft.ratio
            : videoInputCropAspectForProjectAspect(projectAspect)
        }
        pending={assetOperations.cropPending}
        onOpenChange={(open) => {
          if (!open) assetOperations.closeCrop();
        }}
        onSave={assetOperations.saveCrop}
      />
      <VideoReferenceAudioTrimDialog
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
