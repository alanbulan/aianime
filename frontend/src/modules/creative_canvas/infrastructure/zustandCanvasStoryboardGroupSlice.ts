// Copyright (c) 2026 AI anime
import { addCanvasStoryboardGroupMembers, type CanvasStoryboardMemberImage } from '../application/canvasStoryboardGroupMemberAddition';
import { configureCanvasStoryboardGroup, type CanvasStoryboardGroupConfig } from '../domain/canvasStoryboardGroupConfig';
import { DEFAULT_CANVAS_NODE_WIDTH, getNodeSize, resolveAbsolutePosition } from '../domain/canvasGeometry';
import { convertCanvasStoryboardGroupToPlain } from '../domain/canvasStoryboardGroupConversion';
import { createSnapshot, pushSnapshot, type CanvasHistorySnapshot, type CanvasHistoryState } from '../domain/canvasHistory';
import { createCanvasStoryboardGroup } from '../application/canvasStoryboardGroupCreation';
import { reorderCanvasStoryboardGroupMember } from '../domain/canvasStoryboardGroupMembers';
import { trackEdit, type CanvasMutationState } from '../domain/canvasMutation';
import { type CanvasToolDialogRequest as ActiveToolDialog } from '../domain/canvasNodeTool';
import { type CanvasEdge, type CanvasNode } from '../domain/canvasNodeData';
import { isStoryboardGroupNode } from '../domain/canvasNodePredicates';
import { type NodeFactory } from '../application/canvasGraphPorts';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';






const storyboardGroupPorts = {
  defaultNodeWidth: DEFAULT_CANVAS_NODE_WIDTH,
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
