// Copyright (c) 2026 AI anime
import { useCallback, useRef } from 'react';

import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';
import {
  planCanvasClipboardDuplication,
  type CanvasClipboardDuplicationOptions,
  type CanvasClipboardDuplicationPorts,
  type CanvasClipboardDuplicationSourceEdge,
  type CanvasClipboardDuplicationSourceNode,
} from '../application/canvasClipboardDuplication';

export interface CanvasClipboardSelectableNode<TNodeData extends object>
  extends CanvasClipboardDuplicationSourceNode<TNodeData> {
  selected?: boolean;
}

export interface CanvasClipboardNodeDimensionCommit {
  nodeId: string;
  width: number;
  height: number;
}

export interface CanvasClipboardNodeSelectionCommit {
  nodeId: string;
  selected: boolean;
}

export interface CanvasClipboardDuplicationResult {
  firstNodeId: string | null;
  idMap: Map<string, string>;
}

export interface CanvasClipboardAssetMigrationSummary {
  migrated: number;
  failed: number;
}

export interface CanvasClipboardAssetMigrationParams<
  TNodeData extends object,
> {
  nodes: Array<{ id: string; data: TNodeData }>;
  targetProject: string;
  getLiveNodeData: (nodeId: string) => TNodeData | null;
  updateNodeData: (nodeId: string, patch: Partial<TNodeData>) => void;
}

export interface CanvasClipboardDuplicationControllerOptions<
  TNode extends CanvasClipboardSelectableNode<TNodeData>,
  TEdge extends CanvasClipboardDuplicationSourceEdge,
  TNodeType,
  TNodeData extends object,
> {
  getGraph: () => {
    nodes: readonly TNode[];
    edges: readonly TEdge[];
  };
  duplicationPorts: CanvasClipboardDuplicationPorts<
    TNode,
    TNodeType,
    TNodeData
  >;
  createNode: (
    type: TNodeType,
    position: { x: number; y: number },
    data?: Partial<TNodeData>,
  ) => string;
  commitNodeDimensions: (
    updates: CanvasClipboardNodeDimensionCommit[],
  ) => void;
  connectNodes: (connection: {
    source: string;
    target: string;
    sourceHandle: string;
    targetHandle: string;
  }) => void;
  commitNodeSelection: (
    updates: CanvasClipboardNodeSelectionCommit[],
  ) => void;
  selectNode: (nodeId: string | null) => void;
  currentProject: string | null;
  migrateAssets: (
    params: CanvasClipboardAssetMigrationParams<TNodeData>,
  ) => Promise<CanvasClipboardAssetMigrationSummary>;
  updateNodeData: (
    nodeId: string,
    patch: Partial<TNodeData>,
  ) => void;
  notifyMigrationSuccess: (count: number) => void;
  notifyMigrationPartialFailure: (count: number) => void;
  reportMigrationError: (error: unknown) => void;
}

export interface CanvasClipboardDuplicationController<
  TNode,
  TEdge,
> {
  duplicateNodes: (
    sourceNodeIds: string[],
    options?: CanvasClipboardDuplicationOptions<TNode, TEdge>,
  ) => CanvasClipboardDuplicationResult | null;
  pasteFromClipboard: (
    snapshot: CanvasClipboardSnapshot<TNode, TEdge> | null,
    targetFlow?: { x: number; y: number },
  ) => string | null;
  resetPasteIteration: () => void;
}

export function useCanvasClipboardDuplicationController<
  TNode extends CanvasClipboardSelectableNode<TNodeData>,
  TEdge extends CanvasClipboardDuplicationSourceEdge,
  TNodeType,
  TNodeData extends object,
