// Copyright (c) 2026 AI anime
import { createElement, memo } from "react";

import {
  createBeatCardController,
  type BeatCardControllerOptions,
} from "@/modules/narrative_planning/application/create-beat-card-controller";
import type {
  BeatsViewToggleId,
  SelectionState,
} from "@/modules/narrative_planning/application/episode-workbench-state";
import {
  useBeatCardGridController,
  useInsertManualShotDialogController,
} from "@/modules/narrative_planning/composition";
import type { Beat } from "@/modules/narrative_planning/domain/types";
import { BeatCardGridView } from "@/modules/narrative_planning/presentation/BeatCardGridView";
import { BeatCardView } from "@/modules/narrative_planning/presentation/BeatCardView";
import { InsertManualShotDialogView } from "@/modules/narrative_planning/presentation/InsertManualShotDialogView";
import type { PoolImage } from "@/modules/production/public";

const EMPTY_IMAGES: PoolImage[] = [];

export interface InsertManualShotDialogProps {
  afterBeatNumber: number | null;
  episode: number;
  onInserted?(): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
  spineTemplate?: "drama" | "narrated";
}

export function InsertManualShotDialog({
  afterBeatNumber,
  episode,
  onInserted,
  onOpenChange,
  open,
  project,
  spineTemplate = "drama",
}: InsertManualShotDialogProps) {
  const controller = useInsertManualShotDialogController({
    afterBeatNumber,
    episode,
    onInserted,
    onOpenChange,
    open,
    project,
    spineTemplate,
  });

  return createElement(InsertManualShotDialogView, { controller });
}

function BeatCardAdapter(props: BeatCardControllerOptions) {
  return createElement(BeatCardView, {
    controller: createBeatCardController(props),
  });
}

export const BeatCard = memo(BeatCardAdapter);

export interface BeatCardGridProps {
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

  return createElement(BeatCardGridView, {
    controller,
    insertDialog: createElement(InsertManualShotDialog, {
      afterBeatNumber: controller.insertAfterBeat,
      episode,
      onOpenChange: controller.onInsertOpenChange,
      open: controller.insertOpen,
      project,
      spineTemplate,
    }),
    renderBeatCard: (beat, index) =>
      createElement(BeatCard, {
        aspectRatio,
        assignments: controller.assignments,
        beat,
        displayNumber: index + 1,
        images:
          controller.imagesByBeat.get(beat.beat_number) ?? EMPTY_IMAGES,
        isChecked:
          controller.checkedBeats?.has(beat.beat_number) ?? false,
        isDeletingManual:
          controller.isDeletePending &&
          controller.deleteTarget?.beatNumber === beat.beat_number,
        isOpeningFreezone:
          controller.freezonePendingBeat === beat.beat_number,
        isSelected: controller.selectedBeat === beat.beat_number,
        key: beat.beat_number,
        onCardClick,
        onCheckboxClick,
        onDeleteManual: controller.onDeleteManualRequest,
        onInsertAfter: controller.onInsertAfter,
        onInsertBefore: controller.onInsertBefore,
        onOpenFreezone: controller.onOpenFreezone,
        showRender: controller.showRender,
        showSketch: controller.showSketch,
      }),
  });
}
