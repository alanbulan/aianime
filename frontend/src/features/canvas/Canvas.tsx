// Copyright (c) 2026 AI anime
import {
  useCallback,
  useRef,
} from 'react';
import {
  useReactFlow,
  useStoreApi,
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';
import {
  canvasEventBus,
  canvasNodeIntersectsSelectionRect,
  isPresetManagedEdge,
  isPresetManagedNode,
  useCanvasCommandSurfaceController,
  useCanvasSelectionSurfaceController,
  type CanvasCommandHistoryPort,
} from '@/modules/creative_canvas/public';
import { useAppStore } from '@/stores/app-store';
import { CANVAS_NODE_TYPES, isUploadNode } from './domain/canvasNodes';
import { CanvasStageView } from './ui/CanvasStageView';
import { useCanvasGraphEditingSurfaceController } from './hooks/useCanvasGraphEditingSurfaceController';
import { useCanvasConnectionGestureSurfaceController } from './hooks/useCanvasConnectionGestureSurfaceController';
import { useCanvasMediaSurfaceController } from './hooks/useCanvasMediaSurfaceController';
import { useCanvasNodeCreationSurfaceController } from './hooks/useCanvasNodeCreationSurfaceController';
import { useCanvasProjectSurfaceController } from './hooks/useCanvasProjectSurfaceController';
import { useCanvasRenderSurfaceController } from './hooks/useCanvasRenderSurfaceController';
import { useCanvasViewportSurfaceController } from './hooks/useCanvasViewportSurfaceController';
import { useCanvasViewerSurfaceController } from './composition';

interface CanvasProps {
  projectId: string;
  canvasId: string;
  onBlankPaneClick?: () => void;
  controlsPlacement?: 'bottom-right' | 'top-right';
}

const CANVAS_COMMAND_HISTORY_PORT: CanvasCommandHistoryPort = {
  getCapabilities: () => {
    const history = useCanvasStore.getState().history;
    return {
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    };
  },
};

export function Canvas({
  projectId,
  canvasId,
  onBlankPaneClick,
  controlsPlacement = 'bottom-right',
}: CanvasProps) {
  const { t } = useTranslation();
  const reactFlowInstance = useReactFlow();
  const reactFlowStore = useStoreApi();
  const wrapperRef = useRef<HTMLDivElement>(null);

  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const {
    renderedNodes,
    renderedEdges,
    triggerPlacementConfirm,
  } = useCanvasRenderSurfaceController({ nodes, edges });

  const { projectId: canvasProject } = useCanvasProjectSurfaceController({
    projectId,
    canvasId,
    nodes,
    errorTitle: t('common.error'),
  });
  // 底部任务中心面板展开时，让出底部空间——隐藏画布快捷操作栏，避免与面板重叠。
  const taskPanelOpen = useAppStore((state) => state.taskPanelOpen);
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
  const setViewportState = useCanvasStore((state) => state.setViewportState);
  const setCanvasViewportSize = useCanvasStore((state) => state.setCanvasViewportSize);
  const {
    closeImageViewer,
    imageViewerProps,
    videoViewerProps,
  } = useCanvasViewerSurfaceController();
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
  const screenToFlowPosition = useCallback(
    (clientPosition: { x: number; y: number }) =>
      reactFlowInstance.screenToFlowPosition(clientPosition),
    [reactFlowInstance],
  );
  const {
    skills: skillRegistry,
    showNodeMenu,
    menuPosition,
    menuAllowedTypes,
    pendingConnectStart,
    previewConnectionVisual,
    handleMarqueeStart,
    prepareBatchConnectionDrag,
    updateConnectionPreview,
    prepareConnectionStart,
    clearConnection,
    openConnectionMenu: openConnectionMenuState,
    openBatchConnectionMenu: openBatchConnectionMenuState,
    closeNodeMenu,
    connectGraphNodes,
    connectManualGraphNodes: handleConnect,
    isValidGraphConnection: isValidConnection,
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
  } = useCanvasNodeCreationSurfaceController({
    translate: t,
    wrapperRef,
    nodes,
    screenToFlowPosition,
    createNode: addNode,
    selectNode: setSelectedNode,
    confirmPlacement: triggerPlacementConfirm,
    onBlankPaneClick,
    centerViewport: centerNodeViewport,
    getGraph: getCanvasGraph,
    connectRegular: connectNodes,
    replaceEdges,
  });
  const {
    marqueeSelectionRect,
    selectedNodeIds,
    selectedUploadNodeId,
    groupSelection: groupSelectedNodes,
    deleteSelection: deleteSelectedElements,
  } = useCanvasSelectionSurfaceController({
    wrapperRef,
    disabled: placementActive,
    nodes,
    coordinatePort: reactFlowInstance,
    nodeIntersectsSelectionRect: canvasNodeIntersectsSelectionRect,
    isImmersiveViewerActive,
    applyNodeSelectionChanges: applyNodesChange,
    nativeSelectionStore: reactFlowStore,
    selectedNodeId,
    setSelectedNodeId: setSelectedNode,
    onMarqueeStart: handleMarqueeStart,
    isUploadNode,
    getGraph: getCanvasGraph,
    isNodeDeletionLocked: isPresetManagedNode,
    isEdgeDeletionLocked: isPresetManagedEdge,
    groupNodes,
    deleteEdge,
    deleteNode,
    deleteNodes,
  });

  const {
    hoveredNodeId,
    clearHoveredNodeTimer,
    scheduleHoveredNodeClear,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
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
  } = useCanvasConnectionGestureSurfaceController({
    wrapperRef,
    nodes,
    screenToFlowPosition,
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
    queueSnapshotPaste,
    isCanvasDropActive,
    handleCanvasDragEnter,
    handleCanvasDragOver,
    handleCanvasDragLeave,
    handleCanvasDrop,
    useHistoryAsset: handleUseHistoryAsset,
    deleteHistoryNode: handleDeleteHistoryNode,
  } = useCanvasMediaSurfaceController({
    selectedUploadNodeId,
    getPreferredClientPosition: getPreferredCanvasPointerPosition,
    screenToFlowPosition,
    createNode: addNode,
    selectNode: setSelectedNode,
    eventBus: canvasEventBus,
    getViewportCenter: getQuickAddViewportCenter,
    deleteNode,
  });

  const {
    hasCopiedNodes,
    copySelection,
    pasteSelection,
    pasteAt,
    handleNodesChange,
    handleEdgesChange,
    handleEdgeDoubleClick,
    handleNodeDragStart,
    handleNodeDrag,
    handleNodeDragStop,
    handleSelectionDragStart,
    handleSelectionDragStop,
  } = useCanvasGraphEditingSurfaceController({
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
    elevateNodes,
    fitGroupToChildren,
    alignNodeChanges,
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
    historyPort: CANVAS_COMMAND_HISTORY_PORT,
    uploadNodeType: CANVAS_NODE_TYPES.upload,
    isImmersiveViewerActive,
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
      projectId={projectId}
      canvasId={canvasId}
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
      imageViewerProps={imageViewerProps}
      videoViewerProps={videoViewerProps}
    />
  );
}
