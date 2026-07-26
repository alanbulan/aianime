// Copyright (c) 2026 AI anime
import { create } from 'zustand';

import {
  type ActiveToolDialog,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
  type NodeToolType,
  type StoryboardFrameItem,
} from '@/features/canvas/domain/canvasNodes';
import {
  createSnapshot,
  pushSnapshot,
} from '@/features/canvas/domain/canvasHistory';
import { trackEdit } from '@/features/canvas/domain/canvasMutation';
import {
  configureCanvasStoryboardGroup,
  type CanvasStoryboardGroupConfig,
} from '@/features/canvas/domain/canvasStoryboardGroupConfig';
import { reorderCanvasStoryboardGroupMember } from '@/features/canvas/domain/canvasStoryboardGroupMembers';
import { convertCanvasStoryboardGroupToPlain } from '@/features/canvas/domain/canvasStoryboardGroupConversion';
import { canvasNodeFactory } from '@/features/canvas/nodeFactoryComposition';
import { createCanvasStoryboardGroup } from '@/features/canvas/application/canvasStoryboardGroupCreation';
import {
  addCanvasStoryboardGroupMembers,
  type CanvasStoryboardMemberImage,
} from '@/features/canvas/application/canvasStoryboardGroupMemberAddition';
import {
  createZustandCanvasViewportSlice,
  type CanvasViewportSlice,
} from '@/features/canvas/infrastructure/zustandCanvasViewportSlice';
import {
  createZustandCanvasTransientInteractionSlice,
  type CanvasTransientInteractionSlice,
} from '@/features/canvas/infrastructure/zustandCanvasTransientInteractionSlice';
import {
  createZustandCanvasHistorySlice,
  type CanvasHistorySlice,
} from '@/features/canvas/infrastructure/zustandCanvasHistorySlice';
import {
  createZustandCanvasGraphMutationSlice,
  type CanvasGraphMutationSlice,
} from '@/features/canvas/infrastructure/zustandCanvasGraphMutationSlice';
import {
  createZustandCanvasDocumentLifecycleSlice,
  type CanvasDocumentLifecycleSlice,
} from '@/features/canvas/infrastructure/zustandCanvasDocumentLifecycleSlice';
import {
  createZustandCanvasNodeMutationSlice,
  type CanvasNodeMutationSlice,
} from '@/features/canvas/infrastructure/zustandCanvasNodeMutationSlice';
import {
  createZustandCanvasDerivedNodeCreationSlice,
  type CanvasDerivedNodeCreationSlice,
} from '@/features/canvas/infrastructure/zustandCanvasDerivedNodeCreationSlice';
import {
  createZustandCanvasNodeDeletionSlice,
  type CanvasNodeDeletionSlice,
} from '@/features/canvas/infrastructure/zustandCanvasNodeDeletionSlice';
import {
  createZustandCanvasGroupLifecycleSlice,
  type CanvasGroupLifecycleSlice,
} from '@/features/canvas/infrastructure/zustandCanvasGroupLifecycleSlice';

export type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  NodeToolType,
  StoryboardFrameItem,
};

