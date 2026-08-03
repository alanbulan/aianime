// Copyright (c) 2026 AI anime
import { getNodeSize, resolveAbsolutePosition } from '../domain/canvasGeometry';
import {
  createSnapshot,
  pushSnapshot,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import {
  arrangeCanvasGroupChildren,
  fitCanvasGroupToChildren,
  planCanvasAutoGroupSpawn,
  trackEdit,
  ungroupCanvasNode,
  type CanvasGroupArrangementMode,
  type CanvasMutationState,
} from '@/modules/creative_canvas/public';
import {
  isGroupNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  type ActiveToolDialog,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  createCanvasNodeGroup,
  type CanvasGroupCreationOptions,
} from '../application/canvasGroupCreation';
import type { NodeFactory } from '../application/ports';

const canvasGroupLifecyclePorts = {
  isGroupNode,
  isProtectedGroupNode: isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  getNodeSize,
};

export interface CanvasGroupLifecycleSlice {
  groupNodes: (
    nodeIds: string[],
    options?: CanvasGroupCreationOptions,
  ) => string | null;
  /**
   * Group a source with spawned nodes, or append spawned nodes to its ordinary
   * ancestor group. Storyboard and projection-protected groups are excluded.
   */
  autoGroupSpawn: (
    sourceNodeId: string,
    spawnedNodeIds: string[],
    options?: { label?: string },
  ) => string | null;
  /** Grow a group around its children without recording history. */
  fitGroupToChildren: (groupNodeId: string) => void;
  /** Arrange children and commit the layout as one undoable edit. */
  arrangeGroupChildren: (
    groupNodeId: string,
    mode: CanvasGroupArrangementMode,
  ) => void;
  ungroupNode: (groupNodeId: string) => boolean;
}

interface CanvasGroupLifecycleState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
}

interface CanvasGroupLifecycleSliceDependencies {
  nodeFactory: NodeFactory;
  getState: () => CanvasGroupLifecycleState;
  setState: (patch: Partial<CanvasGroupLifecycleState>) => void;
}

export function createZustandCanvasGroupLifecycleSlice(
  dependencies: CanvasGroupLifecycleSliceDependencies,
): CanvasGroupLifecycleSlice {
  const commitGroupNodes = (
    nodeIds: string[],
    options?: CanvasGroupCreationOptions,
  ): string | null => {
    const state = dependencies.getState();
    const result = createCanvasNodeGroup(
      state.nodes,
      nodeIds,
      options,
      dependencies.nodeFactory,
    );
    if (!result) {
      return null;
    }

    dependencies.setState({
      nodes: result.nodes,
      selectedNodeId: result.groupNodeId,
      activeToolDialog:
        state.activeToolDialog
          && result.groupedNodeIds.has(state.activeToolDialog.nodeId)
          ? null
          : state.activeToolDialog,
      history: {
        past: pushSnapshot(
          state.history.past,
          createSnapshot(state.nodes, state.edges),
        ),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
    return result.groupNodeId;
  };

  const fitGroup = (groupNodeId: string): void => {
    const state = dependencies.getState();
    const nodes = fitCanvasGroupToChildren(
      state.nodes,
      groupNodeId,
      canvasGroupLifecyclePorts,
    );
    if (nodes) {
      dependencies.setState({ nodes });
    }
  };

  return {
    groupNodes(nodeIds, options) {
      return commitGroupNodes(nodeIds, options);
    },

    autoGroupSpawn(sourceNodeId, spawnedNodeIds, options) {
      const state = dependencies.getState();
      const plan = planCanvasAutoGroupSpawn(
        state.nodes,
        sourceNodeId,
        spawnedNodeIds,
        canvasGroupLifecyclePorts,
      );
      if (!plan) {
        return null;
      }
      if (plan.kind === 'create_group') {
        return commitGroupNodes(plan.nodeIds, {
          label: options?.label,
          extraPadding: 20,
        });
      }

      dependencies.setState({
        nodes: plan.nodes,
        history: {
          past: pushSnapshot(
            state.history.past,
            createSnapshot(state.nodes, state.edges),
          ),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      });
      fitGroup(plan.groupNodeId);
      return plan.groupNodeId;
    },

    fitGroupToChildren(groupNodeId) {
      fitGroup(groupNodeId);
    },

    arrangeGroupChildren(groupNodeId, mode) {
      const state = dependencies.getState();
      const nodes = arrangeCanvasGroupChildren(
        state.nodes,
        groupNodeId,
        mode,
        canvasGroupLifecyclePorts,
      );
      if (!nodes) {
        return;
      }
      dependencies.setState({
        nodes,
        history: {
          past: pushSnapshot(
            state.history.past,
            createSnapshot(state.nodes, state.edges),
          ),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      });
    },

    ungroupNode(groupNodeId) {
      const state = dependencies.getState();
      const result = ungroupCanvasNode(
        state.nodes,
        state.edges,
        groupNodeId,
        {
          isGroupNode,
          isProtectedGroupNode: isProtectedProjectionGroupNode,
          resolveAbsolutePosition,
        },
      );
      if (!result) {
        return false;
      }

      dependencies.setState({
        nodes: result.nodes,
        edges: result.edges,
        selectedNodeId: state.selectedNodeId === groupNodeId
          ? null
          : state.selectedNodeId,
        activeToolDialog: state.activeToolDialog?.nodeId === groupNodeId
          ? null
          : state.activeToolDialog,
        history: {
          past: pushSnapshot(
            state.history.past,
            createSnapshot(state.nodes, state.edges),
          ),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      });
      return true;
    },
  };
}
