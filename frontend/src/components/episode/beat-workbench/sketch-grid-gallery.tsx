// Copyright (c) 2026 AI anime
import {
  SketchGridCardView,
  SketchGridGalleryView,
  type SketchAspectRatio,
  type SketchGridGroup,
  useSketchGridCardController,
  useSketchGridGalleryController,
} from "@/modules/production/public";
import type { Beat } from "@/modules/narrative_planning/public";

interface SketchGridGalleryProps {
  project: string;
  episode: number;
  beats?: Beat[];
  aspectRatio?: SketchAspectRatio;
  imageGenerationSelection?: string;
}

export function SketchGridGallery({
  project,
  episode,
  beats = [],
  aspectRatio = "2:3",
  imageGenerationSelection,
}: SketchGridGalleryProps) {
  const controller = useSketchGridGalleryController({
    aspectRatio,
    beats,
    episode,
    project,
  });

  return (
    <SketchGridGalleryView controller={controller}>
      {controller.groups.map((group) => (
        <SketchGridCard
          key={group.gridIndex}
          project={project}
          episode={episode}
          group={group}
          aspectRatio={aspectRatio}
          imageGenerationSelection={imageGenerationSelection}
        />
      ))}
    </SketchGridGalleryView>
  );
}

function SketchGridCard({
  project,
  episode,
  group,
  aspectRatio,
  imageGenerationSelection,
}: {
  project: string;
  episode: number;
  group: SketchGridGroup;
  aspectRatio: SketchAspectRatio;
  imageGenerationSelection?: string;
}) {
  const controller = useSketchGridCardController({
    aspectRatio,
    episode,
    group,
    imageGenerationSelection,
    project,
  });

  return <SketchGridCardView controller={controller} />;
}
