// Copyright (c) 2026 AI anime
import type { Beat } from "@/modules/narrative_planning/public";
import { useBatchBarController } from "@/modules/production/composition";
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";
import { BatchBarView } from "@/modules/production/presentation/BatchBarView";

export interface BatchBarProps {
  beats: Beat[];
  episode: number;
  onSketchAspectRatioChange(aspectRatio: SketchAspectRatio): void;
  project: string;
  sketchAspectRatio: SketchAspectRatio;
  spineTemplate?: "drama" | "narrated";
  videoBackend: string;
}

export function BatchBar({
  beats,
  episode,
  onSketchAspectRatioChange,
  project,
  sketchAspectRatio,
  spineTemplate = "drama",
  videoBackend,
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
