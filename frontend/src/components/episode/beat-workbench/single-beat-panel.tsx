// Copyright (c) 2026 AI anime
import {
  SingleBeatPanelView,
  type Beat,
  type SectionId,
  useSingleBeatPanelController,
} from "@/modules/narrative_planning/public";
import { AudioPaneContent } from "@/modules/production/public";
import type { BeatStageState } from "@/types/beat-state";

import { RenderSection } from "./render-section";
import { SketchSection } from "./sketch-section";
import { TextPane } from "./text-pane";
import { VideoPane } from "./video-pane";

export type { SectionId } from "@/modules/narrative_planning/public";

interface SingleBeatPanelProps {
  beat: Beat;
  defaultBackend: string;
  episode: number;
  onDefaultBackendChange(backend: string): void;
  onToggleSection(id: SectionId): void;
  openSections: ReadonlySet<SectionId>;
  project: string;
  showAudioMediaStatus?: boolean;
  spineTemplate?: "drama" | "narrated";
  stages: Record<string, BeatStageState> | undefined;
}

export function SingleBeatPanel({
  beat,
  defaultBackend,
  episode,
  onDefaultBackendChange,
  onToggleSection,
  openSections,
  project,
  showAudioMediaStatus = true,
  spineTemplate = "drama",
  stages,
}: SingleBeatPanelProps) {
  const controller = useSingleBeatPanelController({
    beat,
    defaultBackend,
    episode,
    onDefaultBackendChange,
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
        return (
          <TextPane
            beat={beat}
            project={project}
            episode={episode}
            spineTemplate={spineTemplate}
          />
        );
      case "sketch":
        return (
          <SketchSection
            beat={beat}
            project={project}
            episode={episode}
            images={images}
            assignments={assignments}
            onPreview={onPreview}
          />
        );
      case "render":
        return (
          <RenderSection
            beat={beat}
            project={project}
            episode={episode}
            images={images}
            assignments={assignments}
            onPreview={onPreview}
          />
        );
      case "audio":
        return (
          <AudioPaneContent
            beat={beat}
            project={project}
            episode={episode}
            state={stages?.audio ?? "missing"}
            onConfigureVoice={onConfigureVoice}
          />
        );
      case "video":
        return (
          <VideoPane
            beat={beat}
            project={project}
            episode={episode}
            state={stages?.video ?? "missing"}
            defaultBackend={defaultBackend}
            showAudioMediaStatus={showAudioMediaStatus}
          />
        );
    }
  };

  return (
    <SingleBeatPanelView
      controller={controller}
      renderSectionContent={renderSectionContent}
    />
  );
}
