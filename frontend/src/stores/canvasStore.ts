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
import {
  reorderStoryboardFrameInGraph,
  updateStoryboardFrameInGraph,
} from '@/features/canvas/domain/storyboardFrames';
import {
  setCanvasNodePositions,
  updateCanvasNodePosition,
} from '@/features/canvas/domain/canvasNodePositions';
import { elevateCanvasNodes } from '@/features/canvas/domain/canvasNodeLayering';
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
import { createCanvasNode } from '@/features/canvas/application/canvasNodeCreation';
import { canvasNodeFactory } from '@/features/canvas/nodeFactoryComposition';
import {
  createCanvasDerivedExportNode,
  createCanvasDerivedUploadNode,
  createCanvasStoryboardSplitNode,
  type CanvasDerivedExportNodeOptions,
} from '@/features/canvas/application/canvasDerivedNodeCreation';
import {
  createCanvasDataEdge,
  createCanvasProgrammaticEdge,
  type CanvasDataEdgeCreationOptions,
} from '@/features/canvas/application/canvasEdgeCreation';
import { updateCanvasNodeData } from '@/features/canvas/application/canvasNodeData';
import { convertCanvasNodeType } from '@/features/canvas/application/canvasNodeConversion';
import {
  duplicateCanvasNodeAsSibling,
  duplicateCanvasNodesAsSiblings,
} from '@/features/canvas/application/canvasNodeDuplication';
import {
  createPanoCaptureNodes,
  type CanvasPanoCapture,
  type CanvasPanoCaptureOptions,
} from '@/features/canvas/application/panoCaptureNodes';
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
  updateCanvasNodeSize,
  type CanvasNodeSizeUpdateOptions,
} from '@/features/canvas/application/canvasNodeSize';
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
    CanvasDocumentLifecycleSlice {
  selectedNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;

  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>
  ) => string;
  addEdge: (source: string, target: string) => string | null;
  addEdgeWithData: (
    source: string,
    target: string,
    data: Record<string, unknown>,
    options?: CanvasDataEdgeCreationOptions,
  ) => string | null;
  findNodePosition: (sourceNodeId: string, newNodeWidth: number, newNodeHeight: number) => { x: number; y: number };
  addDerivedUploadNode: (
    sourceNodeId: string,
    imageUrl: string,
    aspectRatio: string,
    previewImageUrl?: string
  ) => string | null;
  addDerivedExportNode: (
    sourceNodeId: string,
    imageUrl: string,
    aspectRatio: string,
    previewImageUrl?: string,
    options?: CanvasDerivedExportNodeOptions,
  ) => string | null;
  addStoryboardSplitNode: (
    sourceNodeId: string,
    rows: number,
    cols: number,
    frames: StoryboardFrameItem[],
    frameAspectRatio?: string
  ) => string | null;
  /**
   * Clone a node as a result sibling: same type, same params (data merged with
   * `dataOverrides`), and the same upstream connections as the source. Stacked
   * `index` slots below the source. Used by 图片/视频生成 to fan out N results
   * when the user picks 生成数量 > 1 (each generation is its own API call).
   */
  duplicateNodeAsSibling: (
    sourceNodeId: string,
    index: number,
    dataOverrides?: Partial<CanvasNodeData>
  ) => string | null;
  /**
   * Batch-duplicate several nodes at once (used by the multi-selection toolbar's
   * 「创建副本」). Each clone is stacked one slot below its source, keeps the
   * source's upstream connections, and gets a "- 副本" suffix on its display
   * name. The whole batch is a single undo step, and the new clones become the
   * active selection. Returns the created node ids.
   */
  duplicateNodesAsSiblings: (nodeIds: string[]) => string[];

  /**
   * Turn a batch of panorama screenshots into image nodes laid out in a grid to
   * the right of the source node, wrapped in a single display group. Used by the
   * 360 viewer's 2×2 / 4×3 capture: each frame becomes its own exportImage node
   * (no stitched canvas), and the group is purely a front-end container — no new
   * node type. The whole batch is one undo step; returns the group node id.
   */
  addPanoCaptureGroup: (
    sourceNodeId: string,
    captures: CanvasPanoCapture[],
    options?: CanvasPanoCaptureOptions,
  ) => string | null;

  updateNodeData: (nodeId: string, data: Partial<CanvasNodeData>) => void;
  updateNodeSize: (
    nodeId: string,
    size: { width: number; height: number },
    options?: CanvasNodeSizeUpdateOptions,
  ) => void;
  /**
   * Swap a node's `type` in place while keeping its `id`, position, and any
   * already-attached edges. Used when an UploadNode's user picks a video file
   * and the node needs to morph into a VideoNode so the header / toolbar /
   * connectivity match the new resource type.
   */
  convertNodeType: (
    nodeId: string,
    newType: CanvasNodeType,
    dataOverrides?: Partial<CanvasNodeData>
  ) => boolean;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void;
  elevateNodes: (nodeIds: string[], zIndex: number) => void;
  updateStoryboardFrame: (
    nodeId: string,
    frameId: string,
    data: Partial<StoryboardFrameItem>
  ) => void;
  reorderStoryboardFrame: (
    nodeId: string,
    draggedFrameId: string,
    targetFrameId: string
  ) => void;

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

  addNode: (type, position, data = {}) => {
    const state = get();
    const newNode = createCanvasNode(type, position, data, canvasNodeFactory);
    set({
      nodes: [...state.nodes, newNode],
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
    return newNode.id;
  },

  duplicateNodeAsSibling: (sourceNodeId, index, dataOverrides = {}) => {
    const state = get();
    const result = duplicateCanvasNodeAsSibling(
      state.nodes,
      state.edges,
      sourceNodeId,
      index,
      dataOverrides,
      canvasNodeFactory,
    );
    if (!result) {
      return null;
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
    return result.createdIds[0] ?? null;
  },

  duplicateNodesAsSiblings: (nodeIds) => {
    const state = get();
    const result = duplicateCanvasNodesAsSiblings(
      state.nodes,
      state.edges,
      nodeIds,
      canvasNodeFactory,
    );
    if (result.createdIds.length === 0) {
      return [];
    }

    set({
      nodes: result.nodes,
      edges: result.edges,
      selectedNodeId: result.createdIds.length === 1 ? result.createdIds[0] : null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return result.createdIds;
  },

  addPanoCaptureGroup: (sourceNodeId, captures, options) => {
    const state = get();
    const result = createPanoCaptureNodes(
      state.nodes,
      state.edges,
      sourceNodeId,
      captures,
      options,
      canvasNodeFactory,
    );
    if (!result) {
      return null;
    }

    set({
      nodes: result.nodes,
      edges: result.edges,
      selectedNodeId: result.selectedNodeId,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return result.selectedNodeId;
  },

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

  addDerivedUploadNode: (sourceNodeId, imageUrl, aspectRatio, previewImageUrl) => {
    const state = get();
    const node = createCanvasDerivedUploadNode(
      state.nodes,
      sourceNodeId,
      imageUrl,
      aspectRatio,
      previewImageUrl,
      canvasNodeFactory,
    );

    set({
      nodes: [...state.nodes, node],
      selectedNodeId: node.id,
      activeToolDialog: null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return node.id;
  },

  addDerivedExportNode: (sourceNodeId, imageUrl, aspectRatio, previewImageUrl, options) => {
    const state = get();
    const node = createCanvasDerivedExportNode(
      {
        nodes: state.nodes,
        sourceNodeId,
        imageUrl,
        aspectRatio,
        previewImageUrl,
        options,
        viewport: state.currentViewport,
        viewportSize: state.canvasViewportSize,
      },
      canvasNodeFactory,
    );

    set({
      nodes: [...state.nodes, node],
      selectedNodeId: node.id,
      activeToolDialog: null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return node.id;
  },

  addStoryboardSplitNode: (sourceNodeId, rows, cols, frames, frameAspectRatio) => {
    const state = get();
    const node = createCanvasStoryboardSplitNode(
      state.nodes,
      sourceNodeId,
      rows,
      cols,
      frames,
      frameAspectRatio,
      canvasNodeFactory,
    );

    set({
      nodes: [...state.nodes, node],
      selectedNodeId: node.id,
      activeToolDialog: null,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return node.id;
  },

  convertNodeType: (nodeId, newType, dataOverrides = {}) => {
    const state = get();
    const result = convertCanvasNodeType(
      state.nodes,
      nodeId,
      newType,
      dataOverrides,
    );
    if (!result.changed) {
      return false;
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
    return true;
  },

  updateNodeData: (nodeId, data) => {
    set((state) => {
      const result = updateCanvasNodeData(state.nodes, nodeId, data);
      if (!result.changed) {
        return {};
      }

      return {
        nodes: result.nodes,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
    });
  },

  updateNodeSize: (nodeId, size, options) => {
    set((state) => {
      const result = updateCanvasNodeSize(state.nodes, nodeId, size, options);
      if (!result.changed) {
        return {};
      }

      return {
        nodes: result.nodes,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
    });
  },

  updateNodePosition: (nodeId, position) => {
    set((state) => {
      const result = updateCanvasNodePosition(state.nodes, nodeId, position);
      if (!result.changed) {
        return {};
      }

      return { nodes: result.nodes };
    });
  },

  setNodePositions: (positions) => {
    set((state) => {
      const result = setCanvasNodePositions(state.nodes, positions);
      if (!result.changed) {
        return {};
      }

      return {
        nodes: result.nodes,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
    });
  },

  elevateNodes: (nodeIds, zIndex) => {
    set((state) => ({
      nodes: elevateCanvasNodes(state.nodes, nodeIds, zIndex),
    }));
  },

  updateStoryboardFrame: (nodeId, frameId, data) => {
    set((state) => {
      const result = updateStoryboardFrameInGraph(
        state.nodes,
        nodeId,
        frameId,
        data,
      );
      if (!result.changed) {
        return {};
      }

      return {
        nodes: result.nodes,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
    });
  },

  reorderStoryboardFrame: (nodeId, draggedFrameId, targetFrameId) => {
    set((state) => {
      const result = reorderStoryboardFrameInGraph(
        state.nodes,
        nodeId,
        draggedFrameId,
        targetFrameId,
      );
      if (!result.changed) {
        return {};
      }

      return {
        nodes: result.nodes,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
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
