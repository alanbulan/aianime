// Copyright (c) 2026 AI anime
import { createElement } from "react";

import { useTextPaneController } from "@/modules/narrative_planning/composition";
import type { Beat } from "@/modules/narrative_planning/domain/types";
import { TextPaneView } from "@/modules/narrative_planning/presentation/TextPaneView";

export interface TextPaneProps {
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

  return createElement(TextPaneView, { controller });
}
