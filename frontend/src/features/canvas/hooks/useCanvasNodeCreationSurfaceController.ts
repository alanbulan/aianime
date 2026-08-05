// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import { useCanvasNodeCatalogController, useCanvasConnectionController, useCanvasNodeInteractionController, useCanvasNodeMenuStateController, loadCanvasSkillRegistry, type CanvasConnectionController, type CanvasConnectionControllerOptions, type CanvasNodeInteractionController, type CanvasNodeInteractionControllerOptions, type CanvasNodeCatalogController, type CanvasNodeCatalogControllerOptions, type CanvasNodeMenuCreationData, type CanvasNodeMenuStateController, type CanvasNodeMenuTypes, type CanvasNode, type CanvasNodeData, type CanvasNodeType } from '@/modules/creative_canvas/public';
import { isImmersiveViewerActive } from '@/features/viewer-kit/public';

import { nodeCatalog } from '../application/nodeCatalog';
import { isStoryboardGroupNode } from '../domain/canvasNodes';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
type NodeInteractionControllerOptions = CanvasNodeInteractionControllerOptions<
  CanvasNodeType,
  CanvasNodeData,
  CanvasNode
>;

const CANVAS_NODE_MENU_TYPES = {
  imageEdit: CANVAS_NODE_TYPES.imageEdit,
  upload: CANVAS_NODE_TYPES.upload,
  imageGen: CANVAS_NODE_TYPES.imageGen,
  skill: CANVAS_NODE_TYPES.skill,
} satisfies CanvasNodeMenuTypes<CanvasNodeType>;

function adaptCanvasNodeMenuCreationData(
  data: CanvasNodeMenuCreationData,
): Partial<CanvasNodeData> {
  return data as Partial<CanvasNodeData>;
}

export interface CanvasNodeCreationSurfaceControllerOptions {
  translate: CanvasNodeCatalogControllerOptions<CanvasNodeType>['translate'];
  wrapperRef: NodeInteractionControllerOptions['wrapperRef'];
  nodes: NodeInteractionControllerOptions['nodes'];
  screenToFlowPosition:
    NodeInteractionControllerOptions['screenToFlowPosition'];
  createNode: NodeInteractionControllerOptions['createNode'];
  selectNode: NodeInteractionControllerOptions['selectNode'];
  confirmPlacement:
    NodeInteractionControllerOptions['confirmPlacement'];
  onBlankPaneClick?:
    NodeInteractionControllerOptions['onBlankPaneClick'];
  centerViewport: NodeInteractionControllerOptions['centerViewport'];
  getGraph: CanvasConnectionControllerOptions['getGraph'];
  connectRegular: CanvasConnectionControllerOptions['connectRegular'];
  replaceEdges: CanvasConnectionControllerOptions['replaceEdges'];
}

type CanvasNodeCreationMenuController = Pick<
  CanvasNodeMenuStateController<CanvasNodeType>,
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
  CanvasNodeCatalogController<CanvasNodeType, CanvasNodeData>,
  'skills'
>;

type CanvasNodeCreationConnectionController = Pick<
  CanvasConnectionController,
  | 'connectGraphNodes'
  | 'connectManualGraphNodes'
  | 'isValidGraphConnection'
>;

type CanvasNodeCreationInteractionController = Pick<
  CanvasNodeInteractionController<CanvasNodeType, CanvasNodeData, CanvasNode>,
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
  const resolveNodeTypeLabel = useCallback(
    (type: CanvasNodeType): string => {
      const definition = nodeCatalog.getDefinition(type);
      return definition ? translate(definition.menuLabelKey) : type;
    },
    [translate],
  );
  const nodeMenu = useCanvasNodeMenuStateController<CanvasNodeType>();
  const catalog = useCanvasNodeCatalogController<CanvasNodeType, CanvasNodeData>({
    translate,
    loadSkillRegistry: loadCanvasSkillRegistry,
    resolveNodeTypeLabel,
  });
  const connection = useCanvasConnectionController({
    getGraph,
    connectRegular,
    replaceEdges,
    skillById: catalog.skillById,
  });
  const nodeInteraction = useCanvasNodeInteractionController({
    wrapperRef,
    nodes,
    nodeTypes: CANVAS_NODE_MENU_TYPES,
    skillNodeType: CANVAS_NODE_TYPES.skill,
    screenToFlowPosition,
    createNode,
    adaptMenuCreationData: adaptCanvasNodeMenuCreationData,
    selectNode,
    bindSkill: connection.bindSingleBeatContextInput,
    confirmPlacement,
    resolvePlacementLabel: catalog.resolvePlacementLabel,
    openPlainNodeMenu: nodeMenu.openPlainNodeMenu,
    dismissNodeMenu: nodeMenu.dismissNodeMenuForPaneClick,
    onBlankPaneClick,
    centerViewport,
    isStoryboardGroupNode,
    isImmersiveViewerActive,
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
    skills: catalog.skills,
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
