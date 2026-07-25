// Copyright (c) 2026 AI anime
import {
  BeatCardGridView,
  useBeatCardGridController,
  type Beat,
  type BeatsViewToggleId,
  type SelectionState,
} from "@/modules/narrative_planning/public";
import type { PoolImage } from "@/modules/production/public";
import { BeatCard } from "./beat-card";
import { InsertManualShotDialog } from "./insert-manual-shot-dialog";

const EMPTY_IMAGES: PoolImage[] = [];

interface BeatCardGridProps {
  aspectRatio: "portrait" | "landscape";
  beats: Beat[];
  episode: number;
  onCardClick(beatNumber: number): void;
  onCheckboxClick(beatNumber: number): void;
  project: string;
  selection: SelectionState;
  spineTemplate?: "drama" | "narrated";
  toggles: Set<BeatsViewToggleId>;
}

export function BeatCardGrid({
  aspectRatio,
  beats,
  episode,
  onCardClick,
  onCheckboxClick,
  project,
  selection,
  spineTemplate = "drama",
  toggles,
}: BeatCardGridProps) {
  const controller = useBeatCardGridController({
    beats,
    episode,
    project,
    selection,
    toggles,
  });

  return (
    <BeatCardGridView
      controller={controller}
      renderBeatCard={(beat, index) => (
        <BeatCard
          key={beat.beat_number}
          beat={beat}
          displayNumber={index + 1}
          showSketch={controller.showSketch}
          showRender={controller.showRender}
          images={
            controller.imagesByBeat.get(beat.beat_number) ?? EMPTY_IMAGES
          }
          assignments={controller.assignments}
          aspectRatio={aspectRatio}
          isSelected={controller.selectedBeat === beat.beat_number}
          isChecked={
            controller.checkedBeats?.has(beat.beat_number) ?? false
          }
          onCardClick={onCardClick}
          onCheckboxClick={onCheckboxClick}
          onInsertBefore={controller.onInsertBefore}
          onInsertAfter={controller.onInsertAfter}
          onOpenFreezone={controller.onOpenFreezone}
          onDeleteManual={controller.onDeleteManualRequest}
          isOpeningFreezone={
            controller.freezonePendingBeat === beat.beat_number
          }
          isDeletingManual={
            controller.isDeletePending &&
            controller.deleteTarget?.beatNumber === beat.beat_number
          }
        />
      )}
      insertDialog={
        <InsertManualShotDialog
          open={controller.insertOpen}
          onOpenChange={controller.onInsertOpenChange}
          project={project}
          episode={episode}
          spineTemplate={spineTemplate}
          afterBeatNumber={controller.insertAfterBeat}
        />
      }
    />
  );
}
