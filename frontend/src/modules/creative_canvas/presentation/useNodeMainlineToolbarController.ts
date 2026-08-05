// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from "react";

import { CANVAS_NODE_TYPES } from "../domain/canvasConnection";
import type {
  BeatContextNodeData,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
} from "../domain/canvasNodeData";
import { DEFAULT_CANVAS_NODE_WIDTH } from "../domain/canvasGeometry";
import { extractMainlineContextsFromNode } from "../domain/mainlineContext";
import {
  buildNodeActionBeatContextData,
  isSameNodeActionBeatContext,
  resolveNodeActionBeatContext,
} from "../application/nodeActionBeatContext";
import { resolveBeatContextWorkbenchTarget } from "../application/beatContextNodeModel";

export interface NodeMainlineToolbarStore {
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  setSelectedNode: (id: string | null) => void;
  requestFocusNode: (id: string) => void;
  nodes: readonly CanvasNode[];
}

export type NodeMainlineToolbarStoreHook = {
  <TSelected>(
    selector: (state: NodeMainlineToolbarStore) => TSelected,
  ): TSelected;
  getState: () => NodeMainlineToolbarStore;
};

export type NodeMainlineOpenPresetProjection = (
  projectId: string,
  options: {
    scope: 'beat';
    episode: number;
    beat: number;
    primary_slot: string;
  },
) => Promise<unknown>;

export interface NodeMainlineToolbarControllerOptions {
  projectId: string;
  node: CanvasNode;
  isPresetLocked: boolean;
}

export function createUseNodeMainlineToolbarController({
  useStore,
  openPresetProjectionInMyCanvas,
}: {
  useStore: NodeMainlineToolbarStoreHook;
  openPresetProjectionInMyCanvas: NodeMainlineOpenPresetProjection;
}) {
  return function useNodeMainlineToolbarController({
    projectId,
    node,
    isPresetLocked,
  }: NodeMainlineToolbarControllerOptions) {
    const addNode = useStore((state) => state.addNode);
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const requestFocusNode = useStore((state) => state.requestFocusNode);
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

      const existing = useStore
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
  };
}

export type NodeMainlineToolbarController = ReturnType<
  ReturnType<typeof createUseNodeMainlineToolbarController>
>;
