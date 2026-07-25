// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import { ThreeDDirectorDialog } from "@/features/viewer-kit/three-d/ThreeDDirectorDialog";
import type { Beat } from "@/modules/narrative_planning/public";
import {
  SketchSectionView,
  type PoolImage,
} from "@/modules/production/public";
import { SketchPoseEditorDialog } from "./sketch-pose-editor-dialog";
import { SketchCropDialog } from "./sketch-crop-dialog";
import { useSketchSectionController } from "./sketch-section-composition";

interface SketchSectionProps {
  beat: Beat;
  project: string;
  episode: number;
  images: PoolImage[];
  assignments: Record<string, string>;
  onPreview?: (url: string) => void;
}

export function SketchSection({
  beat,
  project,
  episode,
  images,
  assignments,
  onPreview,
}: SketchSectionProps) {
  const { t } = useTranslation();
  const controller = useSketchSectionController({
    assignments,
    beat,
    episode,
    images,
    project,
  });

  return (
    <SketchSectionView
      controller={controller}
      extraDialogs={
        <>
          <SketchPoseEditorDialog
            open={controller.poseEditorOpen}
            onOpenChange={controller.setPoseEditorOpen}
            project={project}
            episode={episode}
            beatNum={beat.beat_number}
          />
          <SketchCropDialog
            open={controller.cropOpen}
            onOpenChange={controller.setCropOpen}
            project={project}
            episode={episode}
            beatNum={beat.beat_number}
          />
          <ThreeDDirectorDialog
            open={controller.stageDialogOpen}
            onOpenChange={controller.setStageDialogOpen}
            manifest={controller.directorWorldManifest}
            title={`${t("viewer.threeD.beatDirectorWorld")} ${beat.beat_number}`}
            description={t("viewer.threeD.beatDirectorWorldDescription")}
            viewerPurpose="beat"
            autoCommitDirectorCombined
            onSubmitDirectorCombined={(_blob, meta) =>
              controller.commitDirectorCapture(meta)
            }
          />
        </>
      }
      onPreview={onPreview}
    />
  );
}
