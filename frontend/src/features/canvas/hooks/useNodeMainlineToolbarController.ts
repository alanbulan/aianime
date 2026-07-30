// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from "react";

import { resolveBeatContextWorkbenchTarget } from "@/features/canvas/application/beatContextNodeModel";
import {
  buildNodeActionBeatContextData,
  isSameNodeActionBeatContext,
  resolveNodeActionBeatContext,
} from "@/features/canvas/application/nodeActionBeatContext";
import { useCanvasStore } from "@/features/canvas/canvasStore";
import {
  CANVAS_NODE_TYPES,
  DEFAULT_NODE_WIDTH,
  type BeatContextNodeData,
  type CanvasNode,
} from "@/features/canvas/domain/canvasNodes";
import {
  extractMainlineContextsFromNode,
  openPresetProjectionInMyCanvas,
} from "@/features/freezone/public";
import { readUrl } from "@/lib/url-params";

export interface NodeMainlineToolbarControllerOptions {
  node: CanvasNode;
  isPresetLocked: boolean;
}

export function useNodeMainlineToolbarController({
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
    () => resolveNodeActionBeatContext(node, readUrl().project),
    [node],
  );
  const canOpenWorkbench = isPresetLocked && Boolean(workbenchTarget);
  const canEnsureBeatContext =
    Boolean(extractableBeatContext) && node.type !== CANVAS_NODE_TYPES.beatContext;

  const openWorkbench = useCallback(() => {
    if (!canOpenWorkbench || !workbenchTarget || openingWorkbench) return;
    const projectId = readUrl().project;
    if (!projectId) {
      console.warn("[freezone] no project_id in URL (?p=<project_id>)");
      return;
    }
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
  }, [canOpenWorkbench, openingWorkbench, workbenchTarget]);

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
      (typeof node.width === "number" ? node.width : DEFAULT_NODE_WIDTH);
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
