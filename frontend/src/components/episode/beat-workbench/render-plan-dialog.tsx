// Copyright (c) 2026 AI anime
import {
  RenderPlanDialogView,
  useRenderPlanDialogController,
} from "@/modules/production/public";

interface RenderPlanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: string;
  episode: number;
  beatIndices: number[];
  aspectMode: string;
  defaultForceOneByOne?: boolean;
  /**
   * Invoked after a successful execute with the per-grid `selected_regen` task
   * ids (one execute fans out into N grid tasks). Track these for completion —
   * the response's umbrella `scope` matches no task row.
   */
  onDispatched: (taskIds: string[]) => void;
}

export function RenderPlanDialog({
  open,
  onOpenChange,
  project,
  episode,
  beatIndices,
  aspectMode,
  defaultForceOneByOne = false,
  onDispatched,
}: RenderPlanDialogProps) {
  const controller = useRenderPlanDialogController({
    open,
    onOpenChange,
    project,
    episode,
    beatIndices,
    aspectMode,
    defaultForceOneByOne,
    onDispatched,
  });

  return <RenderPlanDialogView {...controller} />;
}
