// Copyright (c) 2026 AI anime
import { resolveImage } from "@/lib/resolve-image";
import { useAssetWorkspaceNavigation } from "@/modules/asset_world/public";
import {
  SingleBeatPanelView,
  type Beat,
  type SectionId,
  type SingleBeatSectionViewModel,
  type VideoBackendHeaderOption,
} from "@/modules/narrative_planning/public";
import {
  AudioPaneContent,
  useGridsByBeat,
  useVideoBackends,
} from "@/modules/production/public";
import { saveScopes, useSaveState } from "@/stores/save-status-store";
import type { BeatStageState } from "@/types/beat-state";

import { RenderSection } from "./render-section";
import { SketchSection } from "./sketch-section";
import { TextPane } from "./text-pane";
import { VideoPane } from "./video-pane";

export type { SectionId } from "@/modules/narrative_planning/public";

interface SingleBeatPanelProps {
  beat: Beat;
  project: string;
  episode: number;
  stages: Record<string, BeatStageState> | undefined;
  defaultBackend: string;
  onDefaultBackendChange: (backend: string) => void;
  spineTemplate?: "drama" | "narrated";
  showAudioMediaStatus?: boolean;
  openSections: Set<SectionId>;
  onToggleSection: (id: SectionId) => void;
}

interface GridImageMatch {
  cell_path?: string | null;
  grid_path?: string | null;
  id?: string;
  original_beat?: number | null;
  type?: string;
}

function isRenderImageMatch(image: GridImageMatch, assignment: string) {
  return (
    image.type === "render" &&
    (image.id === assignment ||
      image.cell_path === assignment ||
      image.grid_path === assignment)
  );
}

function sectionStatusKey(
  id: SectionId,
  beat: Beat,
  stages: Record<string, BeatStageState> | undefined,
  hasSketch: boolean,
  hasRender: boolean,
): string {
  switch (id) {
    case "text":
      return beat.narration_segment
        ? "episode.beat.edited"
        : "episode.beat.notEdited";
    case "sketch":
      return hasSketch || stages?.sketch === "ready"
        ? "episode.beat.selected"
        : "episode.beat.notSelected";
    case "render":
      return hasRender
        ? "episode.beat.rendered"
        : "episode.beat.notRendered";
    case "audio":
      return beat.audio_url
        ? "episode.beat.generated"
        : "episode.beat.notGenerated";
    case "video":
      return beat.video_url
        ? "episode.beat.generated"
        : "episode.beat.notGenerated";
  }
}

function isReadyStatus(statusKey: string) {
  return (
    statusKey === "episode.beat.edited" ||
    statusKey === "episode.beat.selected" ||
    statusKey === "episode.beat.rendered" ||
    statusKey === "episode.beat.generated"
  );
}

const SECTION_IDS: readonly SectionId[] = [
  "text",
  "sketch",
  "render",
  "audio",
  "video",
];

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
  const openAssetWorkspace = useAssetWorkspaceNavigation(project);
  const { assignments, byBeat } = useGridsByBeat(project, episode);
  const { data: videoBackendsResponse } = useVideoBackends(project);
  const images = byBeat.get(beat.beat_number) ?? [];
  const resolvedSketch = resolveImage(
    images,
    assignments,
    beat.beat_number,
    "sketch",
    beat.sketch_url ?? null,
  );
  const renderAssignment = assignments[String(beat.beat_number)] ?? null;
  const hasRender =
    !!beat.frame_url ||
    (renderAssignment !== null &&
      images.some((image) => isRenderImageMatch(image, renderAssignment))) ||
    images.some(
      (image) =>
        image.type === "render" &&
        image.original_beat === beat.beat_number &&
        !!image.cell_url,
    );
  const beatTextScope = saveScopes.beatText(
    project,
    episode,
    beat.beat_number,
  );
  const textSaveState = useSaveState(beatTextScope);
  const visibleSectionIds =
    spineTemplate === "drama"
      ? SECTION_IDS.filter((id) => id !== "audio")
      : SECTION_IDS;
  const sections: SingleBeatSectionViewModel[] = visibleSectionIds.map((id) => {
    const statusKey = sectionStatusKey(
      id,
      beat,
      stages,
      !!resolvedSketch.url,
      hasRender,
    );
    return {
      id,
      isOpen: openSections.has(id),
      ready: isReadyStatus(statusKey),
      statusKey,
    };
  });
  const videoBackends: VideoBackendHeaderOption[] = (
    videoBackendsResponse?.data ?? []
  ).map((backend) => ({
    dialogueOnly: backend.dialogue_only,
    isDefault: backend.is_default,
    isSeedance2: backend.is_seedance2,
    label: backend.label,
    value: backend.value,
  }));

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
            onConfigureVoice={openAssetWorkspace}
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
      beatTextScope={beatTextScope}
      onDefaultBackendChange={onDefaultBackendChange}
      onToggleSection={onToggleSection}
      renderSectionContent={renderSectionContent}
      sections={sections}
      textSaveStatus={textSaveState.status}
      videoBackend={defaultBackend}
      videoBackends={videoBackends}
    />
  );
}
