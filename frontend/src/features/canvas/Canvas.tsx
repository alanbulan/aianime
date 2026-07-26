// Copyright (c) 2026 AI anime
import {
  useCallback,
  useMemo,
  useRef,
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
import '@xyflow/react/dist/style.css';

import { CreditDisplayHiddenProvider } from '@/components/credits/credit-visual';
import { isCeRuntime } from '@/lib/runtime-config';
import { useCanvasStore } from '@/stores/canvasStore';
import { useAppStore } from '@/stores/app-store';
import { getSkillRegistry } from '@/api/skills';
import { translateSkillName } from '@/features/freezone/context/skillI18n';
import { canvasEventBus } from '@/features/canvas/application/canvasServices';
import { CanvasMinimapBookmarksOverlay } from '@/features/canvas/ui/CanvasMinimapBookmarksOverlay';
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
import {
  CanvasConnectionPreviewOverlay,
  CanvasTransientOverlays,
} from './ui/CanvasTransientOverlays';
import {
  projectCanvasEdgesForRender,
  projectCanvasNodesForRender,
} from './ui/canvasRenderProjection';
import { CanvasSnapAlignButton } from './snap-align/CanvasSnapAlignButton';
import { useTrackpadPanStore } from './trackpad-pan/trackpadPanStore';
import { SnapAlignGuides } from './snap-align/SnapAlignGuides';
import { useSnapAlignStore } from './snap-align/snapAlignStore';
import { PAN_ACTIVATION_KEY_CODE } from './ui/canvasInteractionTargets';
import {
  type CanvasConnectionMenuRequest,
} from './ui/canvasConnectionInteraction';
import { useCanvasExternalDialogs } from './hooks/useCanvasExternalDialogs';
import { useCanvasGenerationRecoveryController } from './hooks/useCanvasGenerationRecoveryController';
import {
  useCanvasAltDragCopyController,
  type CanvasAltDragPositionCommit,
} from './hooks/useCanvasAltDragCopyController';
import {
  useCanvasAutoLayoutController,
  type CanvasAutoLayoutViewportOptions,
} from './hooks/useCanvasAutoLayoutController';
import { useCanvasGraphChangeController } from './hooks/useCanvasGraphChangeController';
import { useCanvasDragLifecycleController } from './hooks/useCanvasDragLifecycleController';
import { useCanvasGroupFitDragController } from './hooks/useCanvasGroupFitDragController';
import { useCanvasHistoryAssetController } from './hooks/useCanvasHistoryAssetController';
import {
  useCanvasBatchConnectionController,
  type CanvasBatchConnectionMenuRequest,
} from './hooks/useCanvasBatchConnectionController';
import { useCanvasConnectionController } from './hooks/useCanvasConnectionController';
import { useCanvasClipboardController } from './hooks/useCanvasClipboardController';
import { useCanvasPlusConnectionController } from './hooks/useCanvasPlusConnectionController';
import { useCanvasQuickAddController } from './hooks/useCanvasQuickAddController';
import { useCanvasReactFlowConnectionController } from './hooks/useCanvasReactFlowConnectionController';
import { useCanvasLifecycle } from './hooks/useCanvasLifecycle';
import { useCanvasLinkedCaptureDragController } from './hooks/useCanvasLinkedCaptureDragController';
import { useCanvasMarqueeSelection } from './hooks/useCanvasMarqueeSelection';
import { useCanvasMediaTransferController } from './hooks/useCanvasMediaTransferController';
import { useCanvasMinimapVisibility } from './hooks/useCanvasMinimapVisibility';
import { useCanvasNodeHover } from './hooks/useCanvasNodeHover';
import { useCanvasNodeClickController } from './hooks/useCanvasNodeClickController';
import { useCanvasNodeFocusController } from './hooks/useCanvasNodeFocusController';
import { useCanvasNodeMenuShortcut } from './hooks/useCanvasNodeMenuShortcut';
import { useCanvasNodeMenuSelectionController } from './hooks/useCanvasNodeMenuSelectionController';
import { useCanvasNodeMenuStateController } from './hooks/useCanvasNodeMenuStateController';
import {
  useCanvasNodePlacementController,
  type CanvasNodePlacement,
} from './hooks/useCanvasNodePlacementController';
import { useCanvasNodePlacementConfirm } from './hooks/useCanvasNodePlacementConfirm';
import { useCanvasCommandSurfaceController } from './hooks/useCanvasCommandSurfaceController';
import { useCanvasPaneClickController } from './hooks/useCanvasPaneClickController';
import { useCanvasProjectContextController } from './hooks/useCanvasProjectContextController';
import { useCanvasSelectionSync } from './hooks/useCanvasSelectionSync';
import { useCanvasSelectionCommandController } from './hooks/useCanvasSelectionCommandController';
import { useCanvasSkillRegistry } from './hooks/useCanvasSkillRegistry';
import {
  useCanvasSnapAlignment,
  type CanvasSnapAlignmentPort,
} from './hooks/useCanvasSnapAlignment';
import { useCanvasViewportRuntimeController } from './hooks/useCanvasViewportRuntimeController';

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

  const {
    showNodeMenu,
    menuPosition,
    flowPosition,
    menuAllowedTypes,
    pendingConnectStart,
    pendingBatchConnectIds,
    previewConnectionVisual,
    handleMarqueeStart,
    prepareBatchConnectionDrag,
    dismissNodeMenuForPaneClick,
    updateConnectionPreview,
    prepareConnectionStart,
    clearConnection,
    openConnectionMenu: openConnectionMenuState,
    openBatchConnectionMenu: openBatchConnectionMenuState,
    openPlainNodeMenu,
    closeNodeMenu,
    hideNodeMenuForPlacement,
  } = useCanvasNodeMenuStateController();
  const {
    skills: skillRegistry,
    skillById,
  } = useCanvasSkillRegistry(getSkillRegistry);

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  // 连线可见性：隐藏时只给 ReactFlow 的边打 `hidden`，真实 edges 一动不动（见
  // edgeVisibilityStore）。持久化/自动布局/导出全部照用 store 里的真实连线。
  const edgesHidden = useEdgeVisibilityStore((state) => state.hidden);

  const { projectId: canvasProject } = useCanvasProjectContextController({
    nodes,
  });
  // 触控板平移开关：开启后用 ReactFlow 的 panOnScroll（两指滑动平移、捏合缩放），
  // 关闭则回到默认的滚轮缩放。
  const trackpadPanEnabled = useTrackpadPanStore((state) => state.enabled);
  // 底部任务中心面板展开时，让出底部空间——隐藏画布快捷操作栏，避免与面板重叠。
  const taskPanelOpen = useAppStore((state) => state.taskPanelOpen);
  useCanvasGenerationRecoveryController({
    projectId: canvasProject,
    errorTitle: t('common.error'),
  });
  const applyNodesChange = useCanvasStore((state) => state.onNodesChange);
  const applyEdgesChange = useCanvasStore((state) => state.onEdgesChange);
  const connectNodes = useCanvasStore((state) => state.onConnect);
  const replaceEdges = useCanvasStore((state) => state.replaceEdges);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
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
  const elevateNodes = useCanvasStore((state) => state.elevateNodes);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const openToolDialog = useCanvasStore((state) => state.openToolDialog);
  const closeToolDialog = useCanvasStore((state) => state.closeToolDialog);
  const setViewportState = useCanvasStore((state) => state.setViewportState);
  const setCanvasViewportSize = useCanvasStore((state) => state.setCanvasViewportSize);
  const {
    initialViewport,
    handleMove,
    handleMoveEnd,
    handleEdgeClick,
  } = useCanvasViewportRuntimeController({
    wrapperRef,
    viewportPort: reactFlowInstance,
    transformStore: reactFlowStore,
    commitViewport: setViewportState,
    setViewportSize: setCanvasViewportSize,
  });
  const imageViewer = useCanvasStore((state) => state.imageViewer);
  const closeImageViewer = useCanvasStore((state) => state.closeImageViewer);
  const navigateImageViewer = useCanvasStore((state) => state.navigateImageViewer);
  const { videoViewer, closeVideoViewer } = useCanvasExternalDialogs({
    eventPort: canvasEventBus,
    openToolDialog,
    closeToolDialog,
  });
  const renderedNodes = useMemo(
    () => projectCanvasNodesForRender(nodes, placementConfirmNodeId),
    [nodes, placementConfirmNodeId],
  );
  const renderedEdges = useMemo(
    () => projectCanvasEdgesForRender(edges, edgesHidden),
    [edges, edgesHidden],
  );

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

  const { centerViewport: centerNodeViewport } = useCanvasNodeFocusController({
    pendingNodeId: pendingFocusNodeId,
    nodes,
    runtimePort: reactFlowInstance,
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
    resolvePlacementLabel: resolveNodePlacementLabel,
  });
  const openNodeMenuAtClientPosition = useCallback(
    (clientPosition: { x: number; y: number }) => {
      const containerRect = wrapperRef.current?.getBoundingClientRect();
      const flowPos = screenToFlowPosition(clientPosition);
      openPlainNodeMenu({
        flowPosition: flowPos,
        menuPosition: {
          x: clientPosition.x - (containerRect?.left ?? 0),
          y: clientPosition.y - (containerRect?.top ?? 0),
        },
      });
      cancelNodePlacement();
      setSelectedNode(null);
    },
    [
      cancelNodePlacement,
      openPlainNodeMenu,
      screenToFlowPosition,
      setSelectedNode,
    ],
  );
  const {
    handlePaneClick,
    suppressNextPaneClick,
    releasePaneClickSuppression,
  } = useCanvasPaneClickController({
    placementActive,
    commitPlacement: commitNodePlacementAtClientPosition,
    openNodeMenu: openNodeMenuAtClientPosition,
    setSelectedNodeId: setSelectedNode,
    dismissNodeMenu: dismissNodeMenuForPaneClick,
    onBlankPaneClick,
  });
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

  const openConnectionMenu = useCallback(
    (request: CanvasConnectionMenuRequest) => {
      openConnectionMenuState(
        request,
        screenToFlowPosition(request.clientPosition),
      );
      suppressNextPaneClick();
    },
    [openConnectionMenuState, screenToFlowPosition, suppressNextPaneClick],
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
  const openBatchConnectionMenu = useCallback(
    (request: CanvasBatchConnectionMenuRequest) => {
      openBatchConnectionMenuState(request);
      suppressNextPaneClick();
    },
    [openBatchConnectionMenuState, suppressNextPaneClick],
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

  const { handleNodeClick } = useCanvasNodeClickController({
    placementActive,
    commitPlacement: commitNodePlacementAtClientPosition,
    suppressNextPaneClick,
    centerViewport: centerNodeViewport,
  });

  const {
    selectedNodeIds,
    selectedUploadNodeId,
  } = useCanvasSelectionSync({
    nodes,
    selectedNodeId,
    setSelectedNodeId: setSelectedNode,
  });

  const {
    queueSnapshotPaste,
    spawnAsset: spawnTransferredAsset,
    isCanvasDropActive,
    handleCanvasDragEnter,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    handleCanvasDrop,
  } = useCanvasMediaTransferController({
    selectedUploadNodeId,
    getPreferredClientPosition: getPreferredCanvasPointerPosition,
    screenToFlowPosition,
    createNode: addNode,
    selectNode: setSelectedNode,
    eventBus: canvasEventBus,
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

  const getCurrentSelectionEdges = useCallback(
    () => getCanvasGraph().edges,
    [getCanvasGraph],
  );
  const {
    groupSelection: groupSelectedNodes,
    deleteSelection: deleteSelectedElements,
  } = useCanvasSelectionCommandController({
    nodes,
    selectedNodeIds,
    selectedNodeId,
    getCurrentEdges: getCurrentSelectionEdges,
    groupNodes,
    deleteEdge,
    deleteNode,
    deleteNodes,
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
    spawnAsset: spawnTransferredAsset,
    selectNode: setSelectedNode,
    deleteNode,
  });

  const {
    duplicateNodes,
    hasCopiedNodes,
    copySelection,
    pasteSelection,
    pasteAt,
  } = useCanvasClipboardController({
    nodes,
    edges,
    selectedNodeIds,
    currentProject: canvasProject,
    getGraph: getCanvasGraph,
    createNode: addNode,
    applyNodeChanges: applyNodesChange,
    connectNodes,
    selectNode: setSelectedNode,
    updateNodeData,
    queueSnapshotPaste,
  });

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
    elevateNodes,
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

  const {
    contextMenu,
    sections: contextMenuSections,
    closeContextMenu,
  } = useCanvasCommandSurfaceController({
    wrapperRef,
    placementActive,
    nodeMenuOpen: showNodeMenu,
    selectedNodeCount: selectedNodeIds.length,
    hasCopiedNodes,
    screenToFlowPosition,
    createNode: addNode,
    openNodeMenu: openNodeMenuAtClientPosition,
    cancelPlacement: cancelNodePlacement,
    closeNodeMenu,
    organizeCanvas: handleOrganizeCanvas,
    copySelection,
    pasteSelection,
    undo,
    redo,
    groupSelection: groupSelectedNodes,
    deleteSelection: deleteSelectedElements,
    pasteAt,
  });

  const {
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
    handleSelectionDragStart,
    handleSelectionDragStop,
  } = useCanvasDragLifecycleController({
    beginGroupFitNodeDrag,
    beginGroupFitSelectionDrag,
    finishGroupFitDrag,
    beginLinkedCaptureDrag,
    updateLinkedCaptureDrag,
    finishLinkedCaptureDrag,
    beginAltDragCopy,
    updateAltDragCopy,
    finishAltDragCopy,
    clearSnapAlignment,
  });

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
        defaultViewport={initialViewport}
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

      <CanvasTransientOverlays
        isCanvasEmpty={nodes.length === 0}
        marqueeSelectionRect={marqueeSelectionRect}
        nodePlacementPreview={nodePlacementPreview}
        isCanvasDropActive={isCanvasDropActive}
      />

      {contextMenu && (
        <CanvasContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          sections={contextMenuSections}
        />
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

      <CanvasConnectionPreviewOverlay preview={previewConnectionVisual} />

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
