// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";

import { ratioToCss } from "@/lib/aspect-ratio";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import {
  useUpdateBeat,
  type Beat,
} from "@/modules/narrative_planning/public";
import {
  isSeedanceReferenceCropBackend,
  useBeatVideoGenerationController,
  useLegacyVideoPromptController,
  useSeedance2AssetOperationsController,
  useSeedance2BeatStatus,
  useSeedance2ConfigController,
  useSeedance2MentionController,
  useVideoBackends,
  useVideoPaneMediaController,
  VideoPaneView,
} from "@/modules/production/public";
import type { BeatStageState } from "@/types/beat-state";

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
    changeDraft: videoConfig.changeDraft,
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
  return (
    <VideoPaneView
      assetOperations={assetOperations}
      beatNumber={beat.beat_number}
      config={videoConfig}
      fallbackAudioReady={Boolean(beat.audio_url)}
      fallbackFrameReady={Boolean(beat.frame_url)}
      frameAspectCss={frameAspectCss}
      generation={generation}
      legacyPrompt={legacyPrompt}
      media={mediaController}
      mention={mentionController}
      modelReferenceAssets={modelReferenceAssetItems}
      projectAspect={spec.renderAspect}
      referenceCropAspect={ratioToCss(spec.sketchAspect)}
      referenceCropAssets={referenceCropImageItems}
      referencesOpen={seedance2ReferencesOpen}
      savePending={updateBeat.isPending}
      showAudioMediaStatus={showAudioMediaStatus}
      showGrokVideoConfig={showGrokVideoConfig}
      showHappyHorseConfig={showHappyHorseConfig}
      showReferenceDetails={showReferenceDetails}
      showSeedance2Config={showSeedance2Config}
      status={seedance2StatusData}
      onReferencesOpenChange={setSeedance2ReferencesOpen}
    />
  );
}
