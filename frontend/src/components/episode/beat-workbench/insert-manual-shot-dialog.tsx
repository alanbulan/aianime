// Copyright (c) 2026 AI anime
import {
  InsertManualShotDialogView,
  useInsertManualShotDialogController,
} from "@/modules/narrative_planning/public";

interface InsertManualShotDialogProps {
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

  return <InsertManualShotDialogView controller={controller} />;
}
