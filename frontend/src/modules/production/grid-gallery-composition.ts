// Copyright (c) 2026 AI anime
import { createElement } from "react";

import type { Beat } from "@/modules/narrative_planning/public";
import {
  useRenderGridCardController,
  useRenderGridGalleryController,
  useSketchGridCardController,
  useSketchGridGalleryController,
} from "@/modules/production/composition";
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";
import type { RenderGridGroup } from "@/modules/production/domain/render-grid-gallery";
import type { SketchGridGroup } from "@/modules/production/domain/sketch-grid-gallery";
import {
  RenderGridCardView,
  RenderGridGalleryView,
} from "@/modules/production/presentation/RenderGridGalleryView";
import {
  SketchGridCardView,
  SketchGridGalleryView,
} from "@/modules/production/presentation/SketchGridGalleryView";
import { useProjectAspectRatio } from "@/shared/stores/aspect-ratio-store";

export interface RenderGridGalleryProps {
  beats?: Beat[];
  episode: number;
  project: string;
}

export function RenderGridGallery({
  beats = [],
  episode,
  project,
}: RenderGridGalleryProps) {
  const { spec } = useProjectAspectRatio(project);
  const controller = useRenderGridGalleryController({
    beats,
    episode,
    project,
  });

  return createElement(
    RenderGridGalleryView,
    {
      children: controller.groups.map((group) =>
        createElement(RenderGridCard, {
          cellAspect: spec.renderAspect,
          episode,
          group,
          key: group.gridIndex,
          project,
        }),
      ),
      controller,
    },
  );
}

function RenderGridCard({
  cellAspect,
  episode,
  group,
  project,
}: {
  cellAspect: string;
  episode: number;
  group: RenderGridGroup;
  project: string;
}) {
  const controller = useRenderGridCardController({
    cellAspect,
    episode,
    group,
    project,
  });

  return createElement(RenderGridCardView, { controller });
}

export interface SketchGridGalleryProps {
  aspectRatio?: SketchAspectRatio;
  beats?: Beat[];
  episode: number;
  imageGenerationSelection?: string;
  project: string;
}

export function SketchGridGallery({
  aspectRatio = "2:3",
  beats = [],
  episode,
  imageGenerationSelection,
  project,
}: SketchGridGalleryProps) {
  const controller = useSketchGridGalleryController({
    aspectRatio,
    beats,
    episode,
    project,
  });

  return createElement(
    SketchGridGalleryView,
    {
      children: controller.groups.map((group) =>
        createElement(SketchGridCard, {
          aspectRatio,
          episode,
          group,
          imageGenerationSelection,
          key: group.gridIndex,
          project,
        }),
      ),
      controller,
    },
  );
}

function SketchGridCard({
  aspectRatio,
  episode,
  group,
  imageGenerationSelection,
  project,
}: {
  aspectRatio: SketchAspectRatio;
  episode: number;
  group: SketchGridGroup;
  imageGenerationSelection?: string;
  project: string;
}) {
  const controller = useSketchGridCardController({
    aspectRatio,
    episode,
    group,
    imageGenerationSelection,
    project,
  });

  return createElement(SketchGridCardView, { controller });
}
