// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { projectImageNodeToolbar } from "../domain/imageNodeToolbarModel";
import { NODE_TOOL_TYPES, type NodeToolType } from "../domain/canvasNodeTool";
import { getNodeToolPlugins } from "../domain/canvasToolRegistry";
import type { GridActionRequest } from "../domain/gridAction";
import type { CanvasNode } from "../domain/canvasNodeData";
import { isImageEditNode } from "../domain/canvasNodePredicates";
import { resolveCanvasNodeSourceImageUrl } from "../domain/canvasNodeImageSource";

export interface ImageNodeToolbarEventPort {
  publish: (event: "tool-dialog/open", payload: {
    nodeId: string;
    toolType: NodeToolType;
  }) => void;
}

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

export function createUseImageNodeToolbarController({
  eventPort,
}: {
  eventPort: ImageNodeToolbarEventPort;
}) {
  return function useImageNodeToolbarController({
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
      () =>
        projectImageNodeToolbar(
          resolveCanvasNodeSourceImageUrl(node),
          isImageEditNode(node),
          isPresetLocked,
        ),
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
        eventPort.publish("tool-dialog/open", {
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
  };
}

export type ImageNodeToolbarController = ReturnType<
  ReturnType<typeof createUseImageNodeToolbarController>
>;
