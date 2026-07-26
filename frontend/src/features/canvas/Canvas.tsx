// Copyright (c) 2026 AI anime
import {
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import { useCanvasStore } from '@/stores/canvasStore';
import { useAppStore } from '@/stores/app-store';
import { canvasEventBus } from '@/features/canvas/application/canvasServices';
import { useEdgeVisibilityStore } from './ui/edgeVisibilityStore';
import { CanvasStageView } from './ui/CanvasStageView';
import {
  projectCanvasEdgesForRender,
  projectCanvasNodesForRender,
} from './ui/canvasRenderProjection';
import { useCanvasExternalDialogs } from './hooks/useCanvasExternalDialogs';
import { useCanvasGenerationRecoveryController } from './hooks/useCanvasGenerationRecoveryController';
import { useCanvasGraphInteractionController } from './hooks/useCanvasGraphInteractionController';
import { useCanvasHistoryAssetController } from './hooks/useCanvasHistoryAssetController';
import { useCanvasConnectionController } from './hooks/useCanvasConnectionController';
import { useCanvasClipboardController } from './hooks/useCanvasClipboardController';
import { useCanvasConnectionGestureController } from './hooks/useCanvasConnectionGestureController';
import { useCanvasMarqueeSelection } from './hooks/useCanvasMarqueeSelection';
import { useCanvasMediaTransferController } from './hooks/useCanvasMediaTransferController';
import { useCanvasNodeHover } from './hooks/useCanvasNodeHover';
import { useCanvasNodeInteractionController } from './hooks/useCanvasNodeInteractionController';
import { useCanvasNodeMenuStateController } from './hooks/useCanvasNodeMenuStateController';
import { useCanvasNodeCatalogController } from './hooks/useCanvasNodeCatalogController';
import { useCanvasNodePlacementConfirm } from './hooks/useCanvasNodePlacementConfirm';
import { useCanvasCommandSurfaceController } from './hooks/useCanvasCommandSurfaceController';
import { useCanvasProjectContextController } from './hooks/useCanvasProjectContextController';
import { useCanvasSelectionSync } from './hooks/useCanvasSelectionSync';
import { useCanvasSelectionCommandController } from './hooks/useCanvasSelectionCommandController';
import { useCanvasViewportSurfaceController } from './hooks/useCanvasViewportSurfaceController';

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
  const wrapperRef = useRef<HTMLDivElement>(null);

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
    resolvePlacementLabel: resolveNodePlacementLabel,
  } = useCanvasNodeCatalogController({ translate: t });

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  // 连线可见性：隐藏时只给 ReactFlow 的边打 `hidden`，真实 edges 一动不动（见
  // edgeVisibilityStore）。持久化/自动布局/导出全部照用 store 里的真实连线。
  const edgesHidden = useEdgeVisibilityStore((state) => state.hidden);

  const { projectId: canvasProject } = useCanvasProjectContextController({
    nodes,
  });
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
  const {
    pinned: minimapPinned,
    visible: minimapVisible,
    setHovered: setMinimapHover,
    togglePinned: toggleMinimapPinned,
    trackpadPanEnabled,
    initialViewport,
    handleMove,
    handleMoveEnd,
    handleEdgeClick,
    alignNodeChanges,
    clearSnapAlignment,
    centerNodeViewport,
    organizeCanvas: handleOrganizeCanvas,
  } = useCanvasViewportSurfaceController({
    wrapperRef,
    viewportPort: reactFlowInstance,
    transformStore: reactFlowStore,
    commitViewport: setViewportState,
    setViewportSize: setCanvasViewportSize,
    nodes,
    edges,
    pendingNodeId: pendingFocusNodeId,
    clearPendingFocus,
    setNodePositions,
    isCanvasEmpty,
    closeImageViewer,
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
  const {
    placementActive,
    placementPreview: nodePlacementPreview,
    cancelNodePlacement,
    openNodeMenuAtClientPosition,
    handlePaneClick,
    suppressNextPaneClick,
    handleCanvasPointerMove,
    getPreferredCanvasPointerPosition,
    handleNodeClick,
    selectNodeType: handleNodeSelect,
    selectSkill: handleSkillSelect,
    getViewportCenter: getQuickAddViewportCenter,
    quickAddNode: handleQuickAddNode,
    quickAddSkill: handleQuickAddSkill,
  } = useCanvasNodeInteractionController({
    wrapperRef,
    nodes,
    screenToFlowPosition,
    createNode: addNode,
    selectNode: setSelectedNode,
    bindSkill: bindSingleBeatContextInput,
    confirmPlacement: triggerPlacementConfirm,
    resolvePlacementLabel: resolveNodePlacementLabel,
    openPlainNodeMenu,
    dismissNodeMenu: dismissNodeMenuForPaneClick,
    onBlankPaneClick,
    centerViewport: centerNodeViewport,
    flowPosition,
    menuPosition,
    menuAllowedTypes,
    pendingConnection: pendingConnectStart,
    pendingBatchSourceIds: pendingBatchConnectIds,
    connectSpawnedNode,
    hideMenuForPlacement: hideNodeMenuForPlacement,
    closeNodeMenu,
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

  const {
    isPlusConnectDragging,
    handlePlusOpenMenu,
    handlePlusConnectDragStart,
    handlePlusConnectDragMove,
    handlePlusConnectDragEnd,
    handleConnectStart,
    handleConnectEnd,
    handleBatchConnectOpenMenu,
    handleBatchConnectDragStart,
    handleBatchConnectDragMove,
    handleBatchConnectDragEnd,
  } = useCanvasConnectionGestureController({
    wrapperRef,
    nodes,
    screenToFlowPosition,
    clearHoveredNodeTimer,
    setHoveredNodeId,
    pendingConnection: pendingConnectStart,
    prepareConnectionStart,
    prepareBatchConnectionDrag,
    clearConnection,
    updateConnectionPreview,
    openConnectionMenuState,
    openBatchConnectionMenuState,
    suppressNextPaneClick,
    connectNodes: connectGraphNodes,
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

  const {
    handleNodesChange,
    handleEdgesChange,
    handleEdgeDoubleClick,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
    handleSelectionDragStart,
    handleSelectionDragStop,
  } = useCanvasGraphInteractionController({
    nodes,
    selectedNodeIds,
    duplicateNodes,
    elevateNodes,
    selectNode: setSelectedNode,
    getGraph: getCanvasGraph,
    fitGroupToChildren,
    alignNodeChanges,
    applyNodeChanges: applyNodesChange,
    applyEdgeChanges: applyEdgesChange,
    deleteEdge,
    clearSnapAlignment,
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

  return (
    <CanvasStageView
      wrapperProps={{
        ref: wrapperRef,
        onDragEnter: handleCanvasDragEnter,
        onDragOver: handleCanvasDragOver,
        onDragLeave: handleCanvasDragLeave,
        onDrop: handleCanvasDrop,
        onPointerMove: handleCanvasPointerMove,
      }}
      flowProps={{
        nodes: renderedNodes,
        edges: renderedEdges,
        onNodesChange: handleNodesChange,
        onEdgesChange: handleEdgesChange,
        onEdgeClick: handleEdgeClick,
        onEdgeDoubleClick: handleEdgeDoubleClick,
        onConnect: handleConnect,
        onConnectStart: handleConnectStart,
        onConnectEnd: handleConnectEnd,
        isValidConnection,
        onNodeMouseEnter: handleNodeMouseEnter,
        onNodeMouseLeave: handleNodeMouseLeave,
        onNodeClick: handleNodeClick,
        onNodeDragStart: handleNodeDragStart,
        onNodeDrag: handleNodeDrag,
        onNodeDragStop: handleNodeDragStop,
        onSelectionDragStart: handleSelectionDragStart,
        onSelectionDragStop: handleSelectionDragStop,
        onPaneClick: handlePaneClick,
        onMove: handleMove,
        onMoveEnd: handleMoveEnd,
        defaultViewport: initialViewport,
        panOnScroll: trackpadPanEnabled,
        zoomOnScroll: !trackpadPanEnabled,
      }}
      controlsPlacement={controlsPlacement}
      minimapProps={{
        visible: minimapVisible,
        pinned: minimapPinned,
        onTogglePin: toggleMinimapPinned,
        onHoverChange: setMinimapHover,
      }}
      transientOverlayProps={{
        isCanvasEmpty: nodes.length === 0,
        marqueeSelectionRect,
        nodePlacementPreview,
        isCanvasDropActive,
      }}
      contextMenuProps={
        contextMenu
          ? {
              position: { x: contextMenu.x, y: contextMenu.y },
              onClose: closeContextMenu,
              sections: contextMenuSections,
            }
          : null
      }
      multiSelectionConnectProps={{
        onBatchOpenMenu: handleBatchConnectOpenMenu,
        onBatchDragStart: handleBatchConnectDragStart,
        onBatchDragMove: handleBatchConnectDragMove,
        onBatchDragEnd: handleBatchConnectDragEnd,
      }}
      nodeSpawnPlusProps={{
        hoveredNodeId,
        hidden: isPlusConnectDragging,
        onOverlayHoverStart: clearHoveredNodeTimer,
        onOverlayHoverEnd: scheduleHoveredNodeClear,
        onPlusOpenMenu: handlePlusOpenMenu,
        onPlusDragStart: handlePlusConnectDragStart,
        onPlusDragMove: handlePlusConnectDragMove,
        onPlusDragEnd: handlePlusConnectDragEnd,
      }}
      zoomControlProps={{ onOrganize: handleOrganizeCanvas }}
      quickActionBarProps={
        taskPanelOpen
          ? null
          : {
              skillItems: skillRegistry,
              onAddNode: handleQuickAddNode,
              onAddSkill: handleQuickAddSkill,
              onUseAsset: handleUseHistoryAsset,
              onDeleteNode: handleDeleteHistoryNode,
            }
      }
      connectionPreviewProps={{ preview: previewConnectionVisual }}
      nodeSelectionMenuProps={
        showNodeMenu
          ? {
              position: menuPosition,
              allowedTypes: menuAllowedTypes,
              onSelect: handleNodeSelect,
              skillItems: menuAllowedTypes ? undefined : skillRegistry,
              onSelectSkill: menuAllowedTypes ? undefined : handleSkillSelect,
              onClose: closeNodeMenu,
            }
          : null
      }
      imageViewerProps={{
        open: imageViewer.isOpen,
        imageUrl: imageViewer.currentImageUrl || '',
        imageList: imageViewer.imageList,
        currentIndex: imageViewer.currentIndex,
        onClose: closeImageViewer,
        onNavigate: navigateImageViewer,
      }}
      videoViewerProps={{
        open: videoViewer.isOpen,
        videoUrl: videoViewer.videoUrl,
        title: videoViewer.title,
        onClose: closeVideoViewer,
      }}
    />
  );
}
