// Copyright (c) 2026 AI anime
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { RenderPlanDialog } from "./render-plan-dialog";
import type { Beat } from "@/modules/narrative_planning/public";
import {
  BatchPanelView,
  useBatchPanelController,
} from "@/modules/production/public";

interface BatchPanelProps {
  checkedBeats: Set<number>;
  beats: Beat[];
  project: string;
  episode: number;
  isSeedance2Backend?: boolean;
  onClearSelection: () => void;
}

export function BatchPanel({
  checkedBeats,
  beats,
  project,
  episode,
  isSeedance2Backend = false,
  onClearSelection,
}: BatchPanelProps) {
  const { spec } = useProjectAspectRatio(project);
  const controller = useBatchPanelController({
    beats,
    checkedBeats,
    episode,
    isSeedance2Backend,
    onClearSelection,
    project,
    sketchAspect: spec.sketchAspect,
  });

  return (
    <BatchPanelView
      controller={controller}
      renderPlanDialog={
        <RenderPlanDialog
          open={controller.renderPlanOpen}
          onOpenChange={controller.onRenderPlanOpenChange}
          project={project}
          episode={episode}
          beatIndices={controller.beatNumbers}
          aspectMode={spec.renderAspect}
          defaultForceOneByOne={controller.renderPlanForceOneByOne}
          onDispatched={controller.onRenderDispatched}
        />
      }
    />
  );
}
