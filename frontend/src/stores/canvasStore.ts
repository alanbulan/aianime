// Copyright (c) 2026 AI anime
import { create } from 'zustand';
import {
  type Viewport,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';

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
  normalizeHistory,
  pushSnapshot,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '@/features/canvas/domain/canvasHistory';
import { findAvailableNodePosition } from '@/features/canvas/domain/canvasGeometry';
import { normalizeEdgesWithNodes } from '@/features/canvas/domain/canvasEdgeNormalization';
import {
  isDeleteToEmpty,
  trackEdit,
  type CanvasMutationSource,
  type CanvasMutationState,
} from '@/features/canvas/domain/canvasMutation';
import {
  reorderStoryboardFrameInGraph,
  updateStoryboardFrameInGraph,
} from '@/features/canvas/domain/storyboardFrames';
import {
  setCanvasNodePositions,
  updateCanvasNodePosition,
} from '@/features/canvas/domain/canvasNodePositions';
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
import {
  type ViewportBookmark,
  type ViewportBookmarks,
  createEmptyBookmarks,
  normalizeBookmarks,
  replaceViewportBookmark,
} from '@/features/canvas/domain/viewportBookmarks';
import { normalizeCanvasData } from '@/features/canvas/application/canvasDataNormalization';
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
  prepareCanvasReactFlowConnection,
  type CanvasDataEdgeCreationOptions,
} from '@/features/canvas/application/canvasEdgeCreation';
import { applyCanvasNodeChangeEffects } from '@/features/canvas/application/canvasNodeChangeEffects';
import { applyCanvasEdgeChangeEffects } from '@/features/canvas/application/canvasEdgeChangeEffects';
import { navigateCanvasHistory } from '@/features/canvas/application/canvasHistoryNavigation';
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
  createClosedCanvasImageViewer,
  navigateCanvasImageViewer,
  openCanvasImageViewer,
  type CanvasImageViewerDirection,
  type CanvasImageViewerState,
} from '@/features/canvas/application/canvasImageViewer';

export type {
  ActiveToolDialog,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
  NodeToolType,
  StoryboardFrameItem,
};

