// Copyright (c) 2026 AI anime
import {
  createSnapshot,
  pushSnapshot,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '../domain/canvasHistory';
import { trackEdit, type CanvasMutationState } from '../domain/canvasMutation';
import type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
} from '../domain/canvasNodes';
import {
  configureCanvasStoryboardGroup,
  type CanvasStoryboardGroupConfig,
} from '../domain/canvasStoryboardGroupConfig';
import { convertCanvasStoryboardGroupToPlain } from '../domain/canvasStoryboardGroupConversion';
import { reorderCanvasStoryboardGroupMember } from '../domain/canvasStoryboardGroupMembers';
import { createCanvasStoryboardGroup } from '../application/canvasStoryboardGroupCreation';
import {
  addCanvasStoryboardGroupMembers,
  type CanvasStoryboardMemberImage,
} from '../application/canvasStoryboardGroupMemberAddition';
import type { NodeFactory } from '../application/ports';

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
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
}

interface CanvasStoryboardGroupSliceDependencies {
  nodeFactory: NodeFactory;
  getState: () => CanvasStoryboardGroupState;
  setState: (patch: Partial<CanvasStoryboardGroupState>) => void;
}

export function createZustandCanvasStoryboardGroupSlice(
  dependencies: CanvasStoryboardGroupSliceDependencies,
): CanvasStoryboardGroupSlice {
  return {
    mergeStoryboardGroup(nodeIds) {
      const state = dependencies.getState();
      const result = createCanvasStoryboardGroup(
        state.nodes,
        state.edges,
        nodeIds,
        dependencies.nodeFactory,
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
        dependencies.nodeFactory,
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