interface CanvasState
  extends CanvasViewportSlice,
    CanvasTransientInteractionSlice,
    CanvasHistorySlice,
    CanvasGraphMutationSlice,
    CanvasDocumentLifecycleSlice,
    CanvasNodeMutationSlice,
    CanvasDerivedNodeCreationSlice,
    CanvasNodeDeletionSlice,
    CanvasGroupLifecycleSlice {
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;

  /**
   * 合并分镜组: group nodes into a "分镜组" whose members are packed into a
   * uniform 宫格 grid (reading order). Returns the new group id, or null.
   */
  mergeStoryboardGroup: (nodeIds: string[]) => string | null;
  /** Re-configure a storyboard group's grid (aspect / columns / index badge). */
  setStoryboardGroupConfig: (
    groupNodeId: string,
    config: CanvasStoryboardGroupConfig
  ) => void;
  /** Move a storyboard member from one grid slot to another (drag-reorder). */
  reorderStoryboardMember: (groupNodeId: string, fromIndex: number, toIndex: number) => void;
  /** Add image members (from upload / history) to a storyboard group's grid. */
  addStoryboardMembers: (
    groupNodeId: string,
    images: CanvasStoryboardMemberImage[]
  ) => void;
  /** Drop the storyboard behaviour, leaving a plain group with the same members. */
  convertStoryboardGroupToPlain: (groupNodeId: string) => void;
  setSelectedNode: (nodeId: string | null) => void;

  openToolDialog: (dialog: ActiveToolDialog) => void;
  closeToolDialog: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  selectedNodeId: null,
  activeToolDialog: null,
  ...createZustandCanvasViewportSlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasTransientInteractionSlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasHistorySlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasGraphMutationSlice({
    getState: get,
    setState: (patch) => set(patch),
    updateState: (update) => set((state) => update(state)),
  }),
  ...createZustandCanvasDocumentLifecycleSlice({
    setState: (patch) => set(patch),
    updateState: (update) => set((state) => update(state)),
  }),
  ...createZustandCanvasNodeMutationSlice({
    nodeFactory: canvasNodeFactory,
    getState: get,
    setState: (patch) => set(patch),
    updateState: (update) => set((state) => update(state)),
  }),
  ...createZustandCanvasDerivedNodeCreationSlice({
    nodeFactory: canvasNodeFactory,
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasNodeDeletionSlice({
    getState: get,
    setState: (patch) => set(patch),
  }),
  ...createZustandCanvasGroupLifecycleSlice({
    nodeFactory: canvasNodeFactory,
    getState: get,
    setState: (patch) => set(patch),
  }),

  mergeStoryboardGroup: (nodeIds) => {
    const state = get();
    const result = createCanvasStoryboardGroup(
      state.nodes,
      state.edges,
      nodeIds,
      canvasNodeFactory,
    );
    if (!result) {
      return null;
    }

    set({
      nodes: result.nodes,
      edges: result.edges,
      selectedNodeId: result.groupNodeId,
      activeToolDialog:
        state.activeToolDialog && result.groupedNodeIds.has(state.activeToolDialog.nodeId)
          ? null
          : state.activeToolDialog,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return result.groupNodeId;
  },

  setStoryboardGroupConfig: (groupNodeId, config) => {
    const state = get();
    const nodes = configureCanvasStoryboardGroup(
      state.nodes,
      groupNodeId,
      config,
    );
    if (!nodes) {
      return;
    }

    set({
      nodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
  },

  reorderStoryboardMember: (groupNodeId, fromIndex, toIndex) => {
    const state = get();
    const nodes = reorderCanvasStoryboardGroupMember(
      state.nodes,
      groupNodeId,
      fromIndex,
      toIndex,
    );
    if (!nodes) {
      return;
    }

    set({
      nodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
  },

  addStoryboardMembers: (groupNodeId, images) => {
    const state = get();
    const result = addCanvasStoryboardGroupMembers(
      state.nodes,
      groupNodeId,
      images,
      canvasNodeFactory,
    );
    if (!result) {
      return;
    }

    set({
      nodes: result.nodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
  },

  convertStoryboardGroupToPlain: (groupNodeId) => {
    const state = get();
    const result = convertCanvasStoryboardGroupToPlain(
      state.nodes,
      state.edges,
      groupNodeId,
    );
    if (!result) {
      return;
    }

    set({
      nodes: result.nodes,
      edges: result.edges,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
  },

  setSelectedNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  openToolDialog: (dialog) => {
    set({ activeToolDialog: dialog });
  },

  closeToolDialog: () => {
    set({ activeToolDialog: null });
  },
}));

/**
 * True while a box-selection spans 2+ nodes. Node components use this to hide
 * their per-node bottom ops panel during a multi-select (the panels only make
 * sense for a single, intentionally-clicked node and otherwise clutter the
 * canvas). The selector returns a boolean so subscribers only re-render when
 * the multi-select state actually flips.
 */
export function useIsBoxSelecting(): boolean {
  return useCanvasStore((state) => {
    let count = 0;
    for (const node of state.nodes) {
      if (node.selected) {
        count += 1;
        if (count > 1) {
          return true;
        }
      }
    }
    return false;
  });
}
