// Copyright (c) 2026 AI anime
import type { Beat } from "@/modules/narrative_planning/public";
import {
  BatchBarView,
  type SketchAspectRatio,
  useBatchBarController,
} from "@/modules/production/public";

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
    onSketchAspectRatioChange,
    project,
    sketchAspectRatio,
    spineTemplate,
    videoBackend,
  });

  return <BatchBarView controller={controller} />;
}