interface CanvasState extends CanvasMutationState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  /**
   * 当前由顶部工具栏打开了二级功能浮层（全景 / 多角度 / 打光 / 重绘 / 扩图 /
   * 旋转 / 九宫格）的目标节点 id。浮层打开时，节点自身依赖 `selected` 显示的
   * 操作面板（如 ImageGenNode 底部的生成面板）必须让位给浮层——否则两块操作区
   * 会在节点下方重叠。功能浮层优先级更高。
   */
  activeOverlayNodeId: string | null;
  /**
   * 当前鼠标悬停的节点 id（由 Canvas 的 onNodeMouseEnter/Leave 维护，离开带短
   * 延迟，避免鼠标移到节点上方的浮动按钮栏时按钮提前消失）。供 NodeSpawnPlusOverlay
   * 的「+」、NodeSideActionRail 的上传/替换按钮栏等「hover 才显示」的浮层读取。
   */
  hoveredNodeId: string | null;
  /** 一次性的视口聚焦请求：Canvas 监听到后会 setCenter 然后清掉。 */
  pendingFocusNodeId: string | null;
  activeToolDialog: ActiveToolDialog | null;
  history: CanvasHistoryState;
  dragHistorySnapshot: CanvasHistorySnapshot | null;
  currentViewport: Viewport;
  canvasViewportSize: { width: number; height: number };
  /** 10 fixed viewport bookmark slots (index 0..9 -> digit 1..9,0). Navigation
   * preference, NOT part of undo history; persisted via canvas metadata. */
  viewportBookmarks: ViewportBookmarks;
  imageViewer: CanvasImageViewerState;

  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  replaceEdges: (edges: CanvasEdge[]) => void;

  setCanvasData: (nodes: CanvasNode[], edges: CanvasEdge[], history?: CanvasHistoryState) => void;
  applyCanvasDataEdit: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  hydrateCanvasDraft: (draft: {
    nodes: CanvasNode[];
    edges: CanvasEdge[];
    history?: CanvasHistoryState | null;
    mutation: CanvasMutationState;
  }) => void;
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
  setActiveOverlayNodeId: (nodeId: string | null) => void;
  setHoveredNodeId: (nodeId: string | null) => void;
  /** 请求将视口聚焦到目标节点；Canvas 处理完会通过 clearPendingFocus 复位。 */
  requestFocusNode: (nodeId: string) => void;
  clearPendingFocus: () => void;

  openToolDialog: (dialog: ActiveToolDialog) => void;
  closeToolDialog: () => void;
  setViewportState: (viewport: Viewport) => void;
  setViewportBookmark: (index: number, bookmark: ViewportBookmark | null) => void;
  clearViewportBookmarks: () => void;
  hydrateViewportBookmarks: (list: unknown) => void;
  setCanvasViewportSize: (size: { width: number; height: number }) => void;
  openImageViewer: (imageUrl: string, imageList?: string[]) => void;
  closeImageViewer: () => void;
  navigateImageViewer: (direction: CanvasImageViewerDirection) => void;

  undo: () => boolean;
  redo: () => boolean;
  /**
   * Replace the in-memory undo/redo stacks — used to restore the history that
   * was mirrored to localStorage so undo survives a page refresh. Touches only
   * `history`, never nodes/edges, so it cannot trigger a content save.
   */
  restoreHistory: (history: CanvasHistoryState) => void;

  clearCanvas: () => void;
  /**
   * Clear `pendingClearIntent` after `useCanvasSync` has successfully flushed
   * a `manual_clear` save. The "intent" is one-shot — once consumed it must
   * not influence later autosaves.
   */
  acknowledgePendingClear: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  userEditsSinceHydrate: 0,
  lastMutationSource: null,
  pendingClearIntent: false,
  selectedNodeId: null,
  activeOverlayNodeId: null,
  hoveredNodeId: null,
  pendingFocusNodeId: null,
  activeToolDialog: null,
  history: { past: [], future: [] },
  dragHistorySnapshot: null,
  currentViewport: { x: 0, y: 0, zoom: 1 },
  canvasViewportSize: { width: 0, height: 0 },
  viewportBookmarks: createEmptyBookmarks(),
  imageViewer: createClosedCanvasImageViewer(),

  onNodesChange: (changes) => {
    set((state) => {
      const changedNodes = applyNodeChanges<CanvasNode>(changes, state.nodes);
      return applyCanvasNodeChangeEffects(state, changedNodes, changes);
    });
  },

  onEdgesChange: (changes) => {
    set((state) => {
      const changedEdges = applyEdgeChanges<CanvasEdge>(changes, state.edges);
      return applyCanvasEdgeChangeEffects(state, changedEdges, changes);
    });
  },

  onConnect: (connection) => {
    set((state) => {
      const prepared = prepareCanvasReactFlowConnection(
        state.nodes,
        state.edges,
        connection,
      );
      if (!prepared) {
        return {};
      }
      return {
        edges: addEdge<CanvasEdge>(prepared, state.edges),
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
    });
  },

  replaceEdges: (edges) => {
    set((state) => {
      if (state.edges === edges) {
        return {};
      }
      const normalizedEdges = normalizeEdgesWithNodes(edges, state.nodes);
      return {
        edges: normalizedEdges,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
    });
  },

  setCanvasData: (nodes, edges, history) => {
    const normalizedCanvas = normalizeCanvasData(nodes, edges);

    set({
      nodes: normalizedCanvas.nodes,
      edges: normalizedCanvas.edges,
      selectedNodeId: null,
      activeToolDialog: null,
      history: normalizeHistory(history, normalizeCanvasData),
      dragHistorySnapshot: null,
      // Hydrate / canvas switch — treat the store as freshly loaded so the
      // dangerous-empty guard does not misfire on the first signature pass.
      userEditsSinceHydrate: 0,
      lastMutationSource: null,
      pendingClearIntent: false,
    });
  },

  applyCanvasDataEdit: (nodes, edges) => {
    const normalizedCanvas = normalizeCanvasData(nodes, edges);

    set((state) => {
      const editSource: CanvasMutationSource = isDeleteToEmpty(
        state.nodes.length,
        normalizedCanvas.nodes.length,
      )
        ? "delete_to_empty"
        : "user_edit";
      return {
        nodes: normalizedCanvas.nodes,
        edges: normalizedCanvas.edges,
        selectedNodeId: null,
        activeToolDialog: null,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state, editSource),
      };
    });
  },

  hydrateCanvasDraft: (draft) => {
    const normalizedCanvas = normalizeCanvasData(draft.nodes, draft.edges);

    set({
      nodes: normalizedCanvas.nodes,
      edges: normalizedCanvas.edges,
      selectedNodeId: null,
      activeToolDialog: null,
      history: normalizeHistory(
        draft.history ?? undefined,
        normalizeCanvasData,
      ),
      dragHistorySnapshot: null,
      userEditsSinceHydrate: draft.mutation.userEditsSinceHydrate,
      lastMutationSource: draft.mutation.lastMutationSource,
      pendingClearIntent: draft.mutation.pendingClearIntent,
    });
  },

  setViewportState: (viewport) => {
    set({ currentViewport: viewport });
  },

  setViewportBookmark: (index, bookmark) => {
    const current = get().viewportBookmarks;
    const next = replaceViewportBookmark(current, index, bookmark);
    if (next === current) {
      return;
    }
    set({ viewportBookmarks: next });
  },

  clearViewportBookmarks: () => {
    set({ viewportBookmarks: createEmptyBookmarks() });
  },

  hydrateViewportBookmarks: (list) => {
    set({ viewportBookmarks: normalizeBookmarks(list) });
  },

  setCanvasViewportSize: (size) => {
    set({ canvasViewportSize: size });
  },

  openImageViewer: (imageUrl, imageList = []) => {
    set({ imageViewer: openCanvasImageViewer(imageUrl, imageList) });
  },

  closeImageViewer: () => {
    set({ imageViewer: createClosedCanvasImageViewer() });
  },

  navigateImageViewer: (direction) => {
    const current = get().imageViewer;
    const next = navigateCanvasImageViewer(current, direction);
    if (next !== current) {
      set({ imageViewer: next });
    }
  },

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

  setActiveOverlayNodeId: (nodeId) => {
    set((state) =>
      state.activeOverlayNodeId === nodeId ? state : { activeOverlayNodeId: nodeId }
    );
  },

  setHoveredNodeId: (nodeId) => {
    set((state) =>
      state.hoveredNodeId === nodeId ? state : { hoveredNodeId: nodeId }
    );
  },

  requestFocusNode: (nodeId) => {
    // 用「重新指向」的策略而不是去重：哪怕是同一个 id，连续点也会触发新的聚焦。
    set({ pendingFocusNodeId: nodeId });
  },

  clearPendingFocus: () => {
    set({ pendingFocusNodeId: null });
  },

  openToolDialog: (dialog) => {
    set({ activeToolDialog: dialog });
  },

  closeToolDialog: () => {
    set({ activeToolDialog: null });
  },

  undo: () => {
    const state = get();
    const result = navigateCanvasHistory(state, 'undo');
    if (!result) {
      return false;
    }
    set(result);
    return true;
  },

  redo: () => {
    const state = get();
    const result = navigateCanvasHistory(state, 'redo');
    if (!result) {
      return false;
    }
    set(result);
    return true;
  },

  restoreHistory: (history) => {
    set({ history: normalizeHistory(history, normalizeCanvasData) });
  },

  clearCanvas: () => {
    set((state) => {
      if (state.nodes.length === 0 && state.edges.length === 0) {
        return {};
      }

      return {
        nodes: [],
        edges: [],
        selectedNodeId: null,
        activeToolDialog: null,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state, "manual_clear"),
        pendingClearIntent: true,
      };
    });
  },

  acknowledgePendingClear: () => {
    set((state) => (state.pendingClearIntent ? { pendingClearIntent: false } : {}));
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
