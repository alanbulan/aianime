// Copyright (c) 2026 AI anime
import {
  addCanvasStoryboardGroupMembers,
  configureCanvasStoryboardGroup,
  convertCanvasStoryboardGroupToPlain,
  createSnapshot,
  createCanvasStoryboardGroup,
  pushSnapshot,
  reorderCanvasStoryboardGroupMember,
  trackEdit,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
  type CanvasStoryboardMemberImage,
  type CanvasMutationState,
  type CanvasStoryboardGroupConfig,
} from '@/modules/creative_canvas/public';
import { getNodeSize, resolveAbsolutePosition } from '../domain/canvasGeometry';
import {
  CANVAS_NODE_TYPES,
  DEFAULT_NODE_WIDTH,
  isStoryboardGroupNode,
  type ActiveToolDialog,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { NodeFactory } from '../application/ports';

const storyboardGroupPorts = {
  defaultNodeWidth: DEFAULT_NODE_WIDTH,
  getNodeSize,
  isStoryboardGroupNode,
};

export interface CanvasStoryboardGroupSlice {
  /** Create a storyboard grid group and return its id. */
  mergeStoryboardGroup: (nodeIds: string[]) => string | null;
  /** Reconfigure a storyboard group's grid. */
  setStoryboardGroupConfig: (
    groupNodeId: string,
    config: CanvasStoryboardGroupConfig,
  ) => void;
  /** Move a storyboard member from one grid slot to another. */
  reorderStoryboardMember: (
    groupNodeId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  /** Add image members to a storyboard group's grid. */
  addStoryboardMembers: (
    groupNodeId: string,
    images: CanvasStoryboardMemberImage[],
  ) => void;
  /** Drop storyboard behavior while preserving the plain group. */
  convertStoryboardGroupToPlain: (groupNodeId: string) => void;
}

interface CanvasStoryboardGroupState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState<CanvasNode, CanvasEdge>;
  dragHistorySnapshot: CanvasHistorySnapshot<CanvasNode, CanvasEdge> | null;
}

interface CanvasStoryboardGroupSliceDependencies {
  nodeFactory: NodeFactory;
  getState: () => CanvasStoryboardGroupState;
  setState: (patch: Partial<CanvasStoryboardGroupState>) => void;
}

export function createZustandCanvasStoryboardGroupSlice(
  dependencies: CanvasStoryboardGroupSliceDependencies,
): CanvasStoryboardGroupSlice {
  const storyboardCreationPorts = {
    ...storyboardGroupPorts,
    createGroupNode: (
      position: { x: number; y: number },
      data: Record<string, unknown>,
    ) => dependencies.nodeFactory.createNode(
      CANVAS_NODE_TYPES.group,
      position,
      data,
    ),
    resolveAbsolutePosition,
  };
  const storyboardMemberAdditionPorts = {
    ...storyboardGroupPorts,
    createMemberNode: (data: Record<string, unknown>) =>
      dependencies.nodeFactory.createNode(
        CANVAS_NODE_TYPES.exportImage,
        { x: 0, y: 0 },
        data,
      ),
  };

  return {
    mergeStoryboardGroup(nodeIds) {
      const state = dependencies.getState();
      const result = createCanvasStoryboardGroup(
        state.nodes,
        state.edges,
        nodeIds,
        storyboardCreationPorts,
      );
      if (!result) {
        return null;
      }

      dependencies.setState({
        nodes: result.nodes,
        edges: result.edges,
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
    },

    setStoryboardGroupConfig(groupNodeId, config) {
      const state = dependencies.getState();
      const nodes = configureCanvasStoryboardGroup(
        state.nodes,
        groupNodeId,
        config,
        storyboardGroupPorts,
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

    reorderStoryboardMember(groupNodeId, fromIndex, toIndex) {
      const state = dependencies.getState();
      const nodes = reorderCanvasStoryboardGroupMember(
        state.nodes,
        groupNodeId,
        fromIndex,
        toIndex,
        storyboardGroupPorts,
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

    addStoryboardMembers(groupNodeId, images) {
      const state = dependencies.getState();
      const result = addCanvasStoryboardGroupMembers(
        state.nodes,
        groupNodeId,
        images,
        storyboardMemberAdditionPorts,
      );
      if (!result) {
        return;
      }
      dependencies.setState({
        nodes: result.nodes,
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

    convertStoryboardGroupToPlain(groupNodeId) {
      const state = dependencies.getState();
      const result = convertCanvasStoryboardGroupToPlain(
        state.nodes,
        state.edges,
        groupNodeId,
        storyboardGroupPorts,
      );
      if (!result) {
        return;
      }
      dependencies.setState({
        nodes: result.nodes,
        edges: result.edges,
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
  };
}
