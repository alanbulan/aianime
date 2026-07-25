// Copyright (c) 2026 AI anime
import { useCallback, useEffect } from "react";

import type { SelectionState } from "@/modules/narrative_planning/application/episode-workbench-state";
import type { Beat } from "@/modules/narrative_planning/domain/types";
import type { SectionId } from "@/modules/narrative_planning/application/use-single-beat-panel-controller";
import type { BeatStageState, BeatStates } from "@/types/beat-state";

export type ActionPanelSelection = SelectionState;

export interface ActionPanelSectionState {
  openSections: ReadonlySet<SectionId>;
  setOpenSections(sections: ReadonlySet<SectionId>): void;
}

export interface ActionPanelControllerDependencies {
  useSectionState(project: string, episode: number): ActionPanelSectionState;
}

export interface ActionPanelControllerOptions {
  beats: readonly Beat[];
  episode: number;
  project: string;
  selection: ActionPanelSelection;
  states: BeatStates;
  targetSection?: SectionId | null;
}

export interface ActionPanelController {
  beat: Beat | null;
  onToggleSection(id: SectionId): void;
  openSections: ReadonlySet<SectionId>;
  stages: Record<string, BeatStageState> | undefined;
}

export function createUseActionPanelController(
  dependencies: ActionPanelControllerDependencies,
) {
  return function useActionPanelController({
    beats,
    episode,
    project,
    selection,
    states,
    targetSection,
  }: ActionPanelControllerOptions): ActionPanelController {
    const { openSections, setOpenSections } = dependencies.useSectionState(
      project,
      episode,
    );

    useEffect(() => {
      if (!targetSection || openSections.has(targetSection)) return;
      const next = new Set(openSections);
      next.add(targetSection);
      setOpenSections(next);
    }, [openSections, setOpenSections, targetSection]);

    const onToggleSection = useCallback(
      (id: SectionId) => {
        const next = new Set(openSections);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setOpenSections(next);
      },
      [openSections, setOpenSections],
    );
    const beatNumber =
      selection.mode === "single" ? selection.beatNum : null;
    const beat =
      beatNumber === null
        ? null
        : beats.find((candidate) => candidate.beat_number === beatNumber) ??
          null;

    return {
      beat,
      onToggleSection,
      openSections,
      stages: beat ? states[beat.beat_number] : undefined,
    };
  };
}
