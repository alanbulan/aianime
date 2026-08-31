// Copyright (c) 2026 AI anime
import { createElement, Fragment } from "react";
import { useTranslation } from "react-i18next";

import { withImageCacheBust } from "@/shared/media/image-cache";
import { openPresetProjectionInMyCanvas } from "@/modules/creative_canvas/public";
import { ThreeDDirectorDialog } from "@/features/viewer-kit/public";
import { useNavigateToAsset } from "@/modules/asset_world/public";
import { useNow } from "@/shared/hooks/use-now";
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
  type Beat,
} from "@/modules/narrative_planning/public";
import { createUseSketchSectionController } from "@/modules/production/application/use-sketch-section-controller";
import {
  useDirectorControlToSketch,
  usePoolDelete,
  usePoolSelect,
  useRegenerateSketches,
  useSketchCropDialogController,
  useSketchPoseEditorDialogController,
  useUploadBeatImage,
} from "@/modules/production/composition";
import type { PoolImage } from "@/modules/production/domain/image-pool";
import { SketchCropDialogView } from "@/modules/production/presentation/SketchCropDialogView";
import { SketchPoseEditorDialogView } from "@/modules/production/presentation/SketchPoseEditorDialogView";
import { SketchSectionView } from "@/modules/production/presentation/SketchSectionView";
import { useProjectAspectRatio } from "@/shared/stores/aspect-ratio-store";
import { useSeenPoolStore } from "@/shared/stores/seen-pool-store";

interface SketchEditDialogProps {
  beatNum: number;
  episode: number;
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
}

function SketchCropDialog({
  beatNum,
  episode,
  onOpenChange,
  open,
  project,
}: SketchEditDialogProps) {
  const controller = useSketchCropDialogController({
    beatNum,
    episode,
    onOpenChange,
    open,
    project,
  });

  return createElement(SketchCropDialogView, controller);
}

function SketchPoseEditorDialog({
  beatNum,
  episode,
  onOpenChange,
  open,
  project,
}: SketchEditDialogProps) {
  const controller = useSketchPoseEditorDialogController({
    beatNum,
    episode,
    onOpenChange,
    open,
    project,
  });

  return createElement(SketchPoseEditorDialogView, { controller });
}

const useSketchSectionController = createUseSketchSectionController(
  {
    useBeatBackgroundAnchors,
    useBeatDirectorStageManifest,
    useCharacters,
    useDirectorControlFrameStatus,
    useDirectorControlToSketch,
    useEpisodeDetail,
    usePoolDelete,
    usePoolSelect,
    useRegenerateSketches,
    useScript,
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

export interface SketchSectionProps {
  assignments: Record<string, string>;
  beat: Beat;
  episode: number;
  images: PoolImage[];
  onPreview?(url: string): void;
  project: string;
}

export function SketchSection({
  assignments,
  beat,
  episode,
  images,
  onPreview,
  project,
}: SketchSectionProps) {
  const { t } = useTranslation();
  const controller = useSketchSectionController({
    assignments,
    beat,
    episode,
    images,
    project,
  });
  const extraDialogs = createElement(
    Fragment,
    null,
    createElement(SketchCropDialog, {
      beatNum: beat.beat_number,
      episode,
      onOpenChange: controller.setCropOpen,
      open: controller.cropOpen,
      project,
    }),
    createElement(SketchPoseEditorDialog, {
      beatNum: beat.beat_number,
      episode,
      onOpenChange: controller.setPoseEditorOpen,
      open: controller.poseEditorOpen,
      project,
    }),
    createElement(ThreeDDirectorDialog, {
      autoCommitDirectorCombined: true,
      description: t("viewer.threeD.beatDirectorWorldDescription"),
      manifest: controller.directorWorldManifest,
      onOpenChange: controller.setStageDialogOpen,
      onSubmitDirectorCombined: (_blob, meta) =>
        controller.commitDirectorCapture(meta),
      open: controller.stageDialogOpen,
      title: `${t("viewer.threeD.beatDirectorWorld")} ${beat.beat_number}`,
      viewerPurpose: "beat",
    }),
  );

  return createElement(SketchSectionView, {
    controller,
    extraDialogs,
    onPreview,
  });
}
