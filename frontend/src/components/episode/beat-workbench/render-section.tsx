// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import {
  useBeatBackgroundAnchors,
  useBeatDirectorStageManifest,
  useCropBeatBackgroundAnchor,
  useScenePlatePreview,
  useUpdateBeatBackgroundAnchor,
  useUploadBeatBackgroundAnchor,
} from "@/modules/asset_world/public";
import { ThreeDDirectorDialog } from "@/features/viewer-kit/three-d/ThreeDDirectorDialog";
import {
  RenderSectionView,
  type PoolImage,
  useRenderSectionController,
} from "@/modules/production/public";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import type { Beat } from "@/modules/narrative_planning/public";

interface RenderSectionProps {
  beat: Beat;
  project: string;
  episode: number;
  images: PoolImage[];
  assignments: Record<string, string>;
  onPreview?: (url: string) => void;
}

export function RenderSection({
  beat,
  project,
  episode,
  images,
  assignments,
  onPreview,
}: RenderSectionProps) {
  const { t } = useTranslation();
  const { spec: aspectSpec } = useProjectAspectRatio(project);
  const renderSceneId =
    beat.scene_ref?.scene_id?.trim() || beat.location?.trim() || "";
  const renderVariantId = beat.scene_ref?.variant_id?.trim() || "";
  const scenePlatePreview = useScenePlatePreview(
    project,
    renderSceneId,
    renderVariantId,
    beat.time_of_day ?? "",
  );
  const backgroundAnchors = useBeatBackgroundAnchors(
    project,
    episode,
    beat.beat_number,
  );
  const updateBackgroundAnchor = useUpdateBeatBackgroundAnchor(
    project,
    episode,
    beat.beat_number,
  );
  const cropBackgroundAnchor = useCropBeatBackgroundAnchor(
    project,
    episode,
    beat.beat_number,
  );
  const uploadBackgroundAnchor = useUploadBeatBackgroundAnchor(
    project,
    episode,
    beat.beat_number,
  );
  const controller = useRenderSectionController({
    assignments,
    backgroundAnchors,
    beat,
    cropBackgroundAnchor,
    episode,
    images,
    project,
    renderAspect: aspectSpec.renderAspect,
    renderCropRatio: aspectSpec.ratioValue,
    scenePlatePreview,
    updateBackgroundAnchor,
    uploadBackgroundAnchor,
  });
  const stageManifest = useBeatDirectorStageManifest(
    project,
    episode,
    beat.beat_number,
    controller.directorWorldOpen,
  );

  return (
    <RenderSectionView
      controller={controller}
      extraDialogs={
        <ThreeDDirectorDialog
          open={controller.directorWorldOpen}
          onOpenChange={controller.setDirectorWorldOpen}
          manifest={stageManifest.data?.ok ? stageManifest.data.data : null}
          title={t("episode.workbench.render.backgroundOpen360")}
          description={t(
            "episode.workbench.render.backgroundDirectorWorldDescription",
          )}
          viewerPurpose="beat"
          autoCommitDirectorCombined
          onSubmitDirectorCombined={(_blob, meta) =>
            controller.commitDirectorCapture(meta)
          }
        />
      }
      onPreview={onPreview}
    />
  );
}
