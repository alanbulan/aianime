// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";

import { ThreeDDirectorDialog } from "@/features/viewer-kit/three-d/ThreeDDirectorDialog";
import {
  RenderSectionView,
  type PoolImage,
  useRenderSectionController,
} from "@/modules/production/public";
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
  const controller = useRenderSectionController({
    assignments,
    beat,
    episode,
    images,
    project,
  });

  return (
    <RenderSectionView
      controller={controller}
      extraDialogs={
        <ThreeDDirectorDialog
          open={controller.directorWorldOpen}
          onOpenChange={controller.setDirectorWorldOpen}
          manifest={controller.directorWorldManifest}
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
