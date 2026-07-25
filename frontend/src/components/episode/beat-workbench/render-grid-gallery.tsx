// Copyright (c) 2026 AI anime
import {
  RenderGridCardView,
  RenderGridGalleryView,
  type RenderGridGroup,
  useRenderGridCardController,
  useRenderGridGalleryController,
} from "@/modules/production/public";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import type { Beat } from "@/modules/narrative_planning/public";

interface RenderGridGalleryProps {
  project: string;
  episode: number;
  beats?: Beat[];
}

export function RenderGridGallery({
  project,
  episode,
  beats = [],
}: RenderGridGalleryProps) {
  const { spec } = useProjectAspectRatio(project);
  const controller = useRenderGridGalleryController({
    beats,
    episode,
    project,
  });

  return (
    <RenderGridGalleryView controller={controller}>
      {controller.groups.map((group) => (
        <RenderGridCard
          key={group.gridIndex}
          project={project}
          episode={episode}
          group={group}
          cellAspect={spec.renderAspect}
        />
      ))}
    </RenderGridGalleryView>
  );
}

function RenderGridCard({
  project,
  episode,
  group,
  cellAspect,
}: {
  project: string;
  episode: number;
  group: RenderGridGroup;
  cellAspect: string;
}) {
  const controller = useRenderGridCardController({
    cellAspect,
    episode,
    group,
    project,
  });

  return <RenderGridCardView controller={controller} />;
}
