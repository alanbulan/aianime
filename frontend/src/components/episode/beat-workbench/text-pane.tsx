// Copyright (c) 2026 AI anime
import {
  TextPaneView,
  useTextPaneController,
  type Beat,
} from "@/modules/narrative_planning/public";

interface TextPaneProps {
  beat: Beat;
  episode: number;
  project: string;
  spineTemplate?: "drama" | "narrated";
}

export function TextPane({
  beat,
  episode,
  project,
  spineTemplate = "drama",
}: TextPaneProps) {
  const controller = useTextPaneController({
    beat,
    episode,
    project,
    spineTemplate,
  });

  return <TextPaneView controller={controller} />;
}
