// Copyright (c) 2026 AI anime
import type { SelectionState } from "@/hooks/use-selection";
import {
  ActionPanelView,
  type Beat,
  useActionPanelController,
} from "@/modules/narrative_planning/public";
import type { BeatStates } from "@/types/beat-state";

import { SingleBeatPanel, type SectionId } from "./single-beat-panel";

interface ActionPanelProps {
  beats: Beat[];
  defaultBackend: string;
  episode: number;
  onDefaultBackendChange(backend: string): void;
  project: string;
  selection: SelectionState;
  showAudioMediaStatus?: boolean;
  spineTemplate?: "drama" | "narrated";
  states: BeatStates;
  targetSection?: SectionId | null;
}

export function ActionPanel({
  beats,
  defaultBackend,
  episode,
  onDefaultBackendChange,
  project,
  selection,
  showAudioMediaStatus = true,
  spineTemplate = "drama",
  states,
  targetSection,
}: ActionPanelProps) {
  const controller = useActionPanelController({
    beats,
    episode,
    project,
    selection,
    states,
    targetSection,
  });
  const { beat, onToggleSection, openSections, stages } = controller;
  const singleBeatContent = beat ? (
    <SingleBeatPanel
      beat={beat}
      project={project}
      episode={episode}
      stages={stages}
      defaultBackend={defaultBackend}
      onDefaultBackendChange={onDefaultBackendChange}
      spineTemplate={spineTemplate}
      showAudioMediaStatus={showAudioMediaStatus}
      openSections={openSections}
      onToggleSection={onToggleSection}
    />
  ) : null;

  return (
    <ActionPanelView
      controller={controller}
      singleBeatContent={singleBeatContent}
    />
  );
}
