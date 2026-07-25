// Copyright (c) 2026 AI anime
import { resolveImage } from "@/lib/resolve-image";
import type { Beat } from "@/modules/narrative_planning/domain/types";
import type {
  PoolImage,
  VideoBackendOption,
  VoiceConfigurationTarget,
} from "@/modules/production/public";
import type { BeatStageState } from "@/types/beat-state";

export type SectionId = "text" | "sketch" | "render" | "audio" | "video";

export interface SingleBeatSectionViewModel {
  id: SectionId;
  isOpen: boolean;
  ready: boolean;
  statusKey: string;
}

export interface VideoBackendHeaderOption {
  dialogueOnly: boolean;
  isDefault: boolean;
  isSeedance2: boolean;
  label: string;
  value: string;
}

interface GridsByBeatQuery {
  assignments: Record<string, string>;
  byBeat: Map<number, PoolImage[]>;
}

interface VideoBackendsQuery {
  data?: { data: VideoBackendOption[] };
}

interface SaveStateQuery {
  status: string;
}

export interface SingleBeatPanelControllerQueries {
  useGridsByBeat(project: string, episode: number): GridsByBeatQuery;
  useVideoBackends(project: string): VideoBackendsQuery;
}

export interface SingleBeatPanelControllerDependencies {
  beatTextScope(project: string, episode: number, beatNumber: number): string;
  useAssetWorkspaceNavigation(
    project: string,
  ): (target: VoiceConfigurationTarget) => void;
  useSaveState(scope: string): SaveStateQuery;
}

export interface SingleBeatPanelControllerOptions {
  beat: Beat;
  defaultBackend: string;
  episode: number;
  onDefaultBackendChange(backend: string): void;
  onToggleSection(id: SectionId): void;
  openSections: ReadonlySet<SectionId>;
  project: string;
  spineTemplate: "drama" | "narrated";
  stages: Record<string, BeatStageState> | undefined;
}

export interface SingleBeatPanelController {
  assignments: Record<string, string>;
  beatTextScope: string;
  images: PoolImage[];
  onConfigureVoice(target: VoiceConfigurationTarget): void;
  onDefaultBackendChange(backend: string): void;
  onToggleSection(id: SectionId): void;
  sections: readonly SingleBeatSectionViewModel[];
  textSaveStatus: string;
  videoBackend: string;
  videoBackends: readonly VideoBackendHeaderOption[];
}

const SECTION_IDS: readonly SectionId[] = [
  "text",
  "sketch",
  "render",
  "audio",
  "video",
];

function isRenderImageMatch(image: PoolImage, assignment: string) {
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

export function createUseSingleBeatPanelController(
  queries: SingleBeatPanelControllerQueries,
  dependencies: SingleBeatPanelControllerDependencies,
) {
  return function useSingleBeatPanelController({
    beat,
    defaultBackend,
    episode,
    onDefaultBackendChange,
    onToggleSection,
    openSections,
    project,
    spineTemplate,
    stages,
  }: SingleBeatPanelControllerOptions): SingleBeatPanelController {
    const onConfigureVoice =
      dependencies.useAssetWorkspaceNavigation(project);
    const { assignments, byBeat } = queries.useGridsByBeat(project, episode);
    const { data: videoBackendsResponse } = queries.useVideoBackends(project);
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
        images.some((image) =>
          isRenderImageMatch(image, renderAssignment),
        )) ||
      images.some(
        (image) =>
          image.type === "render" &&
          image.original_beat === beat.beat_number &&
          !!image.cell_url,
      );
    const beatTextScope = dependencies.beatTextScope(
      project,
      episode,
      beat.beat_number,
    );
    const textSaveState = dependencies.useSaveState(beatTextScope);
    const visibleSectionIds =
      spineTemplate === "drama"
        ? SECTION_IDS.filter((id) => id !== "audio")
        : SECTION_IDS;
    const sections = visibleSectionIds.map((id) => {
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
    const videoBackends = (videoBackendsResponse?.data ?? []).map(
      (backend) => ({
        dialogueOnly: backend.dialogue_only,
        isDefault: backend.is_default,
        isSeedance2: backend.is_seedance2,
        label: backend.label,
        value: backend.value,
      }),
    );

    return {
      assignments,
      beatTextScope,
      images,
      onConfigureVoice,
      onDefaultBackendChange,
      onToggleSection,
      sections,
      textSaveStatus: textSaveState.status,
      videoBackend: defaultBackend,
      videoBackends,
    };
  };
}
