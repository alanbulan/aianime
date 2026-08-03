// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import {
  useCanvasNodeCatalogController,
  useCanvasNodeMenuStateController,
  loadCanvasSkillRegistry,
  type CanvasNodeCatalogController,
  type CanvasNodeCatalogControllerOptions,
  type CanvasNodeMenuStateController,
} from '@/modules/creative_canvas/public';

import { nodeCatalog } from '../application/nodeCatalog';
import type { CanvasNodeData, CanvasNodeType } from '../domain/canvasNodes';
import {
  useCanvasConnectionController,
  type CanvasConnectionController,
  type CanvasConnectionControllerOptions,
} from './useCanvasConnectionController';
import {
  useCanvasNodeInteractionController,
  type CanvasNodeInteractionController,
  type CanvasNodeInteractionControllerOptions,
} from './useCanvasNodeInteractionController';

export interface CanvasNodeCreationSurfaceControllerOptions {
  translate: CanvasNodeCatalogControllerOptions<CanvasNodeType>['translate'];
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
    screenToFlowPosition,
    createNode,
    selectNode,
    bindSkill: connection.bindSingleBeatContextInput,
    confirmPlacement,
    resolvePlacementLabel: catalog.resolvePlacementLabel,
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
