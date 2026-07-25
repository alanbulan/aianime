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
  CANVAS_NODE_TYPES,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_NODE_WIDTH,
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  type ActiveToolDialog,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
  type ExportImageNodeResultKind,
  type NodeToolType,
  type StoryboardFrameItem,
  type GroupNodeData,
  isGroupNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
} from '@/features/canvas/domain/canvasNodes';
import {
  createSnapshot,
  normalizeHistory,
  pushSnapshot,
  recordCanvasInteractionHistory,
  redoHistory,
  undoHistory,
  type CanvasHistorySnapshot,
  type CanvasHistoryState,
} from '@/features/canvas/domain/canvasHistory';
import {
  findAvailableNodePosition,
  getDerivedNodePosition,
  getNodeSize,
  resolveAbsolutePosition,
} from '@/features/canvas/domain/canvasGeometry';
import {
  normalizeEdgesWithNodes,
  normalizeHandleId,
} from '@/features/canvas/domain/canvasEdgeNormalization';
import {
  isDeleteToEmpty,
  trackEdit,
  type CanvasMutationSource,
  type CanvasMutationState,
} from '@/features/canvas/domain/canvasMutation';
import {
  DEFAULT_STORYBOARD_ASPECT,
  computeStoryboardBoardLayout,
  computeStoryboardCell,
  computeStoryboardGridLayout,
  resolveStoryboardCols,
  restoreStoryboardEdges,
} from '@/features/canvas/domain/storyboardGroup';
import {
  reorderStoryboardFrameInGraph,
  updateStoryboardFrameInGraph,
} from '@/features/canvas/domain/storyboardFrames';
import {
  setCanvasNodePositions,
  updateCanvasNodePosition,
} from '@/features/canvas/domain/canvasNodePositions';
import { deleteCanvasNodes } from '@/features/canvas/domain/groupSelectionDelete';
import { resolveCanvasGroupMembers } from '@/features/canvas/domain/canvasGrouping';
import { validateCanvasConnection } from '@/features/canvas/domain/canvasConnection';
import { EXPORT_RESULT_DISPLAY_NAME } from '@/features/canvas/domain/nodeDisplay';
import {
  type ViewportBookmark,
  type ViewportBookmarks,
  createEmptyBookmarks,
  normalizeBookmarks,
  replaceViewportBookmark,
} from '@/features/canvas/domain/viewportBookmarks';
import {
  resolveActiveToolDialog,
  resolveSelectedNodeId,
} from '@/features/canvas/domain/canvasSelection';
import {
  BEAT_CONTEXT_NODE_DEFAULT_MEASURED,
  SKILL_NODE_DEFAULT_MEASURED,
  createDefaultStoryboardExportOptions,
  normalizeCanvasNodes,
} from '@/features/canvas/application/canvasNodeHydration';
import { canvasNodeFactory } from '@/features/canvas/nodeFactoryComposition';
import {
  isImageAutoResizableType,
  maybeApplyImageAutoResize,
  resolveAutoImageNodeDimensions,
  resolveGeneratedImageNodeDimensions,
  withManualSizeLock,
} from '@/features/canvas/application/imageNodeLayout';
import {
  resolveDerivedAspectRatio,
  resolveStoryboardSplitNodeDimensions,
} from '@/features/canvas/application/storyboardNodeLayout';
import {
  classifyCanvasNodeChanges,
  hasMeaningfulCanvasEdgeChange,
} from '@/features/canvas/application/canvasChangeIntent';
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
import {
  validateCandidateBindingRoleCandidate,
  validatePropagatingEdgeCandidate,
} from '@/features/freezone/context/mainlineContext';
import { isPresetManagedEdge } from '@/features/canvas/domain/mainlineNodeFlags';
import { scopeProjectionGraphIds } from '@/features/freezone/projectionGraphIds';

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
    options?: { id?: string; sourceHandle?: string; targetHandle?: string },
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
    options?: {
      defaultTitle?: string;
      resultKind?: ExportImageNodeResultKind;
      aspectRatioStrategy?: 'provided' | 'derivedFromSource';
      sizeStrategy?: 'generated' | 'autoMinEdge' | 'matchSource';
      matchSourceNodeSize?: boolean;
    }
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
    config: { aspectKey?: string; cols?: number; showIndex?: boolean }
  ) => void;
  /** Move a storyboard member from one grid slot to another (drag-reorder). */
  reorderStoryboardMember: (groupNodeId: string, fromIndex: number, toIndex: number) => void;
  /** Add image members (from upload / history) to a storyboard group's grid. */
  addStoryboardMembers: (
    groupNodeId: string,
    images: { imageUrl: string; previewImageUrl?: string; displayName?: string }[]
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
    mode: 'horizontal' | 'vertical' | 'grid',
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

function normalizeCanvasData(
  rawNodes: CanvasNode[],
  rawEdges: CanvasEdge[],
): CanvasHistorySnapshot {
  const scoped = scopeProjectionGraphIds(rawNodes, rawEdges);
  const normalizedNodes = normalizeCanvasNodes(scoped.nodes);
  return {
    nodes: normalizedNodes,
    edges: normalizeEdgesWithNodes(scoped.edges, normalizedNodes),
  };
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
      const intent = classifyCanvasNodeChanges(changes);

      let nextNodes = applyNodeChanges<CanvasNode>(changes, state.nodes);
      if (intent.resizedNodeIds.size > 0) {
        nextNodes = nextNodes.map((node) => {
          if (!intent.resizedNodeIds.has(node.id) || !isImageAutoResizableType(node.type)) {
            return node;
          }
          return withManualSizeLock(node);
        });
      }
      const historyResult = recordCanvasInteractionHistory(
        {
          history: state.history,
          dragHistorySnapshot: state.dragHistorySnapshot,
        },
        createSnapshot(state.nodes, state.edges),
        intent,
      );

      const editSource: CanvasMutationSource = isDeleteToEmpty(
        state.nodes.length,
        nextNodes.length,
      )
        ? "delete_to_empty"
        : "user_edit";

      return {
        nodes: nextNodes,
        selectedNodeId: resolveSelectedNodeId(state.selectedNodeId, nextNodes),
        activeToolDialog: resolveActiveToolDialog(state.activeToolDialog, nextNodes),
        history: historyResult.history,
        dragHistorySnapshot: historyResult.dragHistorySnapshot,
        ...(historyResult.editPushed ? trackEdit(state, editSource) : {}),
      };
    });
  },

  onEdgesChange: (changes) => {
    set((state) => {
      const nextEdges = applyEdgeChanges<CanvasEdge>(changes, state.edges);
      const hasMeaningfulChange = hasMeaningfulCanvasEdgeChange(changes);

      if (!hasMeaningfulChange) {
        return { edges: nextEdges };
      }

      return {
        edges: nextEdges,
        history: {
          past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
          future: [],
        },
        dragHistorySnapshot: null,
        ...trackEdit(state),
      };
    });
  },

  onConnect: (connection) => {
    const sourceHandle = normalizeHandleId(connection.sourceHandle) ?? 'source';
    const targetHandle = normalizeHandleId(connection.targetHandle) ?? 'target';
    set((state) => {
      const validation = validateCanvasConnection(
        state.nodes,
        state.edges,
        connection,
        'react_flow',
      );
      if (!validation.ok) {
        return {};
      }
      return {
        edges: addEdge<CanvasEdge>(
          { ...connection, sourceHandle, targetHandle, type: 'disconnectableEdge' },
          state.edges
        ),
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
    const createdNode = maybeApplyImageAutoResize(
      canvasNodeFactory.createNode(type, position, data),
      data,
    );
    const newNode =
      createdNode.type === CANVAS_NODE_TYPES.skill && !createdNode.measured
        ? ({ ...createdNode, measured: SKILL_NODE_DEFAULT_MEASURED } as CanvasNode)
        : createdNode.type === CANVAS_NODE_TYPES.beatContext && !createdNode.measured
          ? ({ ...createdNode, measured: BEAT_CONTEXT_NODE_DEFAULT_MEASURED } as CanvasNode)
          : createdNode;
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
    const validation = validateCanvasConnection(
      state.nodes,
      state.edges,
      { source, target },
      'programmatic',
    );
    if (!validation.ok) {
      return null;
    }

    const edgeId = `e-${source}-${target}`;
    // Check if edge already exists
    if (state.edges.some((e) => e.id === edgeId)) {
      return edgeId;
    }

    const newEdge: CanvasEdge = {
      id: edgeId,
      source,
      target,
      sourceHandle: 'source',
      targetHandle: 'target',
      type: 'disconnectableEdge',
    };

    set({
      edges: [...state.edges, newEdge],
      ...trackEdit(state),
    });

    return edgeId;
  },

  addEdgeWithData: (source, target, data, options) => {
    const state = get();
    const connectionValidation = validateCanvasConnection(
      state.nodes,
      state.edges,
      { source, target },
      'programmatic',
    );
    if (!connectionValidation.ok) {
      return null;
    }

    const edgeId = options?.id || `e-${source}-${target}-${String(data.edgeKind || 'data')}`;
    const existing = state.edges.find((edge) => edge.id === edgeId);
    if (existing) {
      return edgeId;
    }

    const newEdge: CanvasEdge = {
      id: edgeId,
      source,
      target,
      sourceHandle: normalizeHandleId(options?.sourceHandle) ?? 'source',
      targetHandle: normalizeHandleId(options?.targetHandle) ?? 'target',
      type: 'disconnectableEdge',
      data,
    };
    const validation = validatePropagatingEdgeCandidate(state.nodes, state.edges, newEdge);
    if (!validation.ok) {
      console.warn('[freezone] rejected propagating edge', validation.reason, newEdge);
      return null;
    }
    const roleValidation = validateCandidateBindingRoleCandidate(state.edges, newEdge);
    if (!roleValidation.ok) {
      console.warn('[freezone] rejected role binding edge', roleValidation.reason, newEdge);
      return null;
    }

    set({
      edges: [...state.edges, newEdge],
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return edgeId;
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
    const position = getDerivedNodePosition(state.nodes, sourceNodeId);
    const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
    const resolvedAspectRatio = resolveDerivedAspectRatio(sourceNode, aspectRatio);
    const node = canvasNodeFactory.createNode(CANVAS_NODE_TYPES.upload, position, {
      imageUrl,
      previewImageUrl: previewImageUrl ?? null,
      aspectRatio: resolvedAspectRatio,
    });
    const derivedSize = resolveGeneratedImageNodeDimensions(resolvedAspectRatio);
    node.width = derivedSize.width;
    node.height = derivedSize.height;
    node.style = {
      ...(node.style ?? {}),
      width: derivedSize.width,
      height: derivedSize.height,
    };

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
    const sourceNode = state.nodes.find((node) => node.id === sourceNodeId);
    const aspectRatioStrategy = options?.aspectRatioStrategy ?? 'provided';
    const resolvedAspectRatio = aspectRatioStrategy === 'derivedFromSource'
      ? resolveDerivedAspectRatio(sourceNode, aspectRatio)
      : (aspectRatio || resolveDerivedAspectRatio(sourceNode, DEFAULT_ASPECT_RATIO));
    const autoSize = resolveAutoImageNodeDimensions(resolvedAspectRatio, {
      minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
      minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
    });
    const generatedSize = resolveGeneratedImageNodeDimensions(resolvedAspectRatio, {
      minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
      minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
    });
    const sourceSize = sourceNode ? getNodeSize(sourceNode) : null;
    const sizeStrategy = options?.sizeStrategy
      ?? (options?.matchSourceNodeSize ? 'matchSource' : 'generated');
    let derivedSize = generatedSize;
    if (sizeStrategy === 'autoMinEdge') {
      derivedSize = autoSize;
    } else if (sizeStrategy === 'matchSource' && sourceSize) {
      derivedSize = {
        width: Math.max(1, Math.round(sourceSize.width)),
        height: Math.max(1, Math.round(sourceSize.height)),
      };
    }
    const position = state.findNodePosition(
      sourceNodeId,
      derivedSize.width,
      derivedSize.height
    );
    const exportNodeData: Partial<CanvasNodeData> = {
      imageUrl,
      previewImageUrl: previewImageUrl ?? null,
      aspectRatio: resolvedAspectRatio,
    };
    if (options?.defaultTitle) {
      (exportNodeData as { displayName?: string }).displayName = options.defaultTitle;
    }
    if (options?.resultKind) {
      (exportNodeData as { resultKind?: ExportImageNodeResultKind }).resultKind = options.resultKind;
      if (!options.defaultTitle) {
        (exportNodeData as { displayName?: string }).displayName =
          EXPORT_RESULT_DISPLAY_NAME[options.resultKind];
      }
    }
    const node = canvasNodeFactory.createNode(CANVAS_NODE_TYPES.exportImage, position, {
      ...exportNodeData,
    });
    node.width = derivedSize.width;
    node.height = derivedSize.height;
    node.style = {
      ...(node.style ?? {}),
      width: derivedSize.width,
      height: derivedSize.height,
    };

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
    const position = getDerivedNodePosition(state.nodes, sourceNodeId);
    const resolvedFrameAspectRatio =
      frameAspectRatio ??
      frames.find((frame) => typeof frame.aspectRatio === 'string')?.aspectRatio ??
      DEFAULT_ASPECT_RATIO;

    const node = canvasNodeFactory.createNode(CANVAS_NODE_TYPES.storyboardSplit, position, {
      gridRows: rows,
      gridCols: cols,
      frames,
      aspectRatio: resolvedFrameAspectRatio,
      frameAspectRatio: resolvedFrameAspectRatio,
      exportOptions: createDefaultStoryboardExportOptions(),
    });
    const derivedSize = resolveStoryboardSplitNodeDimensions(rows, cols, resolvedFrameAspectRatio);
    node.width = derivedSize.width;
    node.height = derivedSize.height;
    node.style = {
      ...(node.style ?? {}),
      width: derivedSize.width,
      height: derivedSize.height,
    };

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
    const nodeMap = new Map(state.nodes.map((node) => [node.id, node] as const));
    const source = nodeMap.get(sourceNodeId);
    if (!source) return null;
    // 只收编「自由」的新节点；已有归属的不抢。
    const spawned = spawnedNodeIds
      .map((nodeId) => nodeMap.get(nodeId))
      .filter((node): node is CanvasNode => Boolean(node && !node.parentId));
    if (spawned.length === 0) return null;

    // 源节点最近的祖先组。
    let enclosing: CanvasNode | null = null;
    let parentId = source.parentId;
    const visited = new Set<string>();
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = nodeMap.get(parentId);
      if (!parent) break;
      if (isGroupNode(parent)) {
        enclosing = parent;
        break;
      }
      parentId = parent.parentId;
    }

    if (!enclosing) {
      // 自动组比手动 Ctrl+G 的边界更宽松些，给成员四周多留 20px 呼吸感。
      return get().groupNodes([sourceNodeId, ...spawned.map((node) => node.id)], {
        label: opts?.label,
        extraPadding: 20,
      });
    }
    // 在谓词检查前先取 id（isStoryboardGroupNode 等共享 isGroupNode 的类型谓词，
    // 检查后 enclosing 会被 TS 收窄成 never，同 fitGroupToChildren 的注释）。
    const groupId = enclosing.id;
    // 分镜组按宫格自排版、投影组受保护——都不往里塞成员。
    if (isStoryboardGroupNode(enclosing) || isProtectedProjectionGroupNode(enclosing)) {
      return null;
    }

    // 派生位置全部基于源节点的「原始 position」计算（findNodePosition 与各节点的
    // 手写布局都不解析 parentId）。源在组内时该基准本就是组内相对坐标，因此新节点
    // 的 position 可直接当作组内相对坐标使用，无需绝对↔相对换算。
    const spawnedSet = new Set(spawned.map((node) => node.id));
    const nextNodes = state.nodes.map((node) =>
      // 不设 extent:'parent'：普通组成员可自由拖动，拖动时实时撑大组框（同 groupNodes）。
      spawnedSet.has(node.id)
        ? { ...node, parentId: groupId, extent: undefined }
        : node,
    );

    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
    // 新成员通常落在组边界外（spawn 习惯放在源节点左/右侧），撑大组以容纳。
    get().fitGroupToChildren(groupId);
    return groupId;
  },

  mergeStoryboardGroup: (nodeIds) => {
    const state = get();
    const resolvedMembers = resolveCanvasGroupMembers(state.nodes, nodeIds);
    if (!resolvedMembers) {
      return null;
    }
    const { nodeMap, memberIds, members } = resolvedMembers;

    // Reading order by current absolute position (top→bottom, then left→right) so
    // the grid sequence matches how the user laid the shots out.
    const ordered = [...members].sort((a, b) => {
      const pa = resolveAbsolutePosition(a, nodeMap);
      const pb = resolveAbsolutePosition(b, nodeMap);
      return pa.y - pb.y || pa.x - pb.x;
    });

    // Members keep their natural sizes but are HIDDEN — the group renders them as
    // compact thumbnails (libtv style). Their hidden positions form a full-size
    // grid so they spread out cleanly on ungroup / convert.
    const baseWidth = Math.max(...ordered.map((node) => getNodeSize(node).width));
    const baseHeight = Math.max(...ordered.map((node) => getNodeSize(node).height));
    const aspectKey = DEFAULT_STORYBOARD_ASPECT;
    const cols = resolveStoryboardCols(ordered.length);
    // Hidden-member layout: full-size cells (for a clean ungroup spread).
    const { cellWidth: fullCellWidth, cellHeight: fullCellHeight } = computeStoryboardCell(
      baseWidth,
      baseHeight,
      aspectKey
    );
    const memberLayout = computeStoryboardGridLayout({
      count: ordered.length,
      cols,
      cellWidth: fullCellWidth,
      cellHeight: fullCellHeight,
    });
    // Rendered board: compact thumbnail grid — this drives the group box size.
    const board = computeStoryboardBoardLayout({ count: ordered.length, cols, aspectKey });

    // Anchor at the selection's top-left so the board lands roughly in place.
    const anchor = ordered.reduce(
      (acc, node) => {
        const absolute = resolveAbsolutePosition(node, nodeMap);
        return { x: Math.min(acc.x, absolute.x), y: Math.min(acc.y, absolute.y) };
      },
      { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }
    );
    const groupX = Math.round(Number.isFinite(anchor.x) ? anchor.x : 0);
    const groupY = Math.round(Number.isFinite(anchor.y) ? anchor.y : 0);

    const existingStoryboardCount = state.nodes.filter((node) =>
      isStoryboardGroupNode(node)
    ).length;
    const groupDisplayName = `分镜组 ${existingStoryboardCount + 1}`;
    const groupNode = canvasNodeFactory.createNode(
      CANVAS_NODE_TYPES.group,
      { x: groupX, y: groupY },
      {
        label: groupDisplayName,
        displayName: groupDisplayName,
        storyboardGroup: true,
        storyboardAspect: aspectKey,
        storyboardCols: board.cols,
        storyboardShowIndex: false,
        storyboardBaseWidth: baseWidth,
        storyboardBaseHeight: baseHeight,
      }
    );
    groupNode.style = { width: board.groupWidth, height: board.groupHeight };
    // Only the header drags the whole board; thumbnails handle their own reorder.
    groupNode.dragHandle = '.storyboard-group-drag-handle';
    groupNode.selected = true;

    const memberSet = new Set(memberIds);
    const updatedMemberMap = new Map<string, CanvasNode>();
    ordered.forEach((node, index) => {
      const cell = memberLayout.cells[index];
      updatedMemberMap.set(node.id, {
        ...node,
        parentId: groupNode.id,
        // No `extent` so the (large) hidden members aren't clamped to the compact
        // board box; `hidden` keeps them out of the canvas while grouped.
        hidden: true,
        position: { x: cell.x, y: cell.y },
        selected: false,
      });
    });

    const firstMemberIndex = state.nodes.reduce((acc, node, index) => {
      if (!memberSet.has(node.id)) {
        return acc;
      }
      return acc === -1 ? index : Math.min(acc, index);
    }, -1);

    const nextNodes: CanvasNode[] = [];
    let insertedGroup = false;
    for (let index = 0; index < state.nodes.length; index += 1) {
      const node = state.nodes[index];
      if (!insertedGroup && index === firstMemberIndex) {
        nextNodes.push(groupNode);
        insertedGroup = true;
      }
      const updatedMember = updatedMemberMap.get(node.id);
      if (updatedMember) {
        nextNodes.push(updatedMember);
      } else {
        nextNodes.push(node.selected ? { ...node, selected: false } : node);
      }
    }
    if (!insertedGroup) {
      nextNodes.push(groupNode);
    }

    // Edge handling once members become hidden thumbnails:
    // - member ↔ member  → internal, hide it (both endpoints invisible).
    // - member ↔ external → re-anchor the member endpoint onto the GROUP so the
    //   connection stays visible (pointing at the board); remember the original
    //   member id so ungroup / convert can restore it.
    const nextEdges = state.edges.map((edge) => {
      const sourceMember = memberSet.has(edge.source);
      const targetMember = memberSet.has(edge.target);
      if (sourceMember && targetMember) {
        return { ...edge, hidden: true };
      }
      if (sourceMember) {
        return {
          ...edge,
          source: groupNode.id,
          data: { ...(edge.data ?? {}), __sbOrigSource: edge.source },
        };
      }
      if (targetMember) {
        return {
          ...edge,
          target: groupNode.id,
          data: { ...(edge.data ?? {}), __sbOrigTarget: edge.target },
        };
      }
      return edge;
    });

    set({
      nodes: nextNodes,
      edges: nextEdges,
      selectedNodeId: groupNode.id,
      activeToolDialog:
        state.activeToolDialog && memberSet.has(state.activeToolDialog.nodeId)
          ? null
          : state.activeToolDialog,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });

    return groupNode.id;
  },

  setStoryboardGroupConfig: (groupNodeId, config) => {
    const state = get();
    const groupNode = state.nodes.find((node) => node.id === groupNodeId);
    if (!isStoryboardGroupNode(groupNode)) {
      return;
    }

    const nextAspect = config.aspectKey ?? groupNode.data.storyboardAspect ?? DEFAULT_STORYBOARD_ASPECT;
    const nextShowIndex =
      typeof config.showIndex === 'boolean'
        ? config.showIndex
        : groupNode.data.storyboardShowIndex === true;

    const childCount = state.nodes.reduce(
      (acc, node) => (node.parentId === groupNodeId ? acc + 1 : acc),
      0
    );
    const requestedCols = config.cols ?? groupNode.data.storyboardCols;
    const cols = resolveStoryboardCols(childCount, requestedCols);

    // Members are hidden thumbnails — only the compact board box / config change.
    const board = computeStoryboardBoardLayout({ count: childCount, cols, aspectKey: nextAspect });

    const nextNodes = state.nodes.map((node) => {
      if (node.id !== groupNodeId) {
        return node;
      }
      return {
        ...node,
        // width/height 与 style 同步更新：React Flow 渲染时显式 width 优先于
        // style.width（getNodeInlineStyleDimensions），只改 style 视觉上不生效。
        width: board.groupWidth,
        height: board.groupHeight,
        style: { ...(node.style ?? {}), width: board.groupWidth, height: board.groupHeight },
        data: {
          ...(node.data as GroupNodeData),
          storyboardAspect: nextAspect,
          storyboardCols: board.cols,
          storyboardShowIndex: nextShowIndex,
        },
      };
    });

    set({
      nodes: nextNodes,
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
    const group = state.nodes.find((node) => node.id === groupNodeId);
    if (!isStoryboardGroupNode(group)) {
      return;
    }
    // Reading order = members sorted by their (hidden) full-grid position.
    const members = state.nodes
      .filter((node) => node.parentId === groupNodeId)
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    if (
      fromIndex < 0 ||
      fromIndex >= members.length ||
      toIndex < 0 ||
      toIndex >= members.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const reordered = [...members];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Reassign the full-grid positions in the new order so the sort (and thus the
    // rendered board) reflects it, and ungroup still spreads them cleanly.
    const baseWidth =
      group.data.storyboardBaseWidth ??
      Math.max(...members.map((node) => getNodeSize(node).width));
    const baseHeight =
      group.data.storyboardBaseHeight ??
      Math.max(...members.map((node) => getNodeSize(node).height));
    const cols = resolveStoryboardCols(reordered.length, group.data.storyboardCols);
    const { cellWidth, cellHeight } = computeStoryboardCell(
      baseWidth,
      baseHeight,
      group.data.storyboardAspect ?? DEFAULT_STORYBOARD_ASPECT
    );
    const layout = computeStoryboardGridLayout({
      count: reordered.length,
      cols,
      cellWidth,
      cellHeight,
    });
    const posById = new Map<string, { x: number; y: number }>();
    reordered.forEach((node, index) => {
      const cell = layout.cells[index];
      if (cell) {
        posById.set(node.id, { x: cell.x, y: cell.y });
      }
    });

    const nextNodes = state.nodes.map((node) => {
      const position = posById.get(node.id);
      return position ? { ...node, position } : node;
    });

    set({
      nodes: nextNodes,
      history: {
        past: pushSnapshot(state.history.past, createSnapshot(state.nodes, state.edges)),
        future: [],
      },
      dragHistorySnapshot: null,
      ...trackEdit(state),
    });
  },

  addStoryboardMembers: (groupNodeId, images) => {
    const valid = images.filter((image) => image.imageUrl.trim().length > 0);
    if (valid.length === 0) {
      return;
    }
    const state = get();
    const group = state.nodes.find((node) => node.id === groupNodeId);
    if (!isStoryboardGroupNode(group)) {
      return;
    }

    const existing = state.nodes
      .filter((node) => node.parentId === groupNodeId)
      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);

    const baseWidth =
      group.data.storyboardBaseWidth ??
      (existing.length > 0
        ? Math.max(...existing.map((node) => getNodeSize(node).width))
        : DEFAULT_NODE_WIDTH);
    const baseHeight =
      group.data.storyboardBaseHeight ??
      (existing.length > 0 ? Math.max(...existing.map((node) => getNodeSize(node).height)) : 200);
    const aspectKey = group.data.storyboardAspect ?? DEFAULT_STORYBOARD_ASPECT;

    // New image members are plain result-image nodes (hidden thumbnails like the
    // rest), sized to the group's content floor.
    const newNodes: CanvasNode[] = valid.map((image) => {
      const node = canvasNodeFactory.createNode(
        CANVAS_NODE_TYPES.exportImage,
        { x: 0, y: 0 },
        {
          imageUrl: image.imageUrl,
          previewImageUrl: image.previewImageUrl ?? image.imageUrl,
          displayName: image.displayName ?? '分镜',
        }
      );
      node.parentId = groupNodeId;
      node.hidden = true;
      node.selected = false;
      node.width = Math.round(baseWidth);
      node.height = Math.round(baseHeight);
      node.style = { width: Math.round(baseWidth), height: Math.round(baseHeight) };
      return node;
    });

    const allMembers = [...existing, ...newNodes];
    const cols = resolveStoryboardCols(allMembers.length, group.data.storyboardCols);
    const { cellWidth, cellHeight } = computeStoryboardCell(baseWidth, baseHeight, aspectKey);
    const memberLayout = computeStoryboardGridLayout({
      count: allMembers.length,
      cols,
      cellWidth,
      cellHeight,
    });
    const board = computeStoryboardBoardLayout({ count: allMembers.length, cols, aspectKey });

    const posById = new Map<string, { x: number; y: number }>();
    allMembers.forEach((node, index) => {
      const cell = memberLayout.cells[index];
      if (cell) {
        posById.set(node.id, { x: cell.x, y: cell.y });
      }
    });

    const updatedExisting = state.nodes.map((node) => {
      if (node.id === groupNodeId) {
        return {
          ...node,
          // 同步显式 width/height（React Flow 渲染优先级高于 style，见 arrange 注释）。
          width: board.groupWidth,
          height: board.groupHeight,
          style: { ...(node.style ?? {}), width: board.groupWidth, height: board.groupHeight },
          data: { ...(node.data as GroupNodeData), storyboardCols: board.cols },
        };
      }
      const position = posById.get(node.id);
      return position ? { ...node, position } : node;
    });
    const positionedNew = newNodes.map((node) => ({
      ...node,
      position: posById.get(node.id) ?? node.position,
    }));

    set({
      // New children appended after the group (which already precedes its members).
      nodes: [...updatedExisting, ...positionedNew],
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
    const groupNode = state.nodes.find((node) => node.id === groupNodeId);
    if (!isStoryboardGroupNode(groupNode)) {
      return;
    }

    // Reveal the members (they were hidden thumbnails) and size the group to wrap
    // them at full size, so it becomes an ordinary group showing real nodes.
    const children = state.nodes.filter((node) => node.parentId === groupNodeId);
    const SIDE_PAD = 20;
    let maxX = 0;
    let maxY = 0;
    for (const child of children) {
      const size = getNodeSize(child);
      maxX = Math.max(maxX, child.position.x + size.width);
      maxY = Math.max(maxY, child.position.y + size.height);
    }
    const groupWidth = Math.max(220, Math.round(maxX + SIDE_PAD));
    const groupHeight = Math.max(140, Math.round(maxY + SIDE_PAD));

    const nextNodes = state.nodes.map((node) => {
      if (node.id === groupNodeId) {
        const {
          storyboardGroup: _storyboardGroup,
          storyboardAspect: _storyboardAspect,
          storyboardCols: _storyboardCols,
          storyboardShowIndex: _storyboardShowIndex,
          storyboardBaseWidth: _storyboardBaseWidth,
          storyboardBaseHeight: _storyboardBaseHeight,
          ...restData
        } = node.data as GroupNodeData;
        return {
          ...node,
          // Plain group again → draggable anywhere, no header-only handle.
          dragHandle: undefined,
          // 同步显式 width/height（React Flow 渲染优先级高于 style）。
          width: groupWidth,
          height: groupHeight,
          style: { ...(node.style ?? {}), width: groupWidth, height: groupHeight },
          data: restData as GroupNodeData,
        };
      }
      if (node.parentId === groupNodeId && node.hidden) {
        return { ...node, hidden: false };
      }
      return node;
    });

    // Members are visible again → re-anchor their re-pointed edges back and reveal
    // the hidden internal ones.
    const childIds = new Set(children.map((child) => child.id));
    const nextEdges = restoreStoryboardEdges(state.edges, groupNodeId, childIds);

    set({
      nodes: nextNodes,
      edges: nextEdges,
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
    const group = state.nodes.find((node) => node.id === groupNodeId);
    // Storyboard groups size themselves from the compact thumbnail board and
    // their members are hidden — never auto-fit them to (hidden) child bounds.
    if (!isGroupNode(group)) {
      return;
    }
    // Capture style while `group` is still narrowed to a group node. The
    // storyboard / projection predicates below share isGroupNode's type
    // predicate, so chaining them would collapse `group` to `never` for the
    // rest of the function (TS subtracts the identical predicate type).
    const groupStyle = group.style;
    if (isProtectedProjectionGroupNode(group) || isStoryboardGroupNode(group)) {
      return;
    }
    const children = state.nodes.filter((node) => node.parentId === groupNodeId);
    if (children.length === 0) {
      return;
    }

    // Match the paddings groupNodes / mergeStoryboardGroup create with, so a
    // correctly-sized group is a no-op. TOP_PAD leaves room for the floating
    // header (`-top-7`).
    const SIDE_PAD = 20;
    const TOP_PAD = 34;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const child of children) {
      const size = getNodeSize(child);
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxX = Math.max(maxX, child.position.x + size.width);
      maxY = Math.max(maxY, child.position.y + size.height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return;
    }

    // Push members inward only when they spill past the top/left edge.
    const shiftX = Math.max(0, Math.round(SIDE_PAD - minX));
    const shiftY = Math.max(0, Math.round(TOP_PAD - minY));
    const curWidth = typeof groupStyle?.width === 'number' ? groupStyle.width : 0;
    const curHeight = typeof groupStyle?.height === 'number' ? groupStyle.height : 0;
    const neededWidth = Math.round(maxX + shiftX + SIDE_PAD);
    const neededHeight = Math.round(maxY + shiftY + SIDE_PAD);
    // Grow-only so a manual enlarge is never clawed back.
    const nextWidth = Math.max(curWidth, neededWidth);
    const nextHeight = Math.max(curHeight, neededHeight);

    if (shiftX === 0 && shiftY === 0 && nextWidth === curWidth && nextHeight === curHeight) {
      return;
    }

    const childSet = new Set(children.map((child) => child.id));
    const nextNodes = state.nodes.map((node) => {
      if (node.id === groupNodeId) {
        return {
          ...node,
          position: { x: node.position.x - shiftX, y: node.position.y - shiftY },
          // width/height 必须与 style 同步：React Flow 渲染时显式 width 优先于
          // style.width（getNodeInlineStyleDimensions），只改 style 视觉上不生效。
          width: nextWidth,
          height: nextHeight,
          style: { ...(node.style ?? {}), width: nextWidth, height: nextHeight },
        };
      }
      if ((shiftX !== 0 || shiftY !== 0) && childSet.has(node.id)) {
        return {
          ...node,
          position: { x: node.position.x + shiftX, y: node.position.y + shiftY },
        };
      }
      return node;
    });

    // Pure layout correction — no history push / trackEdit so it doesn't spam
    // undo or autosave; it re-derives on next mount anyway.
    set({ nodes: nextNodes });
  },

  arrangeGroupChildren: (groupNodeId, mode) => {
    const state = get();
    const group = state.nodes.find((node) => node.id === groupNodeId);
    if (
      !isGroupNode(group) ||
      isProtectedProjectionGroupNode(group) ||
      isStoryboardGroupNode(group)
    ) {
      return;
    }
    const children = state.nodes.filter((node) => node.parentId === groupNodeId);
    if (children.length < 2) return;

    // 与 groupNodes / fitGroupToChildren 一致的内边距（TOP_PAD 给浮动标题留位）。
    const SIDE_PAD = 20;
    const TOP_PAD = 34;
    const GAP = 32;
    // 按当前位置（行优先）确定排列顺序，保持用户的相对先后直觉。
    const ordered = children
      .map((node) => ({ node, size: getNodeSize(node) }))
      .sort(
        (a, b) =>
          a.node.position.y - b.node.position.y ||
          a.node.position.x - b.node.position.x,
      );

    const targets = new Map<string, { x: number; y: number }>();
    if (mode === 'horizontal') {
      let cursorX = SIDE_PAD;
      for (const item of ordered) {
        targets.set(item.node.id, { x: cursorX, y: TOP_PAD });
        cursorX += item.size.width + GAP;
      }
    } else if (mode === 'vertical') {
      let cursorY = TOP_PAD;
      for (const item of ordered) {
        targets.set(item.node.id, { x: SIDE_PAD, y: cursorY });
        cursorY += item.size.height + GAP;
      }
    } else {
      const cols = Math.ceil(Math.sqrt(ordered.length));
      const cellW = Math.max(...ordered.map((item) => item.size.width)) + GAP;
      const cellH = Math.max(...ordered.map((item) => item.size.height)) + GAP;
      ordered.forEach((item, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        targets.set(item.node.id, {
          x: SIDE_PAD + col * cellW,
          y: TOP_PAD + row * cellH,
        });
      });
    }

    // 收紧组框到刚好包住排列后的子节点。
    let maxX = 0;
    let maxY = 0;
    for (const item of ordered) {
      const pos = targets.get(item.node.id);
      if (!pos) continue;
      maxX = Math.max(maxX, pos.x + item.size.width);
      maxY = Math.max(maxY, pos.y + item.size.height);
    }
    const nextWidth = Math.round(maxX + SIDE_PAD);
    const nextHeight = Math.round(maxY + SIDE_PAD);

    const nextNodes = state.nodes.map((node) => {
      if (node.id === groupNodeId) {
        return {
          ...node,
          // 同步显式 width/height（React Flow 渲染优先级高于 style，见 fit 注释）。
          width: nextWidth,
          height: nextHeight,
          style: { ...(node.style ?? {}), width: nextWidth, height: nextHeight },
        };
      }
      const pos = targets.get(node.id);
      if (pos) {
        return { ...node, position: pos };
      }
      return node;
    });

    set({
      nodes: nextNodes,
      // 用户从工具栏主动触发的重排会永久移动子节点（不像 fitGroupToChildren 那样可
      // 重新推导），必须入 undo 历史，否则排乱后 ⌘Z 无法还原。
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
    const groupNode = state.nodes.find(
      (node) => node.id === groupNodeId && node.type === CANVAS_NODE_TYPES.group
    );
    if (!groupNode) {
      return false;
    }
    if (isProtectedProjectionGroupNode(groupNode)) {
      return false;
    }

    const nodeMap = new Map(state.nodes.map((node) => [node.id, node] as const));
    const children = state.nodes.filter((node) => node.parentId === groupNodeId);
    if (children.length === 0) {
      return false;
    }

    const nextNodes = state.nodes
      .filter((node) => node.id !== groupNodeId)
      .map((node) => {
        if (node.parentId !== groupNodeId) {
          return node;
        }

        const absolute = resolveAbsolutePosition(node, nodeMap);
        return {
          ...node,
          parentId: undefined,
          extent: undefined,
          // Reveal members that were hidden thumbnails inside a storyboard group.
          hidden: false,
          position: {
            x: Math.round(absolute.x),
            y: Math.round(absolute.y),
          },
          selected: false,
        };
      });

    const childIds = new Set(children.map((child) => child.id));
    // Restore storyboard edge rewiring (re-anchor onto members, unhide internal)
    // BEFORE dropping edges still attached to the group, so re-anchored ones survive.
    const nextEdges = restoreStoryboardEdges(state.edges, groupNodeId, childIds).filter(
      (edge) => edge.source !== groupNodeId && edge.target !== groupNodeId
    );

    set({
      nodes: nextNodes,
      edges: nextEdges,
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
      const edge = state.edges.find((candidate) => candidate.id === edgeId);
      if (!edge || isPresetManagedEdge(edge)) {
        return {};
      }

      return {
        edges: state.edges.filter((edge) => edge.id !== edgeId),
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
    const transition = undoHistory(
      state.history,
      createSnapshot(state.nodes, state.edges),
    );
    if (!transition) {
      return false;
    }
    const { target } = transition;

    const undoSource: CanvasMutationSource = isDeleteToEmpty(
      state.nodes.length,
      target.nodes.length,
    )
      ? "delete_to_empty"
      : "user_edit";

    set({
      nodes: target.nodes,
      edges: target.edges,
      selectedNodeId: resolveSelectedNodeId(state.selectedNodeId, target.nodes),
      activeToolDialog: resolveActiveToolDialog(state.activeToolDialog, target.nodes),
      history: transition.history,
      dragHistorySnapshot: null,
      ...trackEdit(state, undoSource),
    });
    return true;
  },

  redo: () => {
    const state = get();
    const transition = redoHistory(
      state.history,
      createSnapshot(state.nodes, state.edges),
    );
    if (!transition) {
      return false;
    }
    const { target } = transition;

    const redoSource: CanvasMutationSource = isDeleteToEmpty(
      state.nodes.length,
      target.nodes.length,
    )
      ? "delete_to_empty"
      : "user_edit";

    set({
      nodes: target.nodes,
      edges: target.edges,
      selectedNodeId: resolveSelectedNodeId(state.selectedNodeId, target.nodes),
      activeToolDialog: resolveActiveToolDialog(state.activeToolDialog, target.nodes),
      history: transition.history,
      dragHistorySnapshot: null,
      ...trackEdit(state, redoSource),
    });
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
