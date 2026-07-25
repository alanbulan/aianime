// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import { ThreeDDirectorDialog } from "@/features/viewer-kit/three-d/ThreeDDirectorDialog";
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
import {
  SketchSectionView,
  type PoolImage,
  useSketchSectionController,
} from "@/modules/production/public";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { useNavigateToAsset } from "@/hooks/use-assets-deep-link";
import { SketchPoseEditorDialog } from "./sketch-pose-editor-dialog";
import { SketchCropDialog } from "./sketch-crop-dialog";

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
  const { spec } = useProjectAspectRatio(project);
  const navigateToAsset = useNavigateToAsset(project);
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
  const directorStatus = useDirectorControlFrameStatus(
    project,
    episode,
    beat.beat_number,
  );
  const { data: scriptResponse } = useScript(project, episode);
  const { data: charactersResponse } = useCharacters(project);
  const { data: episodeResponse } = useEpisodeDetail(project, episode);
  const controller = useSketchSectionController({
    assignments,
    backgroundAnchors,
    beat,
    characters:
      charactersResponse?.ok === true ? charactersResponse.data : [],
    directorStatus,
    episode,
    episodePropMenu:
      episodeResponse?.ok === true
        ? (episodeResponse.data.prop_menu ?? [])
        : [],
    images,
    navigateToAsset,
    project,
    sketchAspect: spec.sketchAspect,
    sketchColors:
      scriptResponse?.ok === true && scriptResponse.data
        ? (scriptResponse.data.sketch_colors ?? {})
        : {},
    updateBackgroundAnchor,
  });
  const stageManifest = useBeatDirectorStageManifest(
    project,
    episode,
    beat.beat_number,
    controller.stageDialogOpen,
  );

  return (
    <SketchSectionView
      controller={controller}
      directorWorldPending={
        controller.stageDialogOpen && stageManifest.isLoading
      }
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
            manifest={stageManifest.data?.ok ? stageManifest.data.data : null}
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
