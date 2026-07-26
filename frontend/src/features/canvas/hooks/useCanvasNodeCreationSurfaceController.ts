// Copyright (c) 2026 AI anime
import {
  useCanvasConnectionController,
  type CanvasConnectionController,
  type CanvasConnectionControllerOptions,
} from './useCanvasConnectionController';
import {
  useCanvasNodeCatalogController,
  type CanvasNodeCatalogController,
  type CanvasNodeCatalogControllerOptions,
} from './useCanvasNodeCatalogController';
import {
  useCanvasNodeInteractionController,
  type CanvasNodeInteractionController,
  type CanvasNodeInteractionControllerOptions,
} from './useCanvasNodeInteractionController';
import {
  useCanvasNodeMenuStateController,
  type CanvasNodeMenuStateController,
} from './useCanvasNodeMenuStateController';

export interface CanvasNodeCreationSurfaceControllerOptions {
  translate: CanvasNodeCatalogControllerOptions['translate'];
  wrapperRef: CanvasNodeInteractionControllerOptions['wrapperRef'];
  nodes: CanvasNodeInteractionControllerOptions['nodes'];
  screenToFlowPosition:
    CanvasNodeInteractionControllerOptions['screenToFlowPosition'];
  createNode: CanvasNodeInteractionControllerOptions['createNode'];
  selectNode: CanvasNodeInteractionControllerOptions['selectNode'];
  confirmPlacement:
    CanvasNodeInteractionControllerOptions['confirmPlacement'];
  onBlankPaneClick?:
    CanvasNodeInteractionControllerOptions['onBlankPaneClick'];
  centerViewport: CanvasNodeInteractionControllerOptions['centerViewport'];
  getGraph: CanvasConnectionControllerOptions['getGraph'];
  connectRegular: CanvasConnectionControllerOptions['connectRegular'];
  replaceEdges: CanvasConnectionControllerOptions['replaceEdges'];
}

type CanvasNodeCreationMenuController = Pick<
  CanvasNodeMenuStateController,
  | 'showNodeMenu'
  | 'menuPosition'
  | 'menuAllowedTypes'
  | 'pendingConnectStart'
  | 'previewConnectionVisual'
  | 'handleMarqueeStart'
  | 'prepareBatchConnectionDrag'
  | 'updateConnectionPreview'
  | 'prepareConnectionStart'
  | 'clearConnection'
  | 'openConnectionMenu'
  | 'openBatchConnectionMenu'
  | 'closeNodeMenu'
>;

type CanvasNodeCreationCatalogController = Pick<
  CanvasNodeCatalogController,
  'skills'
>;

type CanvasNodeCreationConnectionController = Pick<
  CanvasConnectionController,
  | 'connectGraphNodes'
  | 'connectManualGraphNodes'
  | 'isValidGraphConnection'
>;

type CanvasNodeCreationInteractionController = Pick<
  CanvasNodeInteractionController,
  | 'placementActive'
  | 'placementPreview'
  | 'cancelNodePlacement'
  | 'openNodeMenuAtClientPosition'
  | 'handlePaneClick'
  | 'suppressNextPaneClick'
  | 'handleCanvasPointerMove'
  | 'getPreferredCanvasPointerPosition'
  | 'handleNodeClick'
  | 'selectNodeType'
  | 'selectSkill'
  | 'getViewportCenter'
  | 'quickAddNode'
  | 'quickAddSkill'
>;

export type CanvasNodeCreationSurfaceController =
  CanvasNodeCreationMenuController &
  CanvasNodeCreationCatalogController &
  CanvasNodeCreationConnectionController &
  CanvasNodeCreationInteractionController;

export function useCanvasNodeCreationSurfaceController({
  translate,
  wrapperRef,
  nodes,
  screenToFlowPosition,
  createNode,
  selectNode,
  confirmPlacement,
  onBlankPaneClick,
  centerViewport,
  getGraph,
  connectRegular,
  replaceEdges,
}: CanvasNodeCreationSurfaceControllerOptions): CanvasNodeCreationSurfaceController {
  const nodeMenu = useCanvasNodeMenuStateController();
  const nodeCatalog = useCanvasNodeCatalogController({ translate });
  const connection = useCanvasConnectionController({
    getGraph,
    connectRegular,
    replaceEdges,
    skillById: nodeCatalog.skillById,
  });
  const nodeInteraction = useCanvasNodeInteractionController({
    wrapperRef,
    nodes,
    screenToFlowPosition,
    createNode,
    selectNode,
    bindSkill: connection.bindSingleBeatContextInput,
    confirmPlacement,
    resolvePlacementLabel: nodeCatalog.resolvePlacementLabel,
    openPlainNodeMenu: nodeMenu.openPlainNodeMenu,
    dismissNodeMenu: nodeMenu.dismissNodeMenuForPaneClick,
    onBlankPaneClick,
    centerViewport,
    flowPosition: nodeMenu.flowPosition,
    menuPosition: nodeMenu.menuPosition,
    menuAllowedTypes: nodeMenu.menuAllowedTypes,
    pendingConnection: nodeMenu.pendingConnectStart,
    pendingBatchSourceIds: nodeMenu.pendingBatchConnectIds,
    connectSpawnedNode: connection.connectSpawnedNode,
    hideMenuForPlacement: nodeMenu.hideNodeMenuForPlacement,
    closeNodeMenu: nodeMenu.closeNodeMenu,
  });

  return {
    skills: nodeCatalog.skills,
    showNodeMenu: nodeMenu.showNodeMenu,
    menuPosition: nodeMenu.menuPosition,
    menuAllowedTypes: nodeMenu.menuAllowedTypes,
    pendingConnectStart: nodeMenu.pendingConnectStart,
    previewConnectionVisual: nodeMenu.previewConnectionVisual,
    handleMarqueeStart: nodeMenu.handleMarqueeStart,
    prepareBatchConnectionDrag: nodeMenu.prepareBatchConnectionDrag,
    updateConnectionPreview: nodeMenu.updateConnectionPreview,
    prepareConnectionStart: nodeMenu.prepareConnectionStart,
    clearConnection: nodeMenu.clearConnection,
    openConnectionMenu: nodeMenu.openConnectionMenu,
    openBatchConnectionMenu: nodeMenu.openBatchConnectionMenu,
    closeNodeMenu: nodeMenu.closeNodeMenu,
    connectGraphNodes: connection.connectGraphNodes,
    connectManualGraphNodes: connection.connectManualGraphNodes,
    isValidGraphConnection: connection.isValidGraphConnection,
    placementActive: nodeInteraction.placementActive,
    placementPreview: nodeInteraction.placementPreview,
    cancelNodePlacement: nodeInteraction.cancelNodePlacement,
    openNodeMenuAtClientPosition:
      nodeInteraction.openNodeMenuAtClientPosition,
    handlePaneClick: nodeInteraction.handlePaneClick,
    suppressNextPaneClick: nodeInteraction.suppressNextPaneClick,
    handleCanvasPointerMove: nodeInteraction.handleCanvasPointerMove,
    getPreferredCanvasPointerPosition:
      nodeInteraction.getPreferredCanvasPointerPosition,
    handleNodeClick: nodeInteraction.handleNodeClick,
    selectNodeType: nodeInteraction.selectNodeType,
    selectSkill: nodeInteraction.selectSkill,
    getViewportCenter: nodeInteraction.getViewportCenter,
    quickAddNode: nodeInteraction.quickAddNode,
    quickAddSkill: nodeInteraction.quickAddSkill,
  };
}
