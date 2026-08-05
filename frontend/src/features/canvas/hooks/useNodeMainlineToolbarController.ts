// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from "react";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import { type BeatContextNodeData, type CanvasNode } from "@/features/canvas/domain/canvasNodes";
import { DEFAULT_CANVAS_NODE_WIDTH } from "@/modules/creative_canvas/public";
import {
  buildNodeActionBeatContextData,
  extractMainlineContextsFromNode,
  isSameNodeActionBeatContext,
  openPresetProjectionInMyCanvas,
  resolveNodeActionBeatContext,
  resolveBeatContextWorkbenchTarget,
} from "@/modules/creative_canvas/public";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
export interface NodeMainlineToolbarControllerOptions {
  projectId: string;
  node: CanvasNode;
  isPresetLocked: boolean;
}

export function useNodeMainlineToolbarController({
  projectId,
  node,
  isPresetLocked,
}: NodeMainlineToolbarControllerOptions) {
  const addNode = useCanvasStore((state) => state.addNode);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const requestFocusNode = useCanvasStore((state) => state.requestFocusNode);
  const [openingWorkbench, setOpeningWorkbench] = useState(false);
  const workbenchTarget = useMemo(
    () =>
      resolveBeatContextWorkbenchTarget(node.data as BeatContextNodeData),
    [node.data],
  );
  const extractableBeatContext = useMemo(
    () => resolveNodeActionBeatContext(node, projectId),
    [node, projectId],
  );
  const canOpenWorkbench = isPresetLocked && Boolean(workbenchTarget);
  const canEnsureBeatContext =
    Boolean(extractableBeatContext) && node.type !== CANVAS_NODE_TYPES.beatContext;

  const openWorkbench = useCallback(() => {
    if (!canOpenWorkbench || !workbenchTarget || openingWorkbench) return;
    setOpeningWorkbench(true);
    void (async () => {
      try {
        await openPresetProjectionInMyCanvas(projectId, {
          scope: workbenchTarget.scope,
          episode: workbenchTarget.episode,
          beat: workbenchTarget.beat,
          primary_slot: "render",
        });
      } catch (error) {
        console.error("[freezone] open workbench failed", error);
      } finally {
        setOpeningWorkbench(false);
      }
    })();
  }, [canOpenWorkbench, openingWorkbench, projectId, workbenchTarget]);

  const ensureBeatContextNode = useCallback(() => {
    if (!canEnsureBeatContext || !extractableBeatContext) return;

    const existing = useCanvasStore
      .getState()
      .nodes.find((candidate) =>
        extractMainlineContextsFromNode(candidate).some((context) =>
          isSameNodeActionBeatContext(context, extractableBeatContext),
        ),
      );
    if (existing?.id) {
      setSelectedNode(String(existing.id));
      requestFocusNode(String(existing.id));
      return;
    }

    const nodeWidth =
      node.measured?.width ??
      (typeof node.width === "number" ? node.width : DEFAULT_CANVAS_NODE_WIDTH);
    const contextNodeId = addNode(
      CANVAS_NODE_TYPES.beatContext,
      {
        x: node.position.x + nodeWidth + 80,
        y: node.position.y,
      },
      buildNodeActionBeatContextData(extractableBeatContext),
    );
    setSelectedNode(contextNodeId);
    requestFocusNode(contextNodeId);
  }, [
    addNode,
    canEnsureBeatContext,
    extractableBeatContext,
    node.measured?.width,
    node.position.x,
    node.position.y,
    node.width,
    requestFocusNode,
    setSelectedNode,
  ]);

  return {
    isPresetLocked,
    canOpenWorkbench,
    canEnsureBeatContext,
    openingWorkbench,
    openWorkbench,
    ensureBeatContextNode,
  };
}

export type NodeMainlineToolbarController = ReturnType<
  typeof useNodeMainlineToolbarController
>;
