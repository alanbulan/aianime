// Copyright (c) 2026 AI anime
export interface EpisodeWorkbenchScope {
  episode: number;
  project: string;
}

export type SelectionState =
  | { mode: "none" }
  | { beatNum: number; mode: "single" }
  | { checked: Set<number>; mode: "multi" };

export interface BeatSelectionState {
  activeBeat: number | null;
  clearSelection(): void;
  handleCardClick(beatNumber: number): void;
  selectSingle(beatNumber: number): void;
  state: SelectionState;
  toggleCheck(beatNumber: number): void;
}

export type UseBeatSelection = (
  scope?: EpisodeWorkbenchScope,
) => BeatSelectionState;

export type BeatsViewToggleId = "text" | "sketch" | "render";

export interface BeatsViewToggleState {
  toggle(id: BeatsViewToggleId): void;
  toggles: Set<BeatsViewToggleId>;
}

export type UseBeatsViewToggles = (
  project: string,
  episode: number,
) => BeatsViewToggleState;
