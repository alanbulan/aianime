// Copyright (c) 2026 AI anime
import type { Beat } from "@/modules/narrative_planning/public";
import {
  BatchBarView,
  type SketchAspectRatio,
  useBatchBarController,
} from "@/modules/production/public";

import { RenderModelSelect } from "./render-settings-controls";
import {
  SketchAspectCheckbox,
  SketchModelSelect,
} from "./sketch-settings-controls";

interface BatchBarProps {
  project: string;
  episode: number;
  beats: Beat[];
  videoBackend: string;
  spineTemplate?: "drama" | "narrated";
  sketchAspectRatio: SketchAspectRatio;
  onSketchAspectRatioChange: (aspectRatio: SketchAspectRatio) => void;
}

export function BatchBar({
  project,
  episode,
  beats,
  videoBackend,
  spineTemplate = "drama",
  sketchAspectRatio,
  onSketchAspectRatioChange,
}: BatchBarProps) {
  const controller = useBatchBarController({
    beats,
    episode,
    project,
    spineTemplate,
    videoBackend,
  });

  return (
    <BatchBarView
      controller={controller}
      renderModelControl={<RenderModelSelect project={project} />}
      sketchAspectControl={
        <SketchAspectCheckbox
          aspectRatio={sketchAspectRatio}
          onAspectRatioChange={onSketchAspectRatioChange}
          flat
        />
      }
      sketchModelControl={<SketchModelSelect project={project} />}
    />
  );
}
