// Copyright (c) 2026 AI anime
import {
  useState,
  useCallback,
  useMemo,
  useRef,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  ReactFlow,
  Background,
  MiniMap,
  BackgroundVariant,
  ConnectionMode,
  SelectionMode,
  useReactFlow,
  useStoreApi,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MousePointerClick, Upload } from 'lucide-react';
import '@xyflow/react/dist/style.css';

import { useShallow } from 'zustand/react/shallow';

import { CreditDisplayHiddenProvider } from '@/components/credits/credit-visual';
import { isCeRuntime } from '@/lib/runtime-config';
import { useCanvasStore } from '@/stores/canvasStore';
import {
  getNodeSize,
  hasRectCollision,
} from '@/features/canvas/domain/canvasGeometry';
import { findLinkedCapturePartnerIds } from '@/features/canvas/domain/canvasCapturePartners';
import { resolveCanvasSelectionDeletion } from '@/features/canvas/domain/canvasSelectionDeletion';
import { useAppStore } from '@/stores/app-store';
import { getSkillRegistry } from '@/api/skills';
import { SKILL_SCHEMA_VERSION, type SkillDefinition } from '@/features/freezone/context/skillRoles';
import { translateSkillName } from '@/features/freezone/context/skillI18n';
import { canvasEventBus } from '@/features/canvas/application/canvasServices';
import {
  migratePastedNodeAssets,
  pollExportImageGeneration,
  resumeNodeGeneration,
} from '@/features/canvas/composition';
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
  DEFAULT_NODE_WIDTH,
  isStoryboardGroupNode,
} from '@/features/canvas/domain/canvasNodes';
import {
  readAssetDragPayload,
  spawnAssetNode,
  type CanvasAssetDragPayload,
} from '@/features/canvas/domain/assetDrag';
import { hydrateAssetDragPayload } from '@/features/canvas/domain/assetDragHydrate';
import type { CanvasAsset } from '@/features/canvas/domain/canvasAssets';
import { CanvasMinimapBookmarksOverlay } from '@/features/canvas/ui/CanvasMinimapBookmarksOverlay';
import { captureCurrentViewport, jumpToBookmark } from '@/features/canvas/application/bookmarkActions';
import { isPresetManagedEdge } from '@/features/canvas/domain/mainlineNodeFlags';
import { cloneCanvasNodeData } from '@/features/canvas/application/canvasNodeData';
import { createCanvasClipboardSnapshot } from '@/features/canvas/application/createCanvasClipboardSnapshot';
import {
  filterPresetManagedEdgeChanges,
  filterPresetManagedNodeChanges,
} from '@/features/canvas/application/canvasManagedChangeGuard';
import type { CanvasClipboardSnapshot } from '@/features/canvas/domain/canvasClipboard';
import { nodeNeedsGenerationResume } from '@/features/canvas/application/resumeGeneration';
import { readUrl } from '@/lib/url-params';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchEpisodeBeats, prefetchEpisodeDetail } from '@/modules/narrative_planning/public';
import { nodeCatalog } from '@/features/canvas/application/nodeCatalog';
import { nodeTypes as canvasNodeTypes } from './nodes';
import { edgeTypes as canvasEdgeTypes } from './edges';
import { NodeSelectionMenu } from './NodeSelectionMenu';
import { SelectedNodeOverlay } from './ui/SelectedNodeOverlay';
import { MultiSelectionToolbar } from './ui/MultiSelectionToolbar';
import { MultiSelectionConnectButton } from './ui/MultiSelectionConnectButton';
import { NodeSpawnPlusOverlay } from './ui/NodeSpawnPlusOverlay';
import { CanvasContextMenu } from './ui/CanvasContextMenu';
import { NodeToolDialog } from './ui/NodeToolDialog';
import { ImageViewerModal } from './ui/ImageViewerModal';
import { VideoViewerModal } from './ui/VideoViewerModal';
import { CanvasZoomControl } from './ui/CanvasZoomControl';
import { useEdgeVisibilityStore } from './ui/edgeVisibilityStore';
import { CanvasQuickActionBar } from './ui/CanvasQuickActionBar';
import { BackToNodesHint } from './ui/BackToNodesHint';
import { CanvasMinimapButton } from './ui/CanvasMinimapButton';
import { CanvasFpsMeter } from './ui/CanvasFpsMeter';
import { CanvasSnapAlignButton } from './snap-align/CanvasSnapAlignButton';
import { useTrackpadPanStore } from './trackpad-pan/trackpadPanStore';
import { SnapAlignGuides } from './snap-align/SnapAlignGuides';
import { useSnapAlignStore } from './snap-align/snapAlignStore';
import { computeAutoLayout } from './application/autoLayout';
import { PAN_ACTIVATION_KEY_CODE } from './ui/canvasInteractionTargets';
import { collectDroppedMediaFiles } from './ui/canvasMediaTransfer';
import {
  createPreviewPath,
  type CanvasConnectionMenuRequest,
  type CanvasConnectionPreviewRequest,
  type CanvasPendingConnectionStart,
} from './ui/canvasConnectionInteraction';
import { useCanvasDropIndicator } from './hooks/useCanvasDropIndicator';
import { useCanvasEdgePan } from './hooks/useCanvasEdgePan';
import { useCanvasExternalDialogs } from './hooks/useCanvasExternalDialogs';
import { useCanvasAsyncNodeTasks } from './hooks/useCanvasAsyncNodeTasks';
import { useCanvasBeatContextPrefetch } from './hooks/useCanvasBeatContextPrefetch';
import {
  useCanvasBatchConnectionController,
  type CanvasBatchConnectionMenuRequest,
} from './hooks/useCanvasBatchConnectionController';
import { useCanvasConnectionController } from './hooks/useCanvasConnectionController';
import { useCanvasPlusConnectionController } from './hooks/useCanvasPlusConnectionController';
import { useCanvasReactFlowConnectionController } from './hooks/useCanvasReactFlowConnectionController';
import { useCanvasKeyboardShortcuts } from './hooks/useCanvasKeyboardShortcuts';
import { useCanvasLifecycle } from './hooks/useCanvasLifecycle';
import { useCanvasMarqueeSelection } from './hooks/useCanvasMarqueeSelection';
import { useCanvasMediaPaste } from './hooks/useCanvasMediaPaste';
import { useCanvasMinimapVisibility } from './hooks/useCanvasMinimapVisibility';
import { useCanvasNodeHover } from './hooks/useCanvasNodeHover';
import { useCanvasNodeClipboard } from './hooks/useCanvasNodeClipboard';
import { useCanvasNodeMenuShortcut } from './hooks/useCanvasNodeMenuShortcut';
import { useCanvasNodePlacementConfirm } from './hooks/useCanvasNodePlacementConfirm';
import { useCanvasPaneContextMenu } from './hooks/useCanvasPaneContextMenu';
import { useCanvasPendingNodeFocus } from './hooks/useCanvasPendingNodeFocus';
import { useCanvasSelectionSync } from './hooks/useCanvasSelectionSync';
import { useCanvasSkillRegistry } from './hooks/useCanvasSkillRegistry';
import {
  useCanvasSnapAlignment,
  type CanvasSnapAlignmentPort,
} from './hooks/useCanvasSnapAlignment';
import { useCanvasViewportBookmarkShortcuts } from './hooks/useCanvasViewportBookmarkShortcuts';
import { useCanvasViewportCommit } from './hooks/useCanvasViewportCommit';
import { useCanvasViewportMetrics } from './hooks/useCanvasViewportMetrics';

const DEFAULT_EDGE_OPTIONS = { type: 'disconnectableEdge' };
const REACT_FLOW_PRO_OPTIONS = { hideAttribution: true };
// 拖线吸附半径(px,以光标到目标 handle 的距离计)。节点的 target handle 在左边
// 缘的一个小点上,而节点本身宽 300~400px;半径太小(默认 20 / 旧值 50)时,把线
// 拖到节点中部就已超出 handle 的吸附范围,既不自动吸附也没有「会连上」的视觉反
// 馈,用户只能去瞄那个小点。调大到能覆盖到节点中部,拖到节点这一大片区域内即可
// 自动吸附连线(React Flow 原生会高亮合法 handle 并把连线吸过去);更远处落到节
// 点本体仍有 handleConnectEnd 里的 DOM 命中兜底。
const CONNECTION_SNAP_RADIUS = 160;
const MULTI_SELECTION_KEY_CODES = ['Control', 'Meta'];
// Pan the canvas only by holding the middle mouse button (scroll-wheel) and dragging
// (button 1). Left drag (0) runs the custom marquee box-select on the empty pane;
// right click (2) opens the canvas context menu.
const PAN_ON_DRAG_BUTTONS = [1];
const PREVIEW_CONNECTION_STROKE = 'rgb(var(--text-rgb) / 0.82)';

