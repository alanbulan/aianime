// Copyright (c) 2026 AI anime
import { openPresetProjectionInMyCanvas } from "@/features/freezone/openPresetProjection";
import { useNow } from "@/hooks/use-now";
import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import {
  useBeatBackgroundAnchors,
  useBeatDirectorStageManifest,
  useCropBeatBackgroundAnchor,
  useDirectorControlFrameStatus,
  useScenePlatePreview,
  useUpdateBeatBackgroundAnchor,
  useUploadBeatBackgroundAnchor,
} from "@/modules/asset_world/public";
import { createUseRenderSectionController } from "@/modules/production/application/use-render-section-controller";
import {
  usePoolSelect,
  useRegenerateRenderBeats,
  useRenderSettings,
  useUploadBeatImage,
} from "@/modules/production/composition";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { useSeenPoolStore } from "@/stores/seen-pool-store";

export const useRenderSectionController = createUseRenderSectionController(
  {
    useBeatBackgroundAnchors,
    useBeatDirectorStageManifest,
    useCropBeatBackgroundAnchor,
    useDirectorControlFrameStatus,
    usePoolSelect,
    useRegenerateRenderBeats,
    useRenderSettings,
    useScenePlatePreview,
    useUpdateBeatBackgroundAnchor,
    useUploadBeatBackgroundAnchor,
    useUploadBeatImage,
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
    useProjectAspectRatio,
    useSeenRenderCandidates: (project, episode) => ({
      markSeen: useSeenPoolStore((state) => state.markSeen),
      seenIds: useSeenPoolStore(
        (state) => state.seen[`${project}:${episode}`],
      ),
    }),
  },
);
