// Copyright (c) 2026 AI anime
import { createElement } from "react";

import type { SelectionState } from "@/modules/narrative_planning/application/episode-workbench-state";
import type { SectionId } from "@/modules/narrative_planning/application/use-single-beat-panel-controller";
import {
  useActionPanelController,
  useSingleBeatPanelController,
} from "@/modules/narrative_planning/composition";
import type { Beat } from "@/modules/narrative_planning/domain/types";
import { ActionPanelView } from "@/modules/narrative_planning/presentation/ActionPanelView";
import { SingleBeatPanelView } from "@/modules/narrative_planning/presentation/SingleBeatPanelView";
import { TextPane } from "@/modules/narrative_planning/text-pane-composition";
import {
  AudioPaneContent,
  RenderSection,
  SketchSection,
  VideoPane,
} from "@/modules/production/public";
import type { BeatStageState, BeatStates } from "@/modules/production/public";

export interface SingleBeatPanelProps {
  beat: Beat;
  defaultModel: string;
  episode: number;
  onDefaultModelChange(model: string): void;
  onToggleSection(id: SectionId): void;
  openSections: ReadonlySet<SectionId>;
  project: string;
  showAudioMediaStatus?: boolean;
  spineTemplate?: "drama" | "narrated";
  stages: Record<string, BeatStageState> | undefined;
}

export function SingleBeatPanel({
  beat,
  defaultModel,
  episode,
  onDefaultModelChange,
  onToggleSection,
  openSections,
  project,
  showAudioMediaStatus = true,
  spineTemplate = "drama",
  stages,
}: SingleBeatPanelProps) {
  const controller = useSingleBeatPanelController({
    beat,
    defaultModel,
    episode,
    onDefaultModelChange,
    onToggleSection,
    openSections,
    project,
    spineTemplate,
    stages,
  });
  const { assignments, images, onConfigureVoice } = controller;

  const renderSectionContent = (
    id: SectionId,
    onPreview: (url: string) => void,
  ) => {
    switch (id) {
      case "text":
        return createElement(TextPane, {
          beat,
          episode,
          project,
          spineTemplate,
        });
      case "sketch":
        return createElement(SketchSection, {
          assignments,
          beat,
          episode,
          images,
          onPreview,
          project,
        });
      case "render":
        return createElement(RenderSection, {
          assignments,
          beat,
          episode,
          images,
          onPreview,
          project,
        });
      case "audio":
        return createElement(AudioPaneContent, {
          beat,
          episode,
          onConfigureVoice,
          project,
          state: stages?.audio ?? "missing",
        });
      case "video":
        return createElement(VideoPane, {
          beat,
          defaultModel,
          episode,
          project,
          showAudioMediaStatus,
          state: stages?.video ?? "missing",
        });
    }
  };

  return createElement(SingleBeatPanelView, {
    controller,
    renderSectionContent,
  });
}

export interface ActionPanelProps {
  beats: Beat[];
  defaultModel: string;
  episode: number;
  onDefaultModelChange(model: string): void;
  project: string;
  selection: SelectionState;
  showAudioMediaStatus?: boolean;
  spineTemplate?: "drama" | "narrated";
  states: BeatStates;
  targetSection?: SectionId | null;
}

export function ActionPanel({
  beats,
  defaultModel,
  episode,
  onDefaultModelChange,
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
  const singleBeatContent = beat
    ? createElement(SingleBeatPanel, {
        beat,
        defaultModel,
        episode,
        onDefaultModelChange,
        onToggleSection,
        openSections,
        project,
        showAudioMediaStatus,
        spineTemplate,
        stages,
      })
    : null;

  return createElement(ActionPanelView, {
    controller,
    singleBeatContent,
  });
}
