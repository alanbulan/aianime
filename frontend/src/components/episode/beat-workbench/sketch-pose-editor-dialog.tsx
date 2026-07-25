// Copyright (c) 2026 AI anime
import {
  SketchPoseEditorDialogView,
  useSketchPoseEditorDialogController,
} from "@/modules/production/public";

interface SketchPoseEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  episode: number;
  beatNum: number;
}

export function SketchPoseEditorDialog({
  open,
  onOpenChange,
  project,
  episode,
  beatNum,
}: SketchPoseEditorDialogProps) {
  const controller = useSketchPoseEditorDialogController({
    beatNum,
    episode,
    open,
    project,
    onOpenChange,
  });

  return <SketchPoseEditorDialogView controller={controller} />;
}
