// Copyright (c) 2026 AI anime
import {
  useState,
  useCallback,
  useMemo,
  useRef,
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
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { MousePointerClick, Upload } from 'lucide-react';
import '@xyflow/react/dist/style.css';

import { useShallow } from 'zustand/react/shallow';

import { CreditDisplayHiddenProvider } from '@/components/credits/credit-visual';
import { isCeRuntime } from '@/lib/runtime-config';
import { useCanvasStore } from '@/stores/canvasStore';
import { resolveCanvasSelectionDeletion } from '@/features/canvas/domain/canvasSelectionDeletion';
import { useAppStore } from '@/stores/app-store';
import { getSkillRegistry } from '@/api/skills';
import { translateSkillName } from '@/features/freezone/context/skillI18n';
import { canvasEventBus } from '@/features/canvas/application/canvasServices';
import {
  hydrateAssetDragPayload,
  migratePastedNodeAssets,
  pollExportImageGeneration,
  resumeNodeGeneration,
} from '@/features/canvas/composition';
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '@/features/canvas/domain/canvasNodes';
import {
  spawnAssetNode,
  type CanvasAssetDragPayload,
} from '@/features/canvas/domain/assetDrag';
import { CanvasMinimapBookmarksOverlay } from '@/features/canvas/ui/CanvasMinimapBookmarksOverlay';
import { captureCurrentViewport, jumpToBookmark } from '@/features/canvas/application/bookmarkActions';
import { createCanvasClipboardSnapshot } from '@/features/canvas/application/createCanvasClipboardSnapshot';
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
import { PAN_ACTIVATION_KEY_CODE } from './ui/canvasInteractionTargets';
import {
  createPreviewPath,
  type CanvasConnectionMenuRequest,
  type CanvasConnectionPreviewRequest,
  type CanvasPendingConnectionStart,
} from './ui/canvasConnectionInteraction';
import { useCanvasEdgePan } from './hooks/useCanvasEdgePan';
import { useCanvasExternalDialogs } from './hooks/useCanvasExternalDialogs';
import { useCanvasAsyncNodeTasks } from './hooks/useCanvasAsyncNodeTasks';
import {
  useCanvasAltDragCopyController,
  type CanvasAltDragPositionCommit,
} from './hooks/useCanvasAltDragCopyController';
import {
  useCanvasAutoLayoutController,
  type CanvasAutoLayoutViewportOptions,
} from './hooks/useCanvasAutoLayoutController';
import { useCanvasBeatContextPrefetch } from './hooks/useCanvasBeatContextPrefetch';
import { useCanvasGraphChangeController } from './hooks/useCanvasGraphChangeController';
import { useCanvasGroupFitDragController } from './hooks/useCanvasGroupFitDragController';
import { useCanvasHistoryAssetController } from './hooks/useCanvasHistoryAssetController';
import {
  useCanvasBatchConnectionController,
  type CanvasBatchConnectionMenuRequest,
} from './hooks/useCanvasBatchConnectionController';
import { useCanvasConnectionController } from './hooks/useCanvasConnectionController';
import {
  useCanvasClipboardDuplicationController,
  type CanvasClipboardNodeDimensionCommit,
  type CanvasClipboardNodeSelectionCommit,
} from './hooks/useCanvasClipboardDuplicationController';
import { useCanvasPlusConnectionController } from './hooks/useCanvasPlusConnectionController';
import { useCanvasQuickAddController } from './hooks/useCanvasQuickAddController';
import { useCanvasReactFlowConnectionController } from './hooks/useCanvasReactFlowConnectionController';
import { useCanvasKeyboardShortcuts } from './hooks/useCanvasKeyboardShortcuts';
import { useCanvasLifecycle } from './hooks/useCanvasLifecycle';
import { useCanvasLinkedCaptureDragController } from './hooks/useCanvasLinkedCaptureDragController';
import { useCanvasMarqueeSelection } from './hooks/useCanvasMarqueeSelection';
import { useCanvasMediaPaste } from './hooks/useCanvasMediaPaste';
import { useCanvasMediaDropController } from './hooks/useCanvasMediaDropController';
import { useCanvasMinimapVisibility } from './hooks/useCanvasMinimapVisibility';
import { useCanvasNodeHover } from './hooks/useCanvasNodeHover';
import { useCanvasNodeClickController } from './hooks/useCanvasNodeClickController';
import { useCanvasNodeClipboard } from './hooks/useCanvasNodeClipboard';
import { useCanvasNodeMenuShortcut } from './hooks/useCanvasNodeMenuShortcut';
import { useCanvasNodeMenuSelectionController } from './hooks/useCanvasNodeMenuSelectionController';
import {
  useCanvasNodePlacementController,
  type CanvasNodePlacement,
} from './hooks/useCanvasNodePlacementController';
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

function reportCanvasClipboardMigrationError(error: unknown): void {
  console.warn('[canvas] cross-project asset migration failed', error);
}

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

const CANVAS_SNAP_ALIGNMENT_PORT: CanvasSnapAlignmentPort = {
  isEnabled: () => useSnapAlignStore.getState().enabled,
  setGuides: (guides) => useSnapAlignStore.getState().setGuides(guides),
  clearGuides: () => useSnapAlignStore.getState().clearGuides(),
};

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
  const fitGroupToChildren = useCanvasStore((state) => state.fitGroupToChildren);
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

  const getCanvasGraph = useCallback(() => {
    const { nodes: currentNodes, edges: currentEdges } = useCanvasStore.getState();
    return { nodes: currentNodes, edges: currentEdges };
  }, []);
  const {
    connectGraphNodes,
    connectManualGraphNodes: handleConnect,
    bindSingleBeatContextInput,
    connectSpawnedNode,
    isValidGraphConnection: isValidConnection,
  } = useCanvasConnectionController({
    getGraph: getCanvasGraph,
    connectRegular: connectNodes,
    replaceEdges,
    skillById,
  });
  const screenToFlowPosition = useCallback(
    (clientPosition: { x: number; y: number }) =>
      reactFlowInstance.screenToFlowPosition(clientPosition),
    [reactFlowInstance],
  );
  const resolveNodePlacementLabel = useCallback(
    (placement: CanvasNodePlacement): string => {
      const definition = nodeCatalog.getDefinition(placement.type);
      return placement.skill
        ? translateSkillName(placement.skill, t)
        : definition
          ? t(definition.menuLabelKey)
          : placement.type;
    },
    [t],
  );
  const suppressPaneClickAfterPlacement = useCallback(() => {
    suppressNextPaneClickRef.current = true;
  }, []);
  const {
    placementActive,
    placementPreview: nodePlacementPreview,
    beginNodePlacement,
    updateNodePlacementClientPosition,
    cancelNodePlacement,
    commitNodePlacementAtClientPosition,
  } = useCanvasNodePlacementController({
    wrapperRef,
    screenToFlowPosition,
    createNode: addNode,
    selectNode: setSelectedNode,
    bindSkill: bindSingleBeatContextInput,
    confirmPlacement: triggerPlacementConfirm,
    suppressNextPaneClick: suppressPaneClickAfterPlacement,
    resolvePlacementLabel: resolveNodePlacementLabel,
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
    disabled: placementActive,
    nodes,
    coordinatePort: reactFlowInstance,
    applyNodeSelectionChanges: applyNodesChange,
    setNativeSelectionActive,
    setSelectedNodeId: setSelectedNode,
    onMarqueeStart: handleMarqueeStart,
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
    cancelNodePlacement();
    setSelectedNode(null);
    setShowNodeMenu(true);
  }, [cancelNodePlacement, reactFlowInstance, setSelectedNode]);
  const {
    handleCanvasPointerMove,
    getLastCanvasPointerPosition,
    getPreferredCanvasPointerPosition,
  } = useCanvasNodeMenuShortcut({
    wrapperRef,
    placementActive,
    setPlacementClientPosition: updateNodePlacementClientPosition,
    openNodeMenu: openNodeMenuAtClientPosition,
  });

  const closeNodeMenu = useCallback(() => {
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
    setPendingConnectStart(null);
    setPendingBatchConnectIds(null);
    setPreviewConnectionVisual(null);
  }, []);
  const hideNodeMenuForPlacement = useCallback(() => {
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
  }, []);
  const releasePaneClickSuppression = useCallback(() => {
    suppressNextPaneClickRef.current = false;
  }, []);

  const { handleNodeClick } = useCanvasNodeClickController({
    placementActive,
    commitPlacement: commitNodePlacementAtClientPosition,
    centerViewport: nodeFocusViewportPort.centerAt,
  });

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

  const fitAutoLayoutViewport = useCallback(
    (options: CanvasAutoLayoutViewportOptions) => {
      void reactFlowInstance.fitView(options);
    },
    [reactFlowInstance],
  );
  const { organizeCanvas: handleOrganizeCanvas } =
    useCanvasAutoLayoutController({
      nodes,
      edges,
      setNodePositions,
      fitViewport: fitAutoLayoutViewport,
    });

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
    if (placementActive) {
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
    placementActive,
    setSelectedNode,
  ]);

  const hydrateDroppedAsset = useCallback(
    (payload: CanvasAssetDragPayload) => hydrateAssetDragPayload(payload),
    [],
  );
  const spawnDroppedAsset = useCallback(
    (payload: CanvasAssetDragPayload, position: { x: number; y: number }) =>
      spawnAssetNode(useCanvasStore.getState(), payload, position),
    [],
  );
  const createDroppedUploadNode = useCallback(
    (position: { x: number; y: number }) =>
      addNode(
        CANVAS_NODE_TYPES.upload,
        position,
        { user_spawned: true } as Partial<CanvasNodeData>,
      ),
    [addNode],
  );
  const attachDroppedExternalFile = useCallback(
    (nodeId: string, file: File) => {
      canvasEventBus.publish('upload-node/external-file', { nodeId, file });
    },
    [],
  );
  const {
    isCanvasDropActive,
    handleCanvasDragEnter,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    handleCanvasDrop,
  } = useCanvasMediaDropController({
    screenToFlowPosition,
    hydrateAsset: hydrateDroppedAsset,
    spawnAsset: spawnDroppedAsset,
    createUploadNode: createDroppedUploadNode,
    selectNode: setSelectedNode,
    attachExternalFile: attachDroppedExternalFile,
  });

  const {
    selectNodeType: handleNodeSelect,
    selectSkill: handleSkillSelect,
  } = useCanvasNodeMenuSelectionController({
    wrapperRef,
    nodes,
    flowPosition,
    menuPosition,
    menuAllowedTypes,
    pendingConnection: pendingConnectStart,
    pendingBatchSourceIds: pendingBatchConnectIds,
    getLastCanvasPointerPosition,
    createNode: addNode,
    beginNodePlacement,
    connectSpawnedNode,
    selectNode: setSelectedNode,
    hideMenuForPlacement: hideNodeMenuForPlacement,
    closeNodeMenu,
    releasePaneClickSuppression,
  });

  const {
    getViewportCenter: getQuickAddViewportCenter,
    quickAddNode: handleQuickAddNode,
    quickAddSkill: handleQuickAddSkill,
  } = useCanvasQuickAddController({
    wrapperRef,
    screenToFlowPosition,
    createNode: addNode,
    selectNode: setSelectedNode,
    bindSkill: bindSingleBeatContextInput,
  });

  const {
    useHistoryAsset: handleUseHistoryAsset,
    deleteHistoryNode: handleDeleteHistoryNode,
  } = useCanvasHistoryAssetController({
    getViewportCenter: getQuickAddViewportCenter,
    spawnAsset: spawnDroppedAsset,
    selectNode: setSelectedNode,
    deleteNode,
  });

  const commitClipboardNodeDimensions = useCallback(
    (updates: CanvasClipboardNodeDimensionCommit[]) => {
      applyNodesChange(updates.map((update) => ({
        id: update.nodeId,
        type: 'dimensions' as const,
        dimensions: { width: update.width, height: update.height },
        resizing: false,
        setAttributes: true,
      })));
    },
    [applyNodesChange],
  );
  const commitClipboardNodeSelection = useCallback(
    (updates: CanvasClipboardNodeSelectionCommit[]) => {
      applyNodesChange(updates.map((update) => ({
        id: update.nodeId,
        type: 'select' as const,
        selected: update.selected,
      })));
    },
    [applyNodesChange],
  );
  const notifyClipboardMigrationSuccess = useCallback(
    (count: number) => {
      toast.success(t('canvas.crossProjectAssets.success', { count }));
    },
    [t],
  );
  const notifyClipboardMigrationPartialFailure = useCallback(
    (count: number) => {
      toast.error(t('canvas.crossProjectAssets.partialFailure', { count }));
    },
    [t],
  );
  const {
    duplicateNodes,
    pasteFromClipboard,
    resetPasteIteration,
  } = useCanvasClipboardDuplicationController({
    getGraph: getCanvasGraph,
    createNode: addNode,
    commitNodeDimensions: commitClipboardNodeDimensions,
    connectNodes,
    commitNodeSelection: commitClipboardNodeSelection,
    selectNode: setSelectedNode,
    currentProject: canvasProject ?? null,
    migrateAssets: migratePastedNodeAssets,
    updateNodeData,
    notifyMigrationSuccess: notifyClipboardMigrationSuccess,
    notifyMigrationPartialFailure: notifyClipboardMigrationPartialFailure,
    reportMigrationError: reportCanvasClipboardMigrationError,
  });

  const elevateAltDragCopyNodes = useCallback(
    (nodeIds: string[], zIndex: number) => {
      const nodeIdSet = new Set(nodeIds);
      useCanvasStore.setState((state) => ({
        nodes: state.nodes.map((node) =>
          nodeIdSet.has(node.id)
            ? {
                ...node,
                zIndex,
                style: { ...(node.style ?? {}), zIndex },
              }
            : node,
        ),
      }));
    },
    [],
  );
  const commitDragNodePositions = useCallback(
    (updates: CanvasAltDragPositionCommit[]) => {
      applyNodesChange(updates.map((update) => ({
        id: update.nodeId,
        type: 'position' as const,
        position: update.position,
        dragging: update.dragging,
      })));
    },
    [applyNodesChange],
  );
  const {
    beginCopyDrag: beginAltDragCopy,
    updateCopyDrag: updateAltDragCopy,
    finishCopyDrag: finishAltDragCopy,
    isCopyDragActive,
  } = useCanvasAltDragCopyController({
    nodes,
    selectedNodeIds,
    duplicateNodes,
    elevateNodes: elevateAltDragCopyNodes,
    commitNodePositions: commitDragNodePositions,
    selectNode: setSelectedNode,
  });
  const {
    beginNodeDrag: beginGroupFitNodeDrag,
    beginSelectionDrag: beginGroupFitSelectionDrag,
    finishDrag: finishGroupFitDrag,
  } = useCanvasGroupFitDragController({
    getGraph: getCanvasGraph,
    fitGroupToChildren,
  });
  const {
    beginLinkedDrag: beginLinkedCaptureDrag,
    updateLinkedDrag: updateLinkedCaptureDrag,
    finishLinkedDrag: finishLinkedCaptureDrag,
  } = useCanvasLinkedCaptureDragController({
    getGraph: getCanvasGraph,
    commitNodePositions: commitDragNodePositions,
  });
  const {
    handleNodesChange,
    handleEdgesChange,
    handleEdgeDoubleClick,
  } = useCanvasGraphChangeController({
    getGraph: getCanvasGraph,
    isCopyDragActive,
    alignNodeChanges,
    applyNodeChanges: applyNodesChange,
    applyEdgeChanges: applyEdgesChange,
    deleteEdge,
  });

  const createClipboardSnapshot = useCallback(
    () => createCanvasClipboardSnapshot({
      nodes,
      edges,
      selectedNodeIds,
      sourceProject: canvasProject,
    }),
    [canvasProject, edges, nodes, selectedNodeIds],
  );
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
    disabled: placementActive,
    getCapabilities: getContextMenuCapabilities,
  });
  useCanvasKeyboardShortcuts({
    placementActive,
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
      beginGroupFitNodeDrag(
        event.altKey,
        node.id,
        draggedNodes?.map((draggedNode) => draggedNode.id) ?? [],
      );
      beginLinkedCaptureDrag(
        event.altKey,
        node.id,
        draggedNodes?.length ?? 0,
      );
      beginAltDragCopy(event.altKey, node.id);
    },
    [beginAltDragCopy, beginGroupFitNodeDrag, beginLinkedCaptureDrag]
  );

  const handleNodeDrag = useCallback(
    (_event: ReactMouseEvent, node: CanvasNode) => {
      updateLinkedCaptureDrag(node.position);
      updateAltDragCopy(node.id, node.position);
    },
    [updateAltDragCopy, updateLinkedCaptureDrag]
  );

  const handleNodeDragStop = useCallback(
    (_event: ReactMouseEvent, node: CanvasNode) => {
      clearSnapAlignment();
      finishLinkedCaptureDrag();
      finishGroupFitDrag();
      finishAltDragCopy(node.id, node.position);
    },
    [
      clearSnapAlignment,
      finishAltDragCopy,
      finishGroupFitDrag,
      finishLinkedCaptureDrag,
    ]
  );

  const handleSelectionDragStart = useCallback(
    (_event: ReactMouseEvent, draggedNodes: CanvasNode[]) => {
      beginGroupFitSelectionDrag(draggedNodes.map((node) => node.id));
    },
    [beginGroupFitSelectionDrag]
  );
  const handleSelectionDragStop = finishGroupFitDrag;

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
            width: nodePlacementPreview.width,
            height: nodePlacementPreview.height,
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