>({
  getGraph,
  duplicationPorts,
  createNode,
  commitNodeDimensions,
  connectNodes,
  commitNodeSelection,
  selectNode,
  currentProject,
  migrateAssets,
  updateNodeData,
  notifyMigrationSuccess,
  notifyMigrationPartialFailure,
  reportMigrationError,
}: CanvasClipboardDuplicationControllerOptions<
  TNode,
  TEdge,
  TNodeType,
  TNodeData
>): CanvasClipboardDuplicationController<TNode, TEdge> {
  const pasteIterationRef = useRef(0);

  const duplicateNodes = useCallback(
    (
      sourceNodeIds: string[],
      options: CanvasClipboardDuplicationOptions<TNode, TEdge> = {},
    ): CanvasClipboardDuplicationResult | null => {
      const graph = getGraph();
      const plan = planCanvasClipboardDuplication({
        ...graph,
        sourceNodeIds,
        pasteIteration: pasteIterationRef.current,
        ports: duplicationPorts,
        options,
      });
      if (!plan) {
        return null;
      }

      const idMap = new Map<string, string>();
      const pastedForMigration: Array<{ id: string; data: TNodeData }> = [];
      const dimensionUpdates: CanvasClipboardNodeDimensionCommit[] = [];
      for (const plannedNode of plan.nodes) {
        const nodeId = createNode(
          plannedNode.type,
          plannedNode.position,
          { ...plannedNode.data },
        );
        idMap.set(plannedNode.sourceNodeId, nodeId);
        pastedForMigration.push({ id: nodeId, data: plannedNode.data });
        dimensionUpdates.push({
          nodeId,
          width: plannedNode.size.width,
          height: plannedNode.size.height,
        });
      }
      if (dimensionUpdates.length > 0) {
        commitNodeDimensions(dimensionUpdates);
      }

      for (const connection of plan.connections) {
        const source = idMap.get(connection.sourceNodeId);
        const target = idMap.get(connection.targetNodeId);
        if (!source || !target) {
          continue;
        }
        connectNodes({
          source,
          target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
        });
      }

      if (plan.advancePasteIteration) {
        pasteIterationRef.current += 1;
      }
      const firstNodeId = idMap.get(plan.nodes[0].sourceNodeId) ?? null;
      if (plan.selection === 'all' && idMap.size > 0) {
        const pastedIds = new Set(idMap.values());
        commitNodeSelection(
          getGraph()
            .nodes
            .filter((node) => Boolean(node.selected) !== pastedIds.has(node.id))
            .map((node) => ({
              nodeId: node.id,
              selected: pastedIds.has(node.id),
            })),
        );
        selectNode(pastedIds.size === 1 ? firstNodeId : null);
      } else if (plan.selection === 'first' && firstNodeId) {
        selectNode(firstNodeId);
      }

      if (
        plan.sourceProject
        && currentProject
        && plan.sourceProject !== currentProject
        && pastedForMigration.length > 0
      ) {
        void migrateAssets({
          nodes: pastedForMigration,
          targetProject: currentProject,
          getLiveNodeData: (nodeId) =>
            getGraph().nodes.find((node) => node.id === nodeId)?.data ?? null,
          updateNodeData,
        })
          .then(({ migrated, failed }) => {
            if (failed > 0) {
              notifyMigrationPartialFailure(failed);
            } else if (migrated > 0) {
              notifyMigrationSuccess(migrated);
            }
          })
          .catch(reportMigrationError);
      }

      return { firstNodeId, idMap };
    },
    [
      commitNodeDimensions,
      commitNodeSelection,
      connectNodes,
      createNode,
      currentProject,
      duplicationPorts,
      getGraph,
      migrateAssets,
      notifyMigrationPartialFailure,
      notifyMigrationSuccess,
      reportMigrationError,
      selectNode,
      updateNodeData,
    ],
  );

  const pasteFromClipboard = useCallback(
    (
      snapshot: CanvasClipboardSnapshot<TNode, TEdge> | null,
      targetFlow?: { x: number; y: number },
    ): string | null => {
      if (!snapshot || snapshot.nodes.length === 0) {
        return null;
      }
      return duplicateNodes([], {
        sourceSnapshot: snapshot,
        targetFlowPosition: targetFlow,
        selectAll: true,
      })?.firstNodeId ?? null;
    },
    [duplicateNodes],
  );

  const resetPasteIteration = useCallback(() => {
    pasteIterationRef.current = 0;
  }, []);

  return {
    duplicateNodes,
    pasteFromClipboard,
    resetPasteIteration,
  };
}
