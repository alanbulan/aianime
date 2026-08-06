// Copyright (c) 2026 AI anime
import { createElement } from "react";
import { useTranslation } from "react-i18next";

import { openPresetProjectionInMyCanvas } from "@/modules/creative_canvas/public";
import { ThreeDDirectorDialog } from "@/features/viewer-kit/public";
import { useNow } from "@/shared/hooks/use-now";
import { useGenerationCreditCost } from "@/modules/model_usage/public";
import {
  useBeatBackgroundAnchors,
  useBeatDirectorStageManifest,
  useCropBeatBackgroundAnchor,
  useDirectorControlFrameStatus,
  useScenePlatePreview,
  useUpdateBeatBackgroundAnchor,
  useUploadBeatBackgroundAnchor,
} from "@/modules/asset_world/public";
import type { Beat } from "@/modules/narrative_planning/public";
import { createUseRenderSectionController } from "@/modules/production/application/use-render-section-controller";
import {
  usePoolSelect,
  useRegenerateRenderBeats,
  useRenderSettings,
  useUploadBeatImage,
} from "@/modules/production/composition";
import type { PoolImage } from "@/modules/production/domain/image-pool";
import { RenderSectionView } from "@/modules/production/presentation/RenderSectionView";
import { useProjectAspectRatio } from "@/shared/stores/aspect-ratio-store";
import { useSeenPoolStore } from "@/shared/stores/seen-pool-store";

const useRenderSectionController = createUseRenderSectionController(
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

export interface RenderSectionProps {
  assignments: Record<string, string>;
  beat: Beat;
  episode: number;
  images: PoolImage[];
  onPreview?(url: string): void;
  project: string;
}

export function RenderSection({
  assignments,
  beat,
  episode,
  images,
  onPreview,
  project,
}: RenderSectionProps) {
  const { t } = useTranslation();
  const controller = useRenderSectionController({
    assignments,
    beat,
    episode,
    images,
    project,
  });
  const extraDialogs = createElement(ThreeDDirectorDialog, {
    autoCommitDirectorCombined: true,
    description: t(
      "episode.workbench.render.backgroundDirectorWorldDescription",
    ),
    manifest: controller.directorWorldManifest,
    onOpenChange: controller.setDirectorWorldOpen,
    onSubmitDirectorCombined: (_blob, meta) =>
      controller.commitDirectorCapture(meta),
    open: controller.directorWorldOpen,
    title: t("episode.workbench.render.backgroundOpen360"),
    viewerPurpose: "beat",
  });

  return createElement(RenderSectionView, {
    controller,
    extraDialogs,
    onPreview,
  });
}
