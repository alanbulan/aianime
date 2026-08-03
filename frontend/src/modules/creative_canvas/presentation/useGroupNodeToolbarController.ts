// Copyright (c) 2026 AI anime
import { useCallback } from "react";

import type { CanvasGroupArrangementMode } from "@/modules/creative_canvas/domain/canvasGroupArrangement";
import { GROUP_COLOR_PRESETS } from "@/modules/creative_canvas/domain/groupColors";

export interface GroupNodeToolbarCommandPorts {
  arrangeGroupChildren: (
    nodeId: string,
    mode: CanvasGroupArrangementMode,
  ) => void;
  ungroupNode: (nodeId: string) => unknown;
  updateNodeBackgroundColor: (
    nodeId: string,
    backgroundColor: string | null,
  ) => void;
}

export interface GroupNodeToolbarControllerOptions
  extends GroupNodeToolbarCommandPorts {
  nodeId: string;
  backgroundColor: string | null;
  translate: (key: string) => string;
}

export function useGroupNodeToolbarController({
  nodeId,
  backgroundColor,
  translate,
  arrangeGroupChildren,
  ungroupNode,
  updateNodeBackgroundColor,
}: GroupNodeToolbarControllerOptions) {
  const setBackgroundColor = useCallback(
    (color: string | null) => {
      updateNodeBackgroundColor(nodeId, color);
    },
    [nodeId, updateNodeBackgroundColor],
  );
  const arrange = useCallback(
    (mode: CanvasGroupArrangementMode) => {
      arrangeGroupChildren(nodeId, mode);
    },
    [arrangeGroupChildren, nodeId],
  );
  const ungroup = useCallback(() => {
    ungroupNode(nodeId);
  }, [nodeId, ungroupNode]);

  return {
    t: translate,
    backgroundColor,
    colorPresets: GROUP_COLOR_PRESETS,
    setBackgroundColor,
    arrange,
    ungroup,
  };
}

export type GroupNodeToolbarController = ReturnType<
  typeof useGroupNodeToolbarController
>;
