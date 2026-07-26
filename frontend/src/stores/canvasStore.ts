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
import { findAvailableNodePosition } from '@/features/canvas/domain/canvasGeometry';
import {
  isDeleteToEmpty,
  trackEdit,
  type CanvasMutationSource,
} from '@/features/canvas/domain/canvasMutation';
import { deleteCanvasNodes } from '@/features/canvas/domain/groupSelectionDelete';
import { planCanvasAutoGroupSpawn } from '@/features/canvas/domain/canvasAutoGrouping';
import {
  configureCanvasStoryboardGroup,
  type CanvasStoryboardGroupConfig,
} from '@/features/canvas/domain/canvasStoryboardGroupConfig';
import { reorderCanvasStoryboardGroupMember } from '@/features/canvas/domain/canvasStoryboardGroupMembers';
import { convertCanvasStoryboardGroupToPlain } from '@/features/canvas/domain/canvasStoryboardGroupConversion';
import { fitCanvasGroupToChildren } from '@/features/canvas/domain/canvasGroupFit';
import {
  arrangeCanvasGroupChildren,
  type CanvasGroupArrangementMode,
} from '@/features/canvas/domain/canvasGroupArrangement';
import { ungroupCanvasNode } from '@/features/canvas/domain/canvasGroupRemoval';
import { deleteCanvasEdge } from '@/features/canvas/domain/canvasEdgeDeletion';
import { canvasNodeFactory } from '@/features/canvas/nodeFactoryComposition';
import {
  createCanvasDataEdge,
  createCanvasProgrammaticEdge,
  type CanvasDataEdgeCreationOptions,
} from '@/features/canvas/application/canvasEdgeCreation';
import {
  createCanvasNodeGroup,
  type CanvasGroupCreationOptions,
} from '@/features/canvas/application/canvasGroupCreation';
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
    CanvasDerivedNodeCreationSlice {
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;

  addEdge: (source: string, target: string) => string | null;
  addEdgeWithData: (
    source: string,
    target: string,
    data: Record<string, unknown>,
    options?: CanvasDataEdgeCreationOptions,
  ) => string | null;
  findNodePosition: (sourceNodeId: string, newNodeWidth: number, newNodeHeight: number) => { x: number; y: number };
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;
  groupNodes: (
    nodeIds: string[],
    opts?: CanvasGroupCreationOptions
  ) => string | null;
  /**
   * 快捷派生（spawn）后的自动打组：源节点未在组内 → 与新节点一起新建组；已在
   * 普通组内 → 把新节点并入该组并撑大边界；在分镜组/投影保护组内 → 不打组。
   * opts.label 作为新建组的名字（如「图片反推提示词组」）。返回组 id。
   */
  autoGroupSpawn: (
    sourceNodeId: string,
    spawnedNodeIds: string[],
    opts?: { label?: string }
  ) => string | null;
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
  /**
   * Grow a group's box (and nudge members inward) so it always encloses its
   * children — covers nodes that auto-resize after their image loads, floating
   * headers, etc. Grow-only, so it never fights a manual resize. No-op when the
   * box already fits. Pure layout: no history / autosave churn.
   */
  fitGroupToChildren: (groupNodeId: string) => void;
  /** 把组内子节点按指定方式重新排列（横向 / 纵向 / 网格），并收紧组框。 */
  arrangeGroupChildren: (
    groupNodeId: string,
    mode: CanvasGroupArrangementMode,
  ) => void;
  ungroupNode: (groupNodeId: string) => boolean;
  deleteEdge: (edgeId: string) => void;
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
    setState: (update) => set((state) => update(state)),
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

  addEdge: (source, target) => {
    const state = get();
    const result = createCanvasProgrammaticEdge(
      state.nodes,
      state.edges,
      source,
      target,
    );
    if (!result) {
      return null;
    }
    if (!result.created) {
      return result.edgeId;
    }

    set({
      edges: result.edges,
      ...trackEdit(state),
    });

    return result.edgeId;
  },

  addEdgeWithData: (source, target, data, options) => {
    const state = get();
    const outcome = createCanvasDataEdge(
      state.nodes,
      state.edges,
      source,
      target,
      data,
      options,
    );
    if (!outcome.ok) {
      if (outcome.stage === 'propagation') {
        console.warn('[freezone] rejected propagating edge', outcome.reason, outcome.edge);
      } else if (outcome.stage === 'role') {
        console.warn('[freezone] rejected role binding edge', outcome.reason, outcome.edge);
      }
      return null;
    }
    if (!outcome.result.created) {
      return outcome.result.edgeId;
    }

    set({
      edges: outcome.result.edges,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return outcome.result.edgeId;
  },

  findNodePosition: (sourceNodeId, newNodeWidth, newNodeHeight) => {
    const state = get();
    return findAvailableNodePosition({
      nodes: state.nodes,
      sourceNodeId,
      newNodeWidth,
      newNodeHeight,
      viewport: state.currentViewport,
      viewportSize: state.canvasViewportSize,
    });
  },

  deleteNode: (nodeId) => {
    get().deleteNodes([nodeId]);
  },

  deleteNodes: (nodeIds) => {
    const state = get();
    const result = deleteCanvasNodes(state.nodes, state.edges, nodeIds);
    if (!result) {
      return;
    }

    const editSource: CanvasMutationSource = isDeleteToEmpty(
      state.nodes.length,
      result.nodes.length,
    )
      ? "delete_to_empty"
      : "user_edit";

    set({
      nodes: result.nodes,
      edges: result.edges,
      selectedNodeId:
        state.selectedNodeId && result.deletedNodeIds.has(state.selectedNodeId)
          ? null
          : state.selectedNodeId,
      activeToolDialog:
        state.activeToolDialog && result.deletedNodeIds.has(state.activeToolDialog.nodeId)
          ? null
          : state.activeToolDialog,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state, editSource),
    });
  },

  groupNodes: (nodeIds, opts) => {
    const state = get();
    const result = createCanvasNodeGroup(
      state.nodes,
      nodeIds,
      opts,
      canvasNodeFactory,
    );
    if (!result) {
      return null;
    }

    set({
      nodes: result.nodes,
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

  autoGroupSpawn: (sourceNodeId, spawnedNodeIds, opts) => {
    const state = get();
    const plan = planCanvasAutoGroupSpawn(
      state.nodes,
      sourceNodeId,
      spawnedNodeIds,
    );
    if (!plan) {
      return null;
    }
    if (plan.kind === 'create_group') {
      return get().groupNodes(plan.nodeIds, {
        label: opts?.label,
        extraPadding: 20,
      });
    }

    set({
      nodes: plan.nodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
    get().fitGroupToChildren(plan.groupNodeId);
    return plan.groupNodeId;
  },

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

  fitGroupToChildren: (groupNodeId) => {
    const state = get();
    const nodes = fitCanvasGroupToChildren(state.nodes, groupNodeId);
    if (!nodes) {
      return;
    }
    set({ nodes });
  },

  arrangeGroupChildren: (groupNodeId, mode) => {
    const state = get();
    const nodes = arrangeCanvasGroupChildren(state.nodes, groupNodeId, mode);
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

  ungroupNode: (groupNodeId) => {
    const state = get();
    const result = ungroupCanvasNode(state.nodes, state.edges, groupNodeId);
    if (!result) {
      return false;
    }

    set({
      nodes: result.nodes,
      edges: result.edges,
      selectedNodeId: state.selectedNodeId === groupNodeId ? null : state.selectedNodeId,
      activeToolDialog:
        state.activeToolDialog?.nodeId === groupNodeId ? null : state.activeToolDialog,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return true;
  },

  deleteEdge: (edgeId) => {
    set((state) => {
      const edges = deleteCanvasEdge(state.edges, edgeId);
      if (!edges) {
        return {};
      }

      return {
        edges,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
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
