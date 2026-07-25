// Copyright (c) 2026 AI anime
import {
  SketchCropDialogView,
  useSketchCropDialogController,
} from "@/modules/production/public";

interface SketchCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  episode: number;
  beatNum: number;
}

export function SketchCropDialog({
  open,
  onOpenChange,
  project,
  episode,
  beatNum,
}: SketchCropDialogProps) {
  const controller = useSketchCropDialogController({
    beatNum,
    episode,
    open,
    project,
    onOpenChange,
  });

  return <SketchCropDialogView {...controller} />;
}