interface PreviewConnectionVisual {
  d: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'butt' | 'round' | 'square';
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DuplicateOptions {
  explicitOffset?: { x: number; y: number };
  disableOffsetIteration?: boolean;
  suppressSelect?: boolean;
  /**
   * Paste from a serialized clipboard snapshot instead of looking the source
   * nodes up by id in the live canvas — lets paste work after the originals are
   * deleted and across canvases.
   */
  sourceSnapshot?: CanvasClipboardSnapshot;
  /** Place the pasted group's top-left at this flow position (cursor paste). */
  targetFlowPosition?: { x: number; y: number };
  /** Select every pasted node (not just the first) — used by paste. */
  selectAll?: boolean;
}

interface DuplicateResult {
  firstNodeId: string | null;
  idMap: Map<string, string>;
}

const ALT_DRAG_COPY_Z_INDEX = 2000;
const NODE_PLACEMENT_PREVIEW_WIDTH = 320;
const NODE_PLACEMENT_PREVIEW_HEIGHT = 200;

const CANVAS_SNAP_ALIGNMENT_PORT: CanvasSnapAlignmentPort = {
  isEnabled: () => useSnapAlignStore.getState().enabled,
  setGuides: (guides) => useSnapAlignStore.getState().setGuides(guides),
  clearGuides: () => useSnapAlignStore.getState().clearGuides(),
};

interface PendingNodePlacement {
  type: CanvasNodeType;
  initialData?: Partial<Record<string, unknown>>;
  skill?: SkillDefinition;
}

interface CanvasProps {
  onBlankPaneClick?: () => void;
  controlsPlacement?: 'bottom-right' | 'top-right';
}

export function Canvas({
  onBlankPaneClick,
  controlsPlacement = 'bottom-right',
}: CanvasProps = {}) {
  const { t } = useTranslation();
  const reactFlowInstance = useReactFlow();
  const reactFlowStore = useStoreApi();
  const nodeTypes = useMemo(() => canvasNodeTypes, []);
  const edgeTypes = useMemo(() => canvasEdgeTypes, []);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const suppressNextPaneClickRef = useRef(false);

  const {
    pinned: minimapPinned,
    visible: minimapVisible,
    setHovered: setMinimapHover,
    togglePinned: toggleMinimapPinned,
  } = useCanvasMinimapVisibility();
  // hover 节点 id 放在 store 里：除了喂给 NodeSpawnPlusOverlay 的「+」，
  // NodeSideActionRail 的上传/替换按钮栏也要据此「hover 才显示」。
  const hoveredNodeId = useCanvasStore((state) => state.hoveredNodeId);
  const setHoveredNodeId = useCanvasStore((state) => state.setHoveredNodeId);
  const {
    clearHoveredNodeTimer,
    scheduleHoveredNodeClear,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
  } = useCanvasNodeHover(setHoveredNodeId);
  const {
    placementConfirmNodeId,
    triggerPlacementConfirm,
  } = useCanvasNodePlacementConfirm();

  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [flowPosition, setFlowPosition] = useState({ x: 0, y: 0 });
  const [pendingNodePlacement, setPendingNodePlacement] =
    useState<PendingNodePlacement | null>(null);
  const [nodePlacementClientPosition, setNodePlacementClientPosition] =
    useState<{ x: number; y: number } | null>(null);
  const [menuAllowedTypes, setMenuAllowedTypes] = useState<CanvasNodeType[] | undefined>(
    undefined
  );
  const [pendingConnectStart, setPendingConnectStart] =
    useState<CanvasPendingConnectionStart | null>(null);
  // When set, the next spawned node (from the batch "+") is fanned into by all
  // these source nodes instead of the single `pendingConnectStart`.
  const [pendingBatchConnectIds, setPendingBatchConnectIds] = useState<string[] | null>(null);
  const [previewConnectionVisual, setPreviewConnectionVisual] =
    useState<PreviewConnectionVisual | null>(null);
  const {
    skills: skillRegistry,
    skillById,
  } = useCanvasSkillRegistry(getSkillRegistry);

  const pasteIterationRef = useRef(0);
  const altDragCopyRef = useRef<{
    sourceNodeIds: string[];
    startPositions: Map<string, { x: number; y: number }>;
    copiedNodeIds: string[];
    sourceToCopyIdMap: Map<string, string>;
  } | null>(null);
  // 正在拖动的组内成员所属的组 id 集合（libtv 式：拖动期间不动框，松手后按成员最终
  // 落点逐组 fitGroupToChildren 重新包住）。多选拖动可能同时带上多个组的成员，所以
  // 记数组而非单个 id。null = 当前没有组内成员在拖。
  const groupFitDragRef = useRef<{ groupIds: string[] } | null>(null);
  // 「导演世界」源节点 ←→「导演世界输出」组联动拖动：拖动开始时记下另一方(partner)及
  // 其起始坐标,拖动期间按相同位移把 partner 一起移动。null = 当前拖动不涉及联动。
  const linkedDragRef = useRef<{
    partnerStarts: Map<string, { x: number; y: number }>;
    draggedStart: { x: number; y: number };
  } | null>(null);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  // 连线可见性：隐藏时只给 ReactFlow 的边打 `hidden`，真实 edges 一动不动（见
  // edgeVisibilityStore）。持久化/自动布局/导出全部照用 store 里的真实连线。
  const edgesHidden = useEdgeVisibilityStore((state) => state.hidden);

  const queryClient = useQueryClient();
  // 项目 ID 取自 URL,在画布生命周期内不变,memo 一次,避免在每次 store 变更的 selector 里重复解析。
  const canvasProject = useMemo(() => readUrl().project, []);
  const prefetchBeatContextEpisode = useCallback(
    ({ projectId, episode }: { projectId: string; episode: number }) => {
      prefetchEpisodeBeats(queryClient, projectId, episode);
      prefetchEpisodeDetail(queryClient, projectId, episode);
    },
    [queryClient],
  );
  useCanvasBeatContextPrefetch({
    nodes,
    defaultProjectId: canvasProject,
    prefetchEpisode: prefetchBeatContextEpisode,
  });
  // 触控板平移开关：开启后用 ReactFlow 的 panOnScroll（两指滑动平移、捏合缩放），
  // 关闭则回到默认的滚轮缩放。
  const trackpadPanEnabled = useTrackpadPanStore((state) => state.enabled);
  // 底部任务中心面板展开时，让出底部空间——隐藏画布快捷操作栏，避免与面板重叠。
  const taskPanelOpen = useAppStore((state) => state.taskPanelOpen);
  // Stable node-id lists keep the async task hooks idle while drag frames rebuild nodes.
  const pendingJobNodeIds = useCanvasStore(
    useShallow((state) =>
      state.nodes
        .filter((node) => {
          if (node.type !== CANVAS_NODE_TYPES.exportImage) return false;
          const data = node.data as Record<string, unknown>;
          return (
            data.isGenerating === true &&
            typeof data.generationJobId === 'string' &&
            (data.generationJobId as string).length > 0
          );
        })
        .map((node) => node.id),
    ),
  );
  const pendingResumeNodeIds = useCanvasStore(
    useShallow((state) => state.nodes.filter(nodeNeedsGenerationResume).map((node) => node.id)),
  );
  const applyNodesChange = useCanvasStore((state) => state.onNodesChange);
  const applyEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const connectNodes = useCanvasStore((state) => state.onConnect);
  const replaceEdges = useCanvasStore((state) => state.replaceEdges);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const pollExportImageNode = useCallback(
    (nodeId: string): Promise<void> =>
      pollExportImageGeneration({
        nodeId,
        errorTitle: t('common.error'),
        getNodeData: (currentNodeId) =>
          (useCanvasStore
            .getState()
            .nodes
            .find((item) => item.id === currentNodeId)?.data ?? null) as Record<string, unknown> | null,
        updateNodeData,
      }),
    [t, updateNodeData],
  );
  const resumePendingGenerationNode = useCallback(
    (nodeId: string): Promise<void> => {
      if (!canvasProject) {
        return Promise.resolve();
      }
      const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
      if (!node || !nodeNeedsGenerationResume(node)) {
        return Promise.resolve();
      }
      return resumeNodeGeneration({
        node,
        projectId: canvasProject,
        updateNodeData,
        getNodeData: (currentNodeId) =>
          (useCanvasStore
            .getState()
            .nodes
            .find((item) => item.id === currentNodeId)?.data ?? null) as Record<string, unknown> | null,
      });
    },
    [canvasProject, updateNodeData],
  );
  useCanvasAsyncNodeTasks({
    enabled: Boolean(canvasProject),
    pendingNodeIds: pendingResumeNodeIds,
    runNode: resumePendingGenerationNode,
  });
  useCanvasAsyncNodeTasks({
    pendingNodeIds: pendingJobNodeIds,
    runNode: pollExportImageNode,
  });
  const addNode = useCanvasStore((state) => state.addNode);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const pendingFocusNodeId = useCanvasStore((state) => state.pendingFocusNodeId);
  const clearPendingFocus = useCanvasStore((state) => state.clearPendingFocus);
  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const deleteNode = useCanvasStore((state) => state.deleteNode);
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);
  const groupNodes = useCanvasStore((state) => state.groupNodes);
  const setNodePositions = useCanvasStore((state) => state.setNodePositions);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const openToolDialog = useCanvasStore((state) => state.openToolDialog);
  const closeToolDialog = useCanvasStore((state) => state.closeToolDialog);
  const setViewportState = useCanvasStore((state) => state.setViewportState);
  const setCanvasViewportSize = useCanvasStore((state) => state.setCanvasViewportSize);
  useCanvasViewportMetrics({
    wrapperRef,
    transformStore: reactFlowStore,
    setViewportSize: setCanvasViewportSize,
  });
  const { handleMove, handleMoveEnd } = useCanvasViewportCommit(setViewportState);
  const { handleEdgeClick } = useCanvasEdgePan({
    wrapperRef,
    viewportPort: reactFlowInstance,
    commitViewport: setViewportState,
  });
  const handleMarqueeStart = useCallback(() => {
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
    setPendingConnectStart(null);
    setPreviewConnectionVisual(null);
  }, []);
  const setNativeSelectionActive = useCallback(
    (active: boolean) => reactFlowStore.setState({ nodesSelectionActive: active }),
    [reactFlowStore],
  );
  const { marqueeSelectionRect } = useCanvasMarqueeSelection({
    wrapperRef,
    disabled: pendingNodePlacement !== null,
    nodes,
    coordinatePort: reactFlowInstance,
    applyNodeSelectionChanges: applyNodesChange,
    setNativeSelectionActive,
    setSelectedNodeId: setSelectedNode,
    onMarqueeStart: handleMarqueeStart,
  });
  const viewportBookmarkCommands = useMemo(
    () => ({
      clearBookmarks: () => useCanvasStore.getState().clearViewportBookmarks(),
      captureBookmark: (index: number) => {
        useCanvasStore
          .getState()
          .setViewportBookmark(index, captureCurrentViewport(reactFlowInstance));
      },
      jumpToBookmarkSlot: (index: number) => {
        const bookmark = useCanvasStore.getState().viewportBookmarks[index];
        if (bookmark) {
          jumpToBookmark(reactFlowInstance, bookmark);
        }
      },
    }),
    [reactFlowInstance],
  );
  useCanvasViewportBookmarkShortcuts(viewportBookmarkCommands);
  // ReactFlow only mounts after useCanvasSync has hydrated the store (freezone
  // web mode renders <Canvas> behind a loading gate), so the restored camera is
  // already in `currentViewport` by our first render. Capture it here and feed
  // it as `defaultViewport` so ReactFlow initializes straight to the saved
  // position instead of {0,0,1} (which dumped all nodes to the bottom-right).
  const initialViewportRef = useRef(useCanvasStore.getState().currentViewport);
  const imageViewer = useCanvasStore((state) => state.imageViewer);
  const closeImageViewer = useCanvasStore((state) => state.closeImageViewer);
  const navigateImageViewer = useCanvasStore((state) => state.navigateImageViewer);
  const { videoViewer, closeVideoViewer } = useCanvasExternalDialogs({
    eventPort: canvasEventBus,
    openToolDialog,
    closeToolDialog,
  });
  const renderedNodes = useMemo(() => {
    if (!placementConfirmNodeId) {
      return nodes;
    }
    return nodes.map((node) => {
      if (node.id !== placementConfirmNodeId) {
        return node;
      }
      return {
        ...node,
        className: [node.className, 'canvas-node-placement-confirm']
          .filter(Boolean)
          .join(' '),
      };
    });
  }, [nodes, placementConfirmNodeId]);

