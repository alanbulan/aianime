// Copyright (c) 2026 AI anime
import { withImageCacheBust } from "@/features/canvas/application/imageData";
import { openPresetProjectionInMyCanvas } from "@/features/freezone/openPresetProjection";
import { useNavigateToAsset } from "@/hooks/use-assets-deep-link";
import { useNow } from "@/hooks/use-now";
import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import {
  useBeatBackgroundAnchors,
  useBeatDirectorStageManifest,
  useCharacters,
  useDirectorControlFrameStatus,
  useUpdateBeatBackgroundAnchor,
} from "@/modules/asset_world/public";
import {
  useEpisodeDetail,
  useScript,
} from "@/modules/narrative_planning/public";
import {
  createUseSketchSectionController,
  useDirectorControlToSketch,
  usePoolSelect,
  useRegenerateSketches,
  useSketchSettings,
  useUploadBeatImage,
} from "@/modules/production/public";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { useSeenPoolStore } from "@/stores/seen-pool-store";

export const useSketchSectionController = createUseSketchSectionController(
  {
    useBeatBackgroundAnchors,
    useBeatDirectorStageManifest,
    useCharacters,
    useDirectorControlFrameStatus,
    useDirectorControlToSketch,
    useEpisodeDetail,
    usePoolSelect,
    useRegenerateSketches,
    useScript,
    useSketchSettings,
    useUpdateBeatBackgroundAnchor,
    useUploadBeatImage,
  },
  {
    cacheBustImage: withImageCacheBust,
    downloadFile: (url, filename) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    },
    openSketchFreezone: (project, episode, beatNumber) =>
      openPresetProjectionInMyCanvas(project, {
        scope: "beat",
        episode,
        beat: beatNumber,
        primary_slot: "sketch",
      }),
    useAssetNavigation: useNavigateToAsset,
    useGenerationCreditCost,
    useNow,
    useProjectAspectRatio,
    useSeenSketchCandidates: (project, episode) => ({
      markSeen: useSeenPoolStore((state) => state.markSeen),
      seenIds: useSeenPoolStore(
        (state) => state.seen[`${project}:${episode}`],
      ),
    }),
  },
);
