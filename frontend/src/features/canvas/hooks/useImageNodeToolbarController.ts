// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import { projectImageNodeToolbar } from "@/features/canvas/application/imageNodeToolbarModel";
import {
  NODE_TOOL_TYPES,
  type CanvasNode,
  type NodeToolType,
} from "@/features/canvas/domain/canvasNodes";
import type { GridActionRequest } from "@/features/canvas/domain/gridAction";
import { getNodeToolPlugins } from "@/features/canvas/tools";

export interface ImageNodeToolbarControllerOptions {
  projectId: string;
  node: CanvasNode;
  isPresetLocked: boolean;
  onOpenMultiAngleEditor: (nodeId: string) => void;
  onOpenLightEditor: (nodeId: string) => void;
  onOpenScene360: (nodeId: string) => void;
  onOpenUpscale: (nodeId: string) => void;
  onOpenOutpaint: (nodeId: string) => void;
  onOpenGridAction: (request: GridActionRequest) => void;
  onOpenRedraw: (nodeId: string) => void;
  onOpenErase: (nodeId: string) => void;
  onOpenRotate: (nodeId: string) => void;
}

export function useImageNodeToolbarController({
  projectId,
  node,
  isPresetLocked,
  onOpenMultiAngleEditor,
  onOpenLightEditor,
  onOpenScene360,
  onOpenUpscale,
  onOpenOutpaint,
  onOpenGridAction,
  onOpenRedraw,
  onOpenErase,
  onOpenRotate,
}: ImageNodeToolbarControllerOptions) {
  const { t, i18n } = useTranslation();
  const projection = useMemo(
    () => projectImageNodeToolbar(node, isPresetLocked),
    [isPresetLocked, node],
  );
  const plugins = useMemo(() => getNodeToolPlugins(node), [node]);
  const toolActions = useMemo(
    () =>
      plugins
        .filter((plugin) => plugin.type !== NODE_TOOL_TYPES.crop)
        .map((plugin) => ({
          type: plugin.type,
          icon: plugin.icon,
          label: t(plugin.labelKey),
          iconOnly: plugin.type === NODE_TOOL_TYPES.annotate,
        })),
    [i18n.language, plugins, t],
  );
  const canEdit = plugins.some(
    (plugin) => plugin.type === NODE_TOOL_TYPES.crop,
  );
  const openTool = useCallback(
    (toolType: NodeToolType) => {
      canvasEventBus.publish("tool-dialog/open", {
        nodeId: node.id,
        toolType,
      });
    },
    [node.id],
  );

  return {
    ...projection,
    projectId,
    nodeId: node.id,
    nodeData: node.data,
    isPresetLocked,
    canEdit,
    toolActions,
    openPanorama: () => onOpenScene360(node.id),
    openMultiDimension: () => onOpenMultiAngleEditor(node.id),
    openRelight: () => onOpenLightEditor(node.id),
    openRotate: () => onOpenRotate(node.id),
    openTool,
    onOpenUpscale,
    onOpenOutpaint,
    onOpenGridAction,
    onOpenRedraw,
    onOpenErase,
    t,
  };
}

export type ImageNodeToolbarController = ReturnType<
  typeof useImageNodeToolbarController
>;
