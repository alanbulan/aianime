// Copyright (c) 2026 AI anime
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import type { CanvasGroupArrangementMode } from "@/modules/creative_canvas/public";
import { GROUP_COLOR_PRESETS } from "@/features/canvas/domain/groupColors";

export interface GroupNodeToolbarControllerOptions {
  nodeId: string;
  backgroundColor: string | null;
}

export function useGroupNodeToolbarController({
  nodeId,
  backgroundColor,
}: GroupNodeToolbarControllerOptions) {
  const { t } = useTranslation();
  const arrangeGroupChildren = useCanvasStore(
    (state) => state.arrangeGroupChildren,
  );
  const ungroupNode = useCanvasStore((state) => state.ungroupNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);

  const setBackgroundColor = useCallback(
    (color: string | null) => {
      updateNodeData(nodeId, { backgroundColor: color });
    },
    [nodeId, updateNodeData],
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
    t,
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