  // 隐藏连线时给每条边补 `hidden: true`——ReactFlow 会跳过渲染但边仍在图里，
  // 连接、reconnect、持久化都不受影响。显示时直接透传真实 edges，零额外分配。
  const renderedEdges = useMemo(() => {
    if (!edgesHidden) return edges;
    return edges.map((edge) => (edge.hidden ? edge : { ...edge, hidden: true }));
  }, [edges, edgesHidden]);

  const isCanvasEmpty = useCallback(
    () => useCanvasStore.getState().nodes.length === 0,
    [],
  );
  useCanvasLifecycle({
    wrapperRef,
    isCanvasEmpty,
    setViewport: setViewportState,
    closeImageViewer,
  });
  const {
    alignNodeChanges,
    clearSnapAlignment,
  } = useCanvasSnapAlignment(CANVAS_SNAP_ALIGNMENT_PORT);

  const nodeFocusViewportPort = useMemo(
    () => ({
      getNodeAbsolutePosition: (nodeId: string) =>
        reactFlowInstance.getInternalNode(nodeId)?.internals.positionAbsolute ?? null,
      getZoom: () => reactFlowInstance.getZoom(),
      centerAt: (
        position: { x: number; y: number },
        options: { zoom: number; duration: number },
      ) => {
        void reactFlowInstance.setCenter(position.x, position.y, options);
      },
    }),
    [reactFlowInstance],
  );
  useCanvasPendingNodeFocus({
    pendingNodeId: pendingFocusNodeId,
    nodes,
    viewportPort: nodeFocusViewportPort,
    clearPendingFocus,
  });

  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      // 拖拽时 applyNodeChanges 每帧重建 nodes 数组。这里只在事件回调里「读一次」当前快照,
      // 不把 nodes 列进依赖,避免该回调每帧重建、进而打穿下游 memo。
      const nodes = useCanvasStore.getState().nodes;
      const unlockedChanges = filterPresetManagedNodeChanges(nodes, changes);
      if (unlockedChanges.length === 0) {
        return;
      }
      const effectiveChanges = alignNodeChanges({
        nodes,
        changes: unlockedChanges,
        copyDragActive: altDragCopyRef.current !== null,
      });
      applyNodesChange(effectiveChanges);
    },
    [alignNodeChanges, applyNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      const edges = useCanvasStore.getState().edges;
      const unlockedChanges = filterPresetManagedEdgeChanges(edges, changes);
      if (unlockedChanges.length === 0) {
        return;
      }
      applyEdgesChange(unlockedChanges);
    },
    [applyEdgesChange]
  );

  const handleEdgeDoubleClick = useCallback(
    (event: ReactMouseEvent, edge: CanvasEdge) => {
      event.preventDefault();
      event.stopPropagation();
      if (isPresetManagedEdge(edge)) {
        return;
      }
      deleteEdge(edge.id);
    },
    [deleteEdge]
  );

  const getCanvasGraph = useCallback(() => {
    const { nodes: currentNodes, edges: currentEdges } = useCanvasStore.getState();
    return { nodes: currentNodes, edges: currentEdges };
  }, []);
  const {
    connectGraphNodes,
    connectManualGraphNodes: handleConnect,
    bindSingleBeatContextInput,
    isValidGraphConnection: isValidConnection,
  } = useCanvasConnectionController({
    getGraph: getCanvasGraph,
    connectRegular: connectNodes,
    replaceEdges,
    skillById,
  });

  const updateConnectionPreview = useCallback(
    (preview: CanvasConnectionPreviewRequest | null) => {
      setPreviewConnectionVisual(
        preview
          ? {
              d: createPreviewPath(preview.line),
              stroke: PREVIEW_CONNECTION_STROKE,
              strokeWidth: 1,
              strokeLinecap: 'round',
              left: 0,
              top: 0,
              width: preview.containerSize.width,
              height: preview.containerSize.height,
            }
          : null,
      );
    },
    [],
  );
  const prepareConnectionStart = useCallback(
    (pending: CanvasPendingConnectionStart | null) => {
      setPendingConnectStart(pending);
      setShowNodeMenu(false);
      setMenuAllowedTypes(undefined);
      setPreviewConnectionVisual(null);
    },
    [],
  );
  const clearConnection = useCallback(() => {
    setPendingConnectStart(null);
    setPreviewConnectionVisual(null);
  }, []);
  const openConnectionMenu = useCallback(
    (request: CanvasConnectionMenuRequest) => {
      setPendingConnectStart(request.pending);
      updateConnectionPreview(request.preview);
      setFlowPosition(
        reactFlowInstance.screenToFlowPosition(request.clientPosition),
      );
      setMenuPosition(request.menuPosition);
      setMenuAllowedTypes(request.allowedTypes);
      suppressNextPaneClickRef.current = true;
      setShowNodeMenu(true);
    },
    [reactFlowInstance, updateConnectionPreview],
  );
  const clearHoveredNode = useCallback(
    () => setHoveredNodeId(null),
    [setHoveredNodeId],
  );
  const {
    isPlusConnectDragging,
    beginPlusConnectDrag,
    endPlusConnectDrag,
    handlePlusOpenMenu,
    handlePlusConnectDragStart,
    handlePlusConnectDragMove,
    handlePlusConnectDragEnd,
  } = useCanvasPlusConnectionController({
    wrapperRef,
    nodes,
    clearHoveredNodeTimer,
    clearHoveredNode,
    prepareConnectionDrag: prepareConnectionStart,
    clearConnection,
    updateConnectionPreview,
    openConnectionMenu,
    connectNodes: connectGraphNodes,
  });
  const {
    handleConnectStart,
    handleConnectEnd,
  } = useCanvasReactFlowConnectionController({
    wrapperRef,
    nodes,
    pendingConnection: pendingConnectStart,
    prepareConnectionStart,
    clearConnection,
    openConnectionMenu,
    connectNodes: connectGraphNodes,
  });
  const prepareBatchConnectionDrag = useCallback(() => {
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
    setPendingConnectStart(null);
    setPreviewConnectionVisual(null);
  }, []);
  const openBatchConnectionMenu = useCallback(
    (request: CanvasBatchConnectionMenuRequest) => {
      setPendingConnectStart(null);
      setPendingBatchConnectIds(request.sourceIds);
      setFlowPosition(request.spawnFlowPosition);
      setMenuPosition(request.menuPosition);
      setMenuAllowedTypes(request.allowedTypes);
      suppressNextPaneClickRef.current = true;
      setShowNodeMenu(true);
    },
    [],
  );
  const screenToFlowPosition = useCallback(
    (clientPosition: { x: number; y: number }) =>
      reactFlowInstance.screenToFlowPosition(clientPosition),
    [reactFlowInstance],
  );
  const {
    handleBatchConnectOpenMenu,
    handleBatchConnectDragStart,
    handleBatchConnectDragMove,
    handleBatchConnectDragEnd,
  } = useCanvasBatchConnectionController({
    wrapperRef,
    nodes,
    screenToFlowPosition,
    beginConnectionDrag: beginPlusConnectDrag,
    endConnectionDrag: endPlusConnectDrag,
    prepareConnectionDrag: prepareBatchConnectionDrag,
    updateConnectionPreview,
    openConnectionMenu: openBatchConnectionMenu,
    connectNodes: connectGraphNodes,
  });

  const openNodeMenuAtClientPosition = useCallback((clientPosition: { x: number; y: number }) => {
    const containerRect = wrapperRef.current?.getBoundingClientRect();
    const flowPos = reactFlowInstance.screenToFlowPosition(clientPosition);
    setFlowPosition(flowPos);
    setMenuPosition({
      x: clientPosition.x - (containerRect?.left ?? 0),
      y: clientPosition.y - (containerRect?.top ?? 0),
    });
    setMenuAllowedTypes(undefined);
    setPendingConnectStart(null);
    setPreviewConnectionVisual(null);
    setPendingNodePlacement(null);
    setNodePlacementClientPosition(null);
    setSelectedNode(null);
    setShowNodeMenu(true);
  }, [reactFlowInstance, setSelectedNode]);
  const {
    handleCanvasPointerMove,
    getLastCanvasPointerPosition,
    getPreferredCanvasPointerPosition,
  } = useCanvasNodeMenuShortcut({
    wrapperRef,
    placementActive: pendingNodePlacement !== null,
    setPlacementClientPosition: setNodePlacementClientPosition,
    openNodeMenu: openNodeMenuAtClientPosition,
  });

  const closeNodeMenu = useCallback(() => {
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
    setPendingConnectStart(null);
    setPendingBatchConnectIds(null);
    setPreviewConnectionVisual(null);
  }, []);

  const cancelNodePlacement = useCallback(() => {
    setPendingNodePlacement(null);
    setNodePlacementClientPosition(null);
  }, []);

  const commitNodePlacementAtClientPosition = useCallback(
    (clientPosition: { x: number; y: number }) => {
      if (!pendingNodePlacement) {
        return false;
      }

      const newNodeId = addNode(
        pendingNodePlacement.type,
        reactFlowInstance.screenToFlowPosition({
          x: clientPosition.x - NODE_PLACEMENT_PREVIEW_WIDTH / 2,
          y: clientPosition.y - NODE_PLACEMENT_PREVIEW_HEIGHT / 2,
        }),
        pendingNodePlacement.initialData,
      );
      setSelectedNode(newNodeId);
      if (pendingNodePlacement.skill) {
        bindSingleBeatContextInput(newNodeId, pendingNodePlacement.skill);
      }
      triggerPlacementConfirm(newNodeId);
      setPendingNodePlacement(null);
      setNodePlacementClientPosition(null);
      suppressNextPaneClickRef.current = true;
      return true;
    },
    [
      addNode,
      bindSingleBeatContextInput,
      pendingNodePlacement,
      reactFlowInstance,
      setSelectedNode,
      triggerPlacementConfirm,
    ],
  );

  // Clicking a storyboard board focuses it; during node placement, any node click
  // is treated as confirming the preview location instead of selecting that node.
  const handleNodeClick = useCallback(
    (event: ReactMouseEvent, node: CanvasNode) => {
      if (pendingNodePlacement) {
        event.preventDefault();
        event.stopPropagation();
        commitNodePlacementAtClientPosition({ x: event.clientX, y: event.clientY });
        return;
      }
      if (!isStoryboardGroupNode(node)) {
        return;
      }
      const width =
        node.measured?.width ??
        (typeof node.width === 'number' ? node.width : DEFAULT_NODE_WIDTH);
      const height =
        node.measured?.height ??
        (typeof node.height === 'number' ? node.height : 240);
      reactFlowInstance.setCenter(
        node.position.x + width / 2,
        node.position.y + height / 2,
        { zoom: 1, duration: 320 },
      );
    },
    [commitNodePlacementAtClientPosition, pendingNodePlacement, reactFlowInstance],
  );

  const {
    selectedNodeIds,
    selectedUploadNodeId,
  } = useCanvasSelectionSync({
    nodes,
    selectedNodeId,
    setSelectedNodeId: setSelectedNode,
  });

  const mediaPasteEventPort = useMemo(
    () => ({
      pasteImageIntoNode: (nodeId: string, file: File) => {
        canvasEventBus.publish('upload-node/paste-image', { nodeId, file });
      },
      attachExternalFile: (nodeId: string, file: File) => {
        canvasEventBus.publish('upload-node/external-file', { nodeId, file });
      },
    }),
    [],
  );
  const screenToCanvasPosition = useCallback(
    (position: { x: number; y: number }) =>
      reactFlowInstance.screenToFlowPosition(position),
    [reactFlowInstance],
  );
  const createPastedUploadNode = useCallback(
    (position: { x: number; y: number }) =>
      addNode(
        CANVAS_NODE_TYPES.upload,
        position,
        { user_spawned: true } as Partial<CanvasNodeData>,
      ),
    [addNode],
  );
  const { queueSnapshotPaste } = useCanvasMediaPaste({
    selectedUploadNodeId,
    getPreferredClientPosition: getPreferredCanvasPointerPosition,
    screenToCanvasPosition,
    createUploadNode: createPastedUploadNode,
    selectNode: setSelectedNode,
    eventPort: mediaPasteEventPort,
  });

  const handleOrganizeCanvas = useCallback(() => {
    const { positions, changedCount } = computeAutoLayout(nodes, edges);
    if (Object.keys(positions).length === 0) {
      return;
    }
    if (changedCount > 0) {
      setNodePositions(positions);
    }
    window.requestAnimationFrame(() => {
      reactFlowInstance.fitView({ duration: 240, padding: 0.2 });
    });
  }, [edges, nodes, reactFlowInstance, setNodePositions]);

  const groupSelectedNodes = useCallback(() => {
    groupNodes(selectedNodeIds);
  }, [groupNodes, selectedNodeIds]);

  const deleteSelectedElements = useCallback((): boolean => {
    const deletion = resolveCanvasSelectionDeletion({
      nodes,
      edges: useCanvasStore.getState().edges,
      selectedNodeIds,
      selectedNodeId,
    });
    deletion.edgeIds.forEach((edgeId) => deleteEdge(edgeId));
    if (deletion.nodeIds.length === 1) {
      deleteNode(deletion.nodeIds[0]);
    } else if (deletion.nodeIds.length > 1) {
      deleteNodes(deletion.nodeIds);
    }
    return deletion.hasSelectedTargets;
  }, [deleteEdge, deleteNode, deleteNodes, nodes, selectedNodeId, selectedNodeIds]);

  const handlePaneClick = useCallback((event: ReactMouseEvent) => {
    if (pendingNodePlacement) {
      commitNodePlacementAtClientPosition({ x: event.clientX, y: event.clientY });
      return;
    }

    if (suppressNextPaneClickRef.current) {
      suppressNextPaneClickRef.current = false;
      return;
    }

    if (event.detail >= 2) {
      openNodeMenuAtClientPosition({ x: event.clientX, y: event.clientY });
      suppressNextPaneClickRef.current = true;
      return;
    }

    setSelectedNode(null);
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
    setPendingConnectStart(null);
    setPreviewConnectionVisual(null);
    onBlankPaneClick?.();
  }, [
    commitNodePlacementAtClientPosition,
    onBlankPaneClick,
    openNodeMenuAtClientPosition,
    pendingNodePlacement,
    setSelectedNode,
  ]);

  // 直接把图片 / 视频 / 音频文件从系统拖进画布 → 在落点生成上传节点并把文件喂给它。
  // UploadNode 会按文件类型自行处理：图片就地上传，视频 / 音频 morph 成对应节点。
  // 复用既有上传管道，无需在画布层重复实现上传 / 转码逻辑。
  const {
    isCanvasDropActive,
    acceptsCanvasDrop,
    handleCanvasDragEnter,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    resetCanvasDropIndicator,
  } = useCanvasDropIndicator();

  const handleCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!acceptsCanvasDrop(event)) {
        return;
      }
      event.preventDefault();
      resetCanvasDropIndicator();

      const basePosition = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // ── Sidebar asset drop path ──
      // 侧栏素材卡片(图片 / 视频 / 音频 / 3GS)拖进来 → 在落点直接生成对应节点。
      // 与「加入」按钮共用 spawnAssetNode,保持节点构造一致。
      const assetPayload = readAssetDragPayload(event.dataTransfer);
      if (assetPayload) {
        void (async () => {
          let hydratedPayload = assetPayload;
          try {
            hydratedPayload = await hydrateAssetDragPayload(assetPayload);
          } catch (error) {
            console.warn('[canvas] scene director world manifest unavailable during import', error);
          }
          const newNodeId = spawnAssetNode(
            useCanvasStore.getState(),
            hydratedPayload,
            basePosition,
          );
          setSelectedNode(newNodeId);
        })();
        return;
      }

      // ── File drop path ──
      // Files become uploadNode spawns. Pre-existing behavior; preserved on
      // every canvas now that the mainline preset reject is lifted.
      const mediaFiles = collectDroppedMediaFiles(event.dataTransfer);
      if (mediaFiles.length === 0) {
        return;
      }

      let lastNodeId: string | null = null;
      mediaFiles.forEach((file, index) => {
        const position = {
          x: basePosition.x + index * 36,
          y: basePosition.y + index * 36,
        };
        // File drops are user actions by definition — stamp user_spawned: true
        // so the new node is correctly classified by `nodeMainlineFlags`
        // (and survives `_merge_restored_preset_canvas` refresh). Without
        // this, dropped uploads on a mainline preset canvas would be locked
        // by the canvas-level fallback in `NodeActionToolbar`, breaking the
        // mixed-canvas contract.
        const newNodeId = addNode(
          CANVAS_NODE_TYPES.upload,
          position,
          { user_spawned: true } as Partial<CanvasNodeData>,
        );
        lastNodeId = newNodeId;
        // 等新节点挂载并订阅事件后再投递文件（与 UploadNode 内部 morph 的时序一致）。
        requestAnimationFrame(() => {
          canvasEventBus.publish('upload-node/external-file', { nodeId: newNodeId, file });
        });
      });

      if (lastNodeId) {
        setSelectedNode(lastNodeId);
      }
    },
    [
      addNode,
      acceptsCanvasDrop,
      reactFlowInstance,
      resetCanvasDropIndicator,
      setSelectedNode,
    ]
  );

  const finalizeNodeSpawn = useCallback(
    (newNodeId: string, explicitSkill?: SkillDefinition | null) => {
      if (pendingBatchConnectIds && pendingBatchConnectIds.length > 0) {
        // Batch "+": fan every selected source node into the freshly spawned node.
        for (const sourceId of pendingBatchConnectIds) {
          connectGraphNodes(
            {
              source: sourceId,
              target: newNodeId,
              sourceHandle: 'source',
              targetHandle: 'target',
            },
            explicitSkill,
          );
        }
      } else if (pendingConnectStart) {
        if (pendingConnectStart.handleType === 'source') {
          connectGraphNodes(
            {
              source: pendingConnectStart.nodeId,
              target: newNodeId,
              sourceHandle: 'source',
              targetHandle: 'target',
            },
            explicitSkill,
          );
        } else {
          connectGraphNodes(
            {
              source: newNodeId,
              target: pendingConnectStart.nodeId,
              sourceHandle: 'source',
              targetHandle: 'target',
            },
            explicitSkill,
          );
        }
      }

      setShowNodeMenu(false);
      setMenuAllowedTypes(undefined);
      setPendingConnectStart(null);
      setPendingBatchConnectIds(null);
      setPreviewConnectionVisual(null);
    },
    [
      connectGraphNodes,
      pendingBatchConnectIds,
      pendingConnectStart,
      setPreviewConnectionVisual,
    ],
  );

  const handleNodeSelect = useCallback(
    (type: CanvasNodeType, selectionClientPosition?: { x: number; y: number }) => {
      // 「上传资源」改成直接在画布生成一个空的上传节点；选择具体文件
      // （图片 / 视频）由节点内部 UI 负责，并根据文件类型自行 morph 成
      // video 节点。这样画布菜单的所有入口都保持一致：点选即生成节点。
      let initialData: Partial<Record<string, unknown>> | undefined;
      if (pendingConnectStart && type === CANVAS_NODE_TYPES.imageEdit) {
        initialData = { generationMode: 'image_reference', requestAspectRatio: 'auto' };
      } else if (
        pendingConnectStart
        && pendingConnectStart.handleType === 'target'
        && type === CANVAS_NODE_TYPES.upload
      ) {
        // 从 imageGen 的 target handle 拖出来 → 点「图片」落到 upload 节点
        // 时，按「上传图片」语义初始化（同步 ImageGen 的 spawn-upstream-image
        // 按钮：拒视频）。
        const originNode = nodes.find((node) => node.id === pendingConnectStart.nodeId);
        if (originNode?.type === CANVAS_NODE_TYPES.imageGen) {
          initialData = { imageOnly: true };
        }
      }

      const isPlainAddNodeMenu =
        !pendingConnectStart && !pendingBatchConnectIds && !menuAllowedTypes;
      if (isPlainAddNodeMenu) {
        const containerRect = wrapperRef.current?.getBoundingClientRect();
        const fallbackClientPosition = containerRect
          ? {
              x: containerRect.left + menuPosition.x,
              y: containerRect.top + menuPosition.y,
            }
          : null;
        const clientPosition =
          selectionClientPosition ??
          getLastCanvasPointerPosition() ??
          fallbackClientPosition;
        setShowNodeMenu(false);
        setMenuAllowedTypes(undefined);
        setPendingNodePlacement({ type, initialData });
        setNodePlacementClientPosition(clientPosition);
        setSelectedNode(null);
        suppressNextPaneClickRef.current = false;
        return;
      }

      const newNodeId = addNode(type, flowPosition, initialData);
      finalizeNodeSpawn(newNodeId);
    },
    [
      addNode,
      finalizeNodeSpawn,
      flowPosition,
      getLastCanvasPointerPosition,
      menuAllowedTypes,
      menuPosition.x,
      menuPosition.y,
      nodes,
      pendingBatchConnectIds,
      pendingConnectStart,
      setSelectedNode,
    ]
  );

  const handleSkillSelect = useCallback(
    (skill: SkillDefinition) => {
      const initialData = {
        skill_id: skill.id,
        skill_schema_version: skill.schema_version ?? SKILL_SCHEMA_VERSION,
        displayName: skill.display_name,
      } as Partial<CanvasNodeData>;
      const containerRect = wrapperRef.current?.getBoundingClientRect();
      const fallbackClientPosition = containerRect
        ? {
            x: containerRect.left + menuPosition.x,
            y: containerRect.top + menuPosition.y,
          }
        : null;
      const clientPosition =
        getLastCanvasPointerPosition() ??
        fallbackClientPosition;
      setShowNodeMenu(false);
      setMenuAllowedTypes(undefined);
      setPendingNodePlacement({
        type: CANVAS_NODE_TYPES.skill,
        initialData,
        skill,
      });
      setNodePlacementClientPosition(clientPosition);
      setSelectedNode(null);
      suppressNextPaneClickRef.current = false;
    },
    [
      getLastCanvasPointerPosition,
      menuPosition.x,
      menuPosition.y,
      setSelectedNode,
    ],
  );

  // Bottom quick-action bar spawns at the current viewport center (no click /
  // pending-connect context), unlike the right-click / double-click menu which
  // drops the node at the cursor.
  const spawnAtViewportCenter = useCallback((): { x: number; y: number } => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const center = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return reactFlowInstance.screenToFlowPosition(center);
  }, [reactFlowInstance]);

  const handleQuickAddNode = useCallback(
    (type: CanvasNodeType) => {
      const newNodeId = addNode(type, spawnAtViewportCenter());
      setSelectedNode(newNodeId);
    },
    [addNode, setSelectedNode, spawnAtViewportCenter],
  );

  const handleQuickAddSkill = useCallback(
    (skill: SkillDefinition) => {
      const newNodeId = addNode(CANVAS_NODE_TYPES.skill, spawnAtViewportCenter(), {
        skill_id: skill.id,
        skill_schema_version: skill.schema_version ?? SKILL_SCHEMA_VERSION,
        displayName: skill.display_name,
      } as Partial<CanvasNodeData>);
      setSelectedNode(newNodeId);
      bindSingleBeatContextInput(newNodeId, skill);
    },
    [addNode, bindSingleBeatContextInput, setSelectedNode, spawnAtViewportCenter],
  );

  // 历史资产弹窗「使用」：把该资产作为新节点生成到视口中心（复用素材落点的 spawnAssetNode）。
  // 批量使用时传 placement，把多个新节点在视口中心附近铺成网格，避免全部叠在同一点。
  const handleUseHistoryAsset = useCallback(
    (asset: CanvasAsset, placement?: { index: number; total: number }) => {
      const payload: CanvasAssetDragPayload = {
        kind: asset.kind,
        label: asset.label ?? '',
        // 历史记录里存的原始提示词，回填到新建视频节点的提示词框（见 spawnAssetNode）。
        prompt: asset.prompt ?? undefined,
        url: asset.url,
        // 世界模型节点用 coverUrl 当封面（previewImageUrl）；其余类型无封面。
        coverUrl: asset.kind === 'model' ? asset.previewUrl : null,
        // 历史「使用」还原的是生成产物：图片应还原成成品「图片节点」(imageGen)——
        // 带回提示词、展开操作区、按图自适应比例，而非只读的上传参考图节点（见 spawnAssetNode）。
        restoreAsGeneratedImage: true,
        // 原始生成的注册表模型 id / 生成模式,透传给还原节点以复现原次生成配置
        // （视频写回 data.model+data.genMode；图片写回 data.model）。旧记录为 undefined。
        model: asset.model ?? undefined,
        genMode: asset.genMode ?? undefined,
        source: {},
      };
      const origin = spawnAtViewportCenter();
      // 网格铺开：每行最多 4 个，格间距 320，整体大致以视口中心为中心。
      const position =
        placement && placement.total > 1
          ? (() => {
              const perRow = Math.min(4, placement.total);
              const gap = 320;
              const col = placement.index % perRow;
              const row = Math.floor(placement.index / perRow);
              const rows = Math.ceil(placement.total / perRow);
              return {
                x: origin.x + (col - (perRow - 1) / 2) * gap,
                y: origin.y + (row - (rows - 1) / 2) * gap,
              };
            })()
          : origin;
      const newNodeId = spawnAssetNode(useCanvasStore.getState(), payload, position);
      setSelectedNode(newNodeId);
    },
    [setSelectedNode, spawnAtViewportCenter],
  );

  // 历史资产弹窗「删除」：从画布移除该资产对应的源节点。
  const handleDeleteHistoryNode = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId);
    },
    [deleteNode],
  );

  const duplicateNodes = useCallback(
    (sourceNodeIds: string[], options: DuplicateOptions = {}) => {
      // Source is either a serialized clipboard snapshot (paste) or live nodes
      // looked up by id (duplicate / 创建副本).
      const snapshot = options.sourceSnapshot;
      const sourceNodes = snapshot
        ? snapshot.nodes
        : nodes.filter((node) => sourceNodeIds.includes(node.id));
      if (sourceNodes.length === 0) {
        return null as DuplicateResult | null;
      }

      const sourceIdSet = new Set(sourceNodes.map((node) => node.id));
      const internalEdges = snapshot
        ? snapshot.edges
        : edges.filter(
            (edge) => sourceIdSet.has(edge.source) && sourceIdSet.has(edge.target)
          );

      // Cursor paste: lay the group out with its top-left at the target flow
      // position instead of the offset-from-original layout used by duplicate.
      const targetPos = options.targetFlowPosition;
      const groupMinX = targetPos
        ? Math.min(...sourceNodes.map((node) => node.position.x))
        : 0;
      const groupMinY = targetPos
        ? Math.min(...sourceNodes.map((node) => node.position.y))
        : 0;

      const baseOffsets = [
        { x: 44, y: 30 },
        { x: 72, y: 8 },
        { x: 18, y: 68 },
        { x: 96, y: 42 },
      ];
      const existingNodes = useCanvasStore.getState().nodes;
      const ignoreNodeIds = new Set<string>();
      const offsetStep = options.disableOffsetIteration ? 0 : pasteIterationRef.current;
      let chosenOffset = options.explicitOffset ?? baseOffsets[0];

      const isOffsetAvailable = (offset: { x: number; y: number }) => sourceNodes.every((node) => {
        const size = getNodeSize(node);
        return !hasRectCollision(
          {
            x: node.position.x + offset.x + offsetStep * 8,
            y: node.position.y + offset.y + offsetStep * 6,
            width: size.width,
            height: size.height,
          },
          existingNodes,
          ignoreNodeIds
        );
      });

      if (!targetPos && !options.explicitOffset) {
        const matchedBaseOffset = baseOffsets.find((offset) => isOffsetAvailable(offset));
        if (matchedBaseOffset) {
          chosenOffset = matchedBaseOffset;
        } else {
          const maxStep = 16;
          for (let step = 1; step <= maxStep; step += 1) {
            const candidate = { x: 24 + step * 26, y: 16 + step * 18 };
            if (isOffsetAvailable(candidate)) {
              chosenOffset = candidate;
              break;
            }
          }
        }
      }

      const idMap = new Map<string, string>();
      const sizeMap = new Map<string, { width: number; height: number }>();
      const pastedForMigration: Array<{ id: string; data: CanvasNodeData }> = [];
      for (const sourceNode of sourceNodes) {
        const data = cloneCanvasNodeData(sourceNode.data);
        if ('isGenerating' in (data as Record<string, unknown>)) {
          (data as { isGenerating?: boolean }).isGenerating = false;
        }
        if ('generationStartedAt' in (data as Record<string, unknown>)) {
          (data as { generationStartedAt?: number | null }).generationStartedAt = null;
        }
        if ('generationJobId' in (data as Record<string, unknown>)) {
          (data as { generationJobId?: string | null }).generationJobId = null;
        }
        if ('generationProviderId' in (data as Record<string, unknown>)) {
          (data as { generationProviderId?: string | null }).generationProviderId = null;
        }
        if ('generationClientSessionId' in (data as Record<string, unknown>)) {
          (data as { generationClientSessionId?: string | null }).generationClientSessionId = null;
        }
        if ('generationStoryboardMetadata' in (data as Record<string, unknown>)) {
          (data as { generationStoryboardMetadata?: unknown }).generationStoryboardMetadata = undefined;
        }
        if ('generationError' in (data as Record<string, unknown>)) {
          (data as { generationError?: string | null }).generationError = null;
        }
        if ('generationErrorDetails' in (data as Record<string, unknown>)) {
          (data as { generationErrorDetails?: string | null }).generationErrorDetails = null;
        }
        if ('generationDebugContext' in (data as Record<string, unknown>)) {
          (data as { generationDebugContext?: unknown }).generationDebugContext = undefined;
        }

        const position = targetPos
          ? {
              x: targetPos.x + (sourceNode.position.x - groupMinX),
              y: targetPos.y + (sourceNode.position.y - groupMinY),
            }
          : {
              x: sourceNode.position.x + chosenOffset.x + offsetStep * 8,
              y: sourceNode.position.y + chosenOffset.y + offsetStep * 6,
            };
        const nextNodeId = addNode(
          sourceNode.type as CanvasNodeType,
          position,
          { ...data }
        );
        idMap.set(sourceNode.id, nextNodeId);
        sizeMap.set(nextNodeId, getNodeSize(sourceNode));
        pastedForMigration.push({ id: nextNodeId, data });
      }

      const sizeSyncChanges = Array.from(sizeMap.entries()).map(([nodeId, size]) => ({
        id: nodeId,
        type: 'dimensions' as const,
        dimensions: { width: size.width, height: size.height },
        resizing: false,
        setAttributes: true,
      }));
      if (sizeSyncChanges.length > 0) {
        applyNodesChange(sizeSyncChanges);
      }

      for (const edge of internalEdges) {
        const nextSource = idMap.get(edge.source);
        const nextTarget = idMap.get(edge.target);
        if (!nextSource || !nextTarget) {
          continue;
        }
        connectNodes({
          source: nextSource,
          target: nextTarget,
          sourceHandle: edge.sourceHandle ?? 'source',
          targetHandle: edge.targetHandle ?? 'target',
        });
      }

      if (!options.disableOffsetIteration && !targetPos) {
        pasteIterationRef.current += 1;
      }
      const firstNodeId = idMap.get(sourceNodes[0].id) ?? null;
      if (!options.suppressSelect) {
        if (options.selectAll && idMap.size > 0) {
          // Select the whole pasted group (and deselect the originals) so it can
          // be dragged immediately — same selection model as a box-select.
          const pastedIds = new Set(idMap.values());
          applyNodesChange(
            useCanvasStore
              .getState()
              .nodes.filter(
                (node) => Boolean(node.selected) !== pastedIds.has(node.id),
              )
              .map((node) => ({
                id: node.id,
                type: 'select' as const,
                selected: pastedIds.has(node.id),
              })),
          );
          setSelectedNode(pastedIds.size === 1 ? firstNodeId : null);
        } else if (firstNodeId) {
          setSelectedNode(firstNodeId);
        }
      }
      // 跨项目粘贴：把节点里指向「源项目」的媒体资产重新上传到当前项目，完成后静默
      // 改写 URL。后台执行、不阻塞粘贴；单条失败保留原 URL 并提示。仅当来自序列化
      // 剪贴板（paste）且源项目与当前项目不同才触发——同项目复制/副本无需迁移。
      const sourceProject = snapshot?.sourceProject ?? null;
      const currentProject = readUrl().project ?? null;
      if (
        sourceProject
        && currentProject
        && sourceProject !== currentProject
        && pastedForMigration.length > 0
      ) {
        void migratePastedNodeAssets({
          nodes: pastedForMigration,
          targetProject: currentProject,
          getLiveNodeData: (nodeId) =>
            useCanvasStore.getState().nodes.find((node) => node.id === nodeId)?.data ?? null,
          updateNodeData,
        })
          .then(({ migrated, failed }) => {
            if (failed > 0) {
              toast.error(t('canvas.crossProjectAssets.partialFailure', { count: failed }));
            } else if (migrated > 0) {
              toast.success(t('canvas.crossProjectAssets.success', { count: migrated }));
            }
          })
          .catch((error) => {
            console.warn('[canvas] cross-project asset migration failed', error);
          });
      }

      return { firstNodeId, idMap };
    },
    [
      addNode,
      applyNodesChange,
      connectNodes,
      edges,
      nodes,
      setSelectedNode,
      t,
      updateNodeData,
    ]
  );

  // Paste the clipboard snapshot as fresh, self-contained nodes. `targetFlow`
  // (cursor flow position) lays the group out under the cursor; without it the
  // group is offset from its copied position (keyboard paste).
  const pasteFromClipboard = useCallback(
    (
      snapshot: CanvasClipboardSnapshot | null,
      targetFlow?: { x: number; y: number },
    ): string | null => {
      if (!snapshot || snapshot.nodes.length === 0) {
        return null;
      }
      return (
        duplicateNodes([], {
          sourceSnapshot: snapshot,
          targetFlowPosition: targetFlow,
          selectAll: true,
        })?.firstNodeId ?? null
      );
    },
    [duplicateNodes],
  );

  const createClipboardSnapshot = useCallback(
    () => createCanvasClipboardSnapshot({
      nodes,
      edges,
      selectedNodeIds,
      sourceProject: canvasProject,
    }),
    [canvasProject, edges, nodes, selectedNodeIds],
  );
  const resetPasteIteration = useCallback(() => {
    pasteIterationRef.current = 0;
  }, []);
  const clearSystemClipboard = useCallback(
    () => navigator.clipboard?.writeText('') ?? Promise.resolve(),
    [],
  );
  const {
    hasCopiedNodes,
    copySelection,
    pasteSelection,
    pasteAt,
  } = useCanvasNodeClipboard({
    createSnapshot: createClipboardSnapshot,
    pasteSnapshot: pasteFromClipboard,
    queueSnapshotPaste,
    resetPasteIteration,
    clearSystemClipboard,
  });
  const getContextMenuCapabilities = useCallback(() => {
    const history = useCanvasStore.getState().history;
    return {
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      canPaste: hasCopiedNodes(),
    };
  }, [hasCopiedNodes]);
  const { contextMenu, closeContextMenu } = useCanvasPaneContextMenu({
    wrapperRef,
    disabled: pendingNodePlacement !== null,
    getCapabilities: getContextMenuCapabilities,
  });
  useCanvasKeyboardShortcuts({
    placementActive: pendingNodePlacement !== null,
    nodeMenuOpen: showNodeMenu,
    canCopySelection: selectedNodeIds.length > 0,
    canGroupSelection: selectedNodeIds.length >= 2,
    cancelPlacement: cancelNodePlacement,
    closeNodeMenu,
    organizeCanvas: handleOrganizeCanvas,
    copySelection,
    pasteSelection,
    undo,
    redo,
    groupSelection: groupSelectedNodes,
    deleteSelection: deleteSelectedElements,
  });

  const handleNodeDragStart = useCallback(
    (event: ReactMouseEvent, node: CanvasNode, draggedNodes: CanvasNode[]) => {
      // 组内成员拖动：记下「所有被拖成员」（多选时第三参带全量）所属的组 id，松手时
      // 逐组按成员最终落点 fitGroupToChildren 重新包住（libtv 式，拖动期间不动框）。
      // 只看被抓节点会漏掉多选里其它组的成员 —— 它们没有 extent:'parent' 钳制，
      // 拖完不 refit 就永久悬在组框外。alt 复制拖动不参与（原节点回弹）。
      // parentId 从 store 读 —— React Flow 传给拖动回调的 node 参数是精简 drag item，
      // 可能不带 parentId，直接用 node.parentId 会取不到。
      groupFitDragRef.current = null;
      linkedDragRef.current = null;
      if (!event.altKey) {
        const stateNodes = useCanvasStore.getState().nodes;
        const dragged = draggedNodes?.length ? draggedNodes : [node];
        const groupIds = new Set<string>();
        for (const item of dragged) {
          const parentId = stateNodes.find((n) => n.id === item.id)?.parentId;
          if (parentId) groupIds.add(parentId);
        }
        if (groupIds.size > 0) {
          groupFitDragRef.current = { groupIds: [...groupIds] };
        }

        // 单节点拖动时,若被拖的是「导演世界」源节点或其「导演世界输出」组,记下另一方
        // 并准备按相同位移联动(多选/框选拖动不联动,交给用户自行摆放)。
        if (!draggedNodes || draggedNodes.length <= 1) {
          const stateEdges = useCanvasStore.getState().edges;
          const partnerIds = findLinkedCapturePartnerIds(node.id, stateNodes, stateEdges);
          if (partnerIds.length > 0) {
            const nodeById = new Map(stateNodes.map((n) => [n.id, n] as const));
            const draggedNode = nodeById.get(node.id);
            const partnerStarts = new Map<string, { x: number; y: number }>();
            for (const partnerId of partnerIds) {
              const partner = nodeById.get(partnerId);
              if (partner && !partner.parentId) {
                partnerStarts.set(partnerId, { x: partner.position.x, y: partner.position.y });
              }
            }
            if (draggedNode && partnerStarts.size > 0) {
              linkedDragRef.current = {
                partnerStarts,
                draggedStart: { x: draggedNode.position.x, y: draggedNode.position.y },
              };
            }
          }
        }
      }

      if (!event.altKey) {
        altDragCopyRef.current = null;
        return;
      }

      const sourceNodeIds = selectedNodeIds.includes(node.id)
        ? selectedNodeIds
        : [node.id];
      if (sourceNodeIds.length === 0) {
        altDragCopyRef.current = null;
        return;
      }
      const startPositions = new Map<string, { x: number; y: number }>();
      for (const sourceNodeId of sourceNodeIds) {
        const sourceNode = nodes.find((item) => item.id === sourceNodeId);
        if (!sourceNode) {
          continue;
        }
        startPositions.set(sourceNodeId, {
          x: sourceNode.position.x,
          y: sourceNode.position.y,
        });
      }
      if (startPositions.size === 0) {
        altDragCopyRef.current = null;
        return;
      }

      const duplicateResult = duplicateNodes(sourceNodeIds, {
        explicitOffset: { x: 0, y: 0 },
        disableOffsetIteration: true,
        suppressSelect: true,
      });
      if (!duplicateResult) {
        altDragCopyRef.current = null;
        return;
      }

      const copiedNodeIds = sourceNodeIds
        .map((sourceId) => duplicateResult.idMap.get(sourceId))
        .filter((id): id is string => Boolean(id));
      if (copiedNodeIds.length === 0) {
        altDragCopyRef.current = null;
        return;
      }

      // Keep the duplicated nodes visually above the original dragged node.
      useCanvasStore.setState((state) => ({
        nodes: state.nodes.map((currentNode) => {
          if (!copiedNodeIds.includes(currentNode.id)) {
            return currentNode;
          }
          return {
            ...currentNode,
            zIndex: ALT_DRAG_COPY_Z_INDEX,
            style: {
              ...(currentNode.style ?? {}),
              zIndex: ALT_DRAG_COPY_Z_INDEX,
            },
          };
        }),
      }));

      altDragCopyRef.current = {
        sourceNodeIds,
        startPositions,
        copiedNodeIds,
        sourceToCopyIdMap: duplicateResult.idMap,
      };
    },
    [duplicateNodes, nodes, selectedNodeIds]
  );

  const handleNodeDrag = useCallback(
    (_event: ReactMouseEvent, node: CanvasNode) => {
      // 联动拖动:把 partner(源节点或输出组)按被拖节点的位移同步移动。移动组时
      // 其子节点(相对坐标)会自动跟随,无需额外处理。
      const linked = linkedDragRef.current;
      if (linked) {
        const linkDeltaX = node.position.x - linked.draggedStart.x;
        const linkDeltaY = node.position.y - linked.draggedStart.y;
        const linkChanges = [...linked.partnerStarts].map(([partnerId, start]) => ({
          id: partnerId,
          type: 'position' as const,
          position: { x: start.x + linkDeltaX, y: start.y + linkDeltaY },
          dragging: true as const,
        }));
        if (linkChanges.length > 0) {
          applyNodesChange(linkChanges);
        }
      }

      const altCopyState = altDragCopyRef.current;
      if (!altCopyState) {
        return;
      }

      const startPosition = altCopyState.startPositions.get(node.id);
      if (!startPosition) {
        return;
      }

      const deltaX = node.position.x - startPosition.x;
      const deltaY = node.position.y - startPosition.y;

      const restoreSourceChanges = altCopyState.sourceNodeIds
        .map((sourceId) => {
          const sourceStart = altCopyState.startPositions.get(sourceId);
          if (!sourceStart) {
            return null;
          }
          return {
            id: sourceId,
            type: 'position' as const,
            position: sourceStart,
            dragging: true,
          };
        })
        .filter((change): change is {
          id: string;
          type: 'position';
          position: { x: number; y: number };
          dragging: true;
        } => Boolean(change));

      const moveCopyChanges = altCopyState.sourceNodeIds
        .map((sourceId) => {
          const sourceStart = altCopyState.startPositions.get(sourceId);
          const copyId = altCopyState.sourceToCopyIdMap.get(sourceId);
          if (!sourceStart || !copyId) {
            return null;
          }
          return {
            id: copyId,
            type: 'position' as const,
            position: { x: sourceStart.x + deltaX, y: sourceStart.y + deltaY },
            dragging: true,
          };
        })
        .filter((change): change is {
          id: string;
          type: 'position';
          position: { x: number; y: number };
          dragging: true;
        } => Boolean(change));

      const allChanges = [...restoreSourceChanges, ...moveCopyChanges];
      if (allChanges.length > 0) {
        applyNodesChange(allChanges);
      }
    },
    [applyNodesChange]
  );

  const handleNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: CanvasNode) => {
      clearSnapAlignment();
      // 联动拖动收尾:partner 的最终位置已在拖动期间(dragging:true)写入,松手时
      // React Flow 对被拖节点发出的 dragging:false 变更会统一压入同一条撤销记录,
      // 故这里只需清掉引用,不再额外提交以免产生重复的 undo 步骤。
      linkedDragRef.current = null;
      // 组内成员拖动收尾（libtv 式）：按成员的最终落点把每个涉及的组框重新撑大包住
      //（fitGroupToChildren 含左/上方向的整体平移）。普通组成员不带 extent，可自由落点。
      const groupFit = groupFitDragRef.current;
      groupFitDragRef.current = null;
      if (groupFit) {
        const { fitGroupToChildren } = useCanvasStore.getState();
        for (const groupId of groupFit.groupIds) {
          fitGroupToChildren(groupId);
        }
      }
      const altCopyState = altDragCopyRef.current;
      if (!altCopyState) {
        return;
      }
      altDragCopyRef.current = null;

      const startPosition = altCopyState.startPositions.get(node.id);
      if (!startPosition) {
        return;
      }

      const offset = {
        x: node.position.x - startPosition.x,
        y: node.position.y - startPosition.y,
      };

      const restoreSourceChanges = altCopyState.sourceNodeIds
        .map((sourceId) => {
          const sourceStart = altCopyState.startPositions.get(sourceId);
          if (!sourceStart) {
            return null;
          }
          return {
            id: sourceId,
            type: 'position' as const,
            position: sourceStart,
            dragging: false,
          };
        })
        .filter((change): change is {
          id: string;
          type: 'position';
          position: { x: number; y: number };
          dragging: false;
        } => Boolean(change));

      const finalizeCopyChanges = altCopyState.sourceNodeIds
        .map((sourceId) => {
          const sourceStart = altCopyState.startPositions.get(sourceId);
          const copyId = altCopyState.sourceToCopyIdMap.get(sourceId);
          if (!sourceStart || !copyId) {
            return null;
          }
          return {
            id: copyId,
            type: 'position' as const,
            position: { x: sourceStart.x + offset.x, y: sourceStart.y + offset.y },
            dragging: false,
          };
        })
        .filter((change): change is {
          id: string;
          type: 'position';
          position: { x: number; y: number };
          dragging: false;
        } => Boolean(change));

      const allChanges = [...restoreSourceChanges, ...finalizeCopyChanges];
      if (allChanges.length > 0) {
        applyNodesChange(allChanges);
      }
      if (altCopyState.copiedNodeIds.length > 0) {
        setSelectedNode(altCopyState.copiedNodeIds[0]);
      }
    },
    [applyNodesChange, clearSnapAlignment, setSelectedNode]
  );

  // 拖「选区框」整体移动多选节点时，React Flow 走 onSelectionDrag* 而非 onNodeDrag*，
  // 组成员的 refit 同样要在这条路径上收尾，否则组成员被拖出框后无人包住。
  const handleSelectionDragStart = useCallback(
    (_event: ReactMouseEvent, draggedNodes: CanvasNode[]) => {
      const stateNodes = useCanvasStore.getState().nodes;
      const groupIds = new Set<string>();
      for (const item of draggedNodes) {
        const parentId = stateNodes.find((n) => n.id === item.id)?.parentId;
        if (parentId) groupIds.add(parentId);
      }
      groupFitDragRef.current =
        groupIds.size > 0 ? { groupIds: [...groupIds] } : null;
    },
    []
  );

  const handleSelectionDragStop = useCallback(() => {
    const groupFit = groupFitDragRef.current;
    groupFitDragRef.current = null;
    if (groupFit) {
      const { fitGroupToChildren } = useCanvasStore.getState();
      for (const groupId of groupFit.groupIds) {
        fitGroupToChildren(groupId);
      }
    }
  }, []);

  const emptyHint = useMemo(() => {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-muted-foreground shadow-sm">
          <MousePointerClick className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="text-sm">
            {t('canvas.emptyHintBeforeTab')}
            <span className="text-primary">Tab</span>
            {t('canvas.emptyHintAfterTab')}
          </span>
        </div>
      </div>
    );
  }, [t]);
  const nodePlacementPreview = useMemo(() => {
    if (!pendingNodePlacement || !nodePlacementClientPosition) {
      return null;
    }
    const wrapperRect = wrapperRef.current?.getBoundingClientRect();
    if (!wrapperRect) {
      return null;
    }
    const definition = nodeCatalog.getDefinition(pendingNodePlacement.type);
    const label = pendingNodePlacement.skill
      ? translateSkillName(pendingNodePlacement.skill, t)
      : definition ? t(definition.menuLabelKey) : pendingNodePlacement.type;
    return {
      left:
        nodePlacementClientPosition.x -
        wrapperRect.left -
        NODE_PLACEMENT_PREVIEW_WIDTH / 2,
      top:
        nodePlacementClientPosition.y -
        wrapperRect.top -
        NODE_PLACEMENT_PREVIEW_HEIGHT / 2,
      label,
    };
  }, [nodePlacementClientPosition, pendingNodePlacement, t]);

  return (
    <CreditDisplayHiddenProvider value={isCeRuntime()}>
    <div
      ref={wrapperRef}
      className="relative h-full w-full bg-background"
      onDragEnter={handleCanvasDragEnter}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
      onPointerMove={handleCanvasPointerMove}
    >
      <ReactFlow
        nodes={renderedNodes}
        edges={renderedEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onEdgeClick={handleEdgeClick}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        isValidConnection={isValidConnection}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeClick={handleNodeClick}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onSelectionDragStart={handleSelectionDragStart}
        onSelectionDragStop={handleSelectionDragStop}
        onPaneClick={handlePaneClick}
        onMove={handleMove}
        onMoveEnd={handleMoveEnd}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        connectionMode={ConnectionMode.Loose}
        defaultViewport={initialViewportRef.current}
        connectionRadius={CONNECTION_SNAP_RADIUS}
        minZoom={0.1}
        maxZoom={8}
        nodesDraggable
        nodesConnectable
        edgesReconnectable
        panOnDrag={PAN_ON_DRAG_BUTTONS}
        panOnScroll={trackpadPanEnabled}
        zoomOnScroll={!trackpadPanEnabled}
        panActivationKeyCode={PAN_ACTIVATION_KEY_CODE}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={MULTI_SELECTION_KEY_CODES}
        selectionKeyCode={null}
        deleteKeyCode={null}
        onlyRenderVisibleElements
        zoomOnDoubleClick={false}
        proOptions={REACT_FLOW_PRO_OPTIONS}
        className="bg-background"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={2}
          color="var(--canvas-grid-dot)"
        />
        {minimapVisible && (
          <MiniMap
            position={controlsPlacement === 'top-right' ? 'top-right' : 'bottom-right'}
            className="canvas-minimap canvas-minimap--popover nopan nowheel !border-border !bg-card"
            style={{ pointerEvents: 'all', zIndex: 10000 }}
            nodeColor="var(--canvas-minimap-node)"
            maskColor="var(--canvas-minimap-mask)"
            pannable
            zoomable
            onMouseEnter={() => setMinimapHover(true)}
            onMouseLeave={() => setMinimapHover(false)}
          />
        )}
        {minimapVisible && <CanvasMinimapBookmarksOverlay onHoverChange={setMinimapHover} />}

        <SelectedNodeOverlay />
        <MultiSelectionToolbar />
        <MultiSelectionConnectButton
          onBatchOpenMenu={handleBatchConnectOpenMenu}
          onBatchDragStart={handleBatchConnectDragStart}
          onBatchDragMove={handleBatchConnectDragMove}
          onBatchDragEnd={handleBatchConnectDragEnd}
        />
        <NodeSpawnPlusOverlay
          hoveredNodeId={hoveredNodeId}
          hidden={isPlusConnectDragging}
          onOverlayHoverStart={clearHoveredNodeTimer}
          onOverlayHoverEnd={scheduleHoveredNodeClear}
          onPlusOpenMenu={handlePlusOpenMenu}
          onPlusDragStart={handlePlusConnectDragStart}
          onPlusDragMove={handlePlusConnectDragMove}
          onPlusDragEnd={handlePlusConnectDragEnd}
        />
        <SnapAlignGuides />
      </ReactFlow>

      {marqueeSelectionRect && (
        <div
          className="pointer-events-none absolute z-[130] rounded-md border border-dashed border-foreground/55 bg-foreground/[0.04]"
          style={{
            left: marqueeSelectionRect.left,
            top: marqueeSelectionRect.top,
            width: marqueeSelectionRect.width,
            height: marqueeSelectionRect.height,
          }}
        />
      )}

      {nodePlacementPreview && (
        <div
          className="pointer-events-none absolute z-[135] select-none rounded-2xl border border-primary/45 bg-popover/90 shadow-xl backdrop-blur-md"
          style={{
            left: nodePlacementPreview.left,
            top: nodePlacementPreview.top,
            width: NODE_PLACEMENT_PREVIEW_WIDTH,
            height: NODE_PLACEMENT_PREVIEW_HEIGHT,
          }}
        >
          <div className="absolute inset-0 rounded-2xl bg-primary/10" />
          <div className="relative flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium leading-5 text-popover-foreground/90">
                  {nodePlacementPreview.label}
                </div>
                <div className="mt-1 text-[12px] leading-4 text-muted-foreground">
                  {t('canvas.nodePlacement.previewHint')}
                </div>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MousePointerClick className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] leading-4 text-muted-foreground/80">
              <span>{t('canvas.nodePlacement.confirmHint')}</span>
              <span>{t('canvas.nodePlacement.cancelHint')}</span>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <CanvasContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          sections={[
            [
              {
                key: 'upload',
                label: '上传',
                onSelect: () => {
                  const flowPos = reactFlowInstance.screenToFlowPosition({
                    x: contextMenu.clientX,
                    y: contextMenu.clientY,
                  });
                  addNode(CANVAS_NODE_TYPES.upload, flowPos);
                },
              },
              {
                key: 'add-node',
                label: '添加节点',
                onSelect: () =>
                  openNodeMenuAtClientPosition({
                    x: contextMenu.clientX,
                    y: contextMenu.clientY,
                  }),
              },
            ],
            [
              {
                key: 'undo',
                label: '撤销',
                shortcut: '⌘Z',
                disabled: !contextMenu.canUndo,
                onSelect: () => {
                  undo();
                },
              },
              {
                key: 'redo',
                label: '重做',
                shortcut: '⇧⌘Z',
                disabled: !contextMenu.canRedo,
                onSelect: () => {
                  redo();
                },
              },
            ],
            [
              {
                key: 'paste',
                label: '粘贴',
                shortcut: '⌘V',
                disabled: !contextMenu.canPaste,
                onSelect: () => {
                  // Paste the group with its top-left at the right-click point.
                  pasteAt(
                    reactFlowInstance.screenToFlowPosition({
                      x: contextMenu.clientX,
                      y: contextMenu.clientY,
                    }),
                  );
                },
              },
            ],
          ]}
        />
      )}

      {nodes.length === 0 && emptyHint}

      {isCanvasDropActive && (
        <div className="pointer-events-none absolute inset-0 z-[120] flex items-center justify-center">
          <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-primary/70 bg-primary/[0.06]" />
          <div className="relative flex flex-col items-center gap-3 rounded-2xl bg-surface-dark/90 px-8 py-6 text-center shadow-2xl ring-1 ring-border">
            <Upload className="h-8 w-8 text-primary" />
            <div className="text-sm font-medium text-text-dark">释放以添加到画布</div>
            <div className="text-xs text-text-muted">支持图片、视频、音频，自动生成对应节点</div>
          </div>
        </div>
      )}

      <CanvasMinimapButton
        pinned={minimapPinned}
        onTogglePin={toggleMinimapPinned}
        onHoverChange={setMinimapHover}
        placement={controlsPlacement}
      />

      <CanvasSnapAlignButton placement={controlsPlacement} />

      <CanvasFpsMeter />

      <BackToNodesHint />

      <CanvasZoomControl
        onOrganize={handleOrganizeCanvas}
        placement={controlsPlacement}
      />

      {!taskPanelOpen && (
        <CanvasQuickActionBar
          placement={controlsPlacement}
          skillItems={skillRegistry}
          onAddNode={handleQuickAddNode}
          onAddSkill={handleQuickAddSkill}
          onUseAsset={handleUseHistoryAsset}
          onDeleteNode={handleDeleteHistoryNode}
        />
      )}

      {previewConnectionVisual && (
        <svg
          className="pointer-events-none absolute z-40 overflow-visible"
          style={{
            left: previewConnectionVisual.left,
            top: previewConnectionVisual.top,
            width: previewConnectionVisual.width,
            height: previewConnectionVisual.height,
          }}
          width={previewConnectionVisual.width}
          height={previewConnectionVisual.height}
        >
          <path
            className="pointer-events-none"
            d={previewConnectionVisual.d}
            fill="none"
            stroke={previewConnectionVisual.stroke}
            strokeWidth={previewConnectionVisual.strokeWidth}
            strokeLinecap={previewConnectionVisual.strokeLinecap}
          />
        </svg>
      )}

      {showNodeMenu && (
        <NodeSelectionMenu
          position={menuPosition}
          allowedTypes={menuAllowedTypes}
          onSelect={handleNodeSelect}
          skillItems={menuAllowedTypes ? undefined : skillRegistry}
          onSelectSkill={menuAllowedTypes ? undefined : handleSkillSelect}
          onClose={closeNodeMenu}
        />
      )}

      <NodeToolDialog />

      <ImageViewerModal
        open={imageViewer.isOpen}
        imageUrl={imageViewer.currentImageUrl || ''}
        imageList={imageViewer.imageList}
        currentIndex={imageViewer.currentIndex}
        onClose={closeImageViewer}
        onNavigate={navigateImageViewer}
      />

      <VideoViewerModal
        open={videoViewer.isOpen}
        videoUrl={videoViewer.videoUrl}
        title={videoViewer.title}
        onClose={closeVideoViewer}
      />
    </div>
    </CreditDisplayHiddenProvider>
  );
}
