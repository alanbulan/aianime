// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';

import {
  useCanvasNodeClickController,
  useCanvasNodeMenuSelectionController,
  useCanvasNodeMenuShortcut,
  useCanvasNodePlacementController,
  useCanvasPaneClickController,
  useCanvasQuickAddController,
  type CanvasNodeClickController,
  type CanvasNodeClickControllerOptions,
  type CanvasNodeMenuSelectionController,
  type CanvasNodeMenuSelectionControllerOptions,
  type CanvasNodeMenuShortcutController,
  type CanvasNodeMenuStateController,
  type CanvasNodeMenuTypes,
  type CanvasNodePlacement,
  type CanvasNodePlacementController,
  type CanvasPaneClickController,
  type CanvasQuickAddController,
  type SkillDefinition,
} from '@/modules/creative_canvas/public';
import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';

import {
  CANVAS_NODE_TYPES,
  isStoryboardGroupNode,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';

interface CanvasPosition {
  x: number;
  y: number;
}

const CANVAS_NODE_MENU_TYPES = {
  imageEdit: CANVAS_NODE_TYPES.imageEdit,
  upload: CANVAS_NODE_TYPES.upload,
  imageGen: CANVAS_NODE_TYPES.imageGen,
  skill: CANVAS_NODE_TYPES.skill,
} satisfies CanvasNodeMenuTypes<CanvasNodeType>;

export interface CanvasNodeInteractionControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  nodes: readonly CanvasNode[];
  screenToFlowPosition: (clientPosition: CanvasPosition) => CanvasPosition;
  createNode: (
    type: CanvasNodeType,
    position: CanvasPosition,
    data?: Partial<CanvasNodeData>,
  ) => string;
  selectNode: (nodeId: string | null) => void;
  bindSkill: (nodeId: string, skill: SkillDefinition) => void;
  confirmPlacement: (nodeId: string) => void;
  resolvePlacementLabel: (
    placement: CanvasNodePlacement<CanvasNodeType, CanvasNodeData>,
  ) => string;
  openPlainNodeMenu:
    CanvasNodeMenuStateController<CanvasNodeType>['openPlainNodeMenu'];
  dismissNodeMenu:
    CanvasNodeMenuStateController<CanvasNodeType>['dismissNodeMenuForPaneClick'];
  onBlankPaneClick?: () => void;
  centerViewport: CanvasNodeClickControllerOptions<CanvasNode>['centerViewport'];
  flowPosition: CanvasPosition;
  menuPosition: CanvasPosition;
  menuAllowedTypes: readonly CanvasNodeType[] | undefined;
  pendingConnection:
    CanvasNodeMenuSelectionControllerOptions<
      CanvasNodeType,
      CanvasNode
    >['pendingConnection'];
  pendingBatchSourceIds:
    CanvasNodeMenuSelectionControllerOptions<
      CanvasNodeType,
      CanvasNode
    >['pendingBatchSourceIds'];
  connectSpawnedNode:
    CanvasNodeMenuSelectionControllerOptions<
      CanvasNodeType,
      CanvasNode
    >['connectSpawnedNode'];
  hideMenuForPlacement:
    CanvasNodeMenuStateController<CanvasNodeType>['hideNodeMenuForPlacement'];
  closeNodeMenu:
    CanvasNodeMenuStateController<CanvasNodeType>['closeNodeMenu'];
}

export interface CanvasNodeInteractionController
  extends CanvasNodePlacementController<CanvasNodeType, CanvasNodeData>,
  CanvasPaneClickController,
  CanvasNodeMenuShortcutController,
  CanvasNodeClickController<CanvasNode>,
  CanvasNodeMenuSelectionController<CanvasNodeType>,
  CanvasQuickAddController<CanvasNodeType> {
  openNodeMenuAtClientPosition: (clientPosition: CanvasPosition) => void;
}

export function useCanvasNodeInteractionController({
  wrapperRef,
  nodes,
  screenToFlowPosition,
  createNode,
  selectNode,
  bindSkill,
  confirmPlacement,
  resolvePlacementLabel,
  openPlainNodeMenu,
  dismissNodeMenu,
  onBlankPaneClick,
  centerViewport,
  flowPosition,
  menuPosition,
  menuAllowedTypes,
  pendingConnection,
  pendingBatchSourceIds,
  connectSpawnedNode,
  hideMenuForPlacement,
  closeNodeMenu,
}: CanvasNodeInteractionControllerOptions): CanvasNodeInteractionController {
  const placement = useCanvasNodePlacementController<
    CanvasNodeType,
    CanvasNodeData
  >({
    wrapperRef,
    screenToFlowPosition,
    createNode,
    selectNode,
    bindSkill,
    confirmPlacement,
    resolvePlacementLabel,
  });
  const openNodeMenuAtClientPosition = useCallback(
    (clientPosition: CanvasPosition) => {
      const containerRect = wrapperRef.current?.getBoundingClientRect();
      openPlainNodeMenu({
        flowPosition: screenToFlowPosition(clientPosition),
        menuPosition: {
          x: clientPosition.x - (containerRect?.left ?? 0),
          y: clientPosition.y - (containerRect?.top ?? 0),
        },
      });
      placement.cancelNodePlacement();
      selectNode(null);
    },
    [
      openPlainNodeMenu,
      placement.cancelNodePlacement,
      screenToFlowPosition,
      selectNode,
      wrapperRef,
    ],
  );
  const paneClick = useCanvasPaneClickController({
    placementActive: placement.placementActive,
    commitPlacement: placement.commitNodePlacementAtClientPosition,
    openNodeMenu: openNodeMenuAtClientPosition,
    setSelectedNodeId: selectNode,
    dismissNodeMenu,
    onBlankPaneClick,
  });
  const menuShortcut = useCanvasNodeMenuShortcut({
    wrapperRef,
    placementActive: placement.placementActive,
    setPlacementClientPosition:
      placement.updateNodePlacementClientPosition,
    openNodeMenu: openNodeMenuAtClientPosition,
    isImmersiveViewerActive,
  });
  const nodeClick = useCanvasNodeClickController<CanvasNode>({
    placementActive: placement.placementActive,
    commitPlacement: placement.commitNodePlacementAtClientPosition,
    suppressNextPaneClick: paneClick.suppressNextPaneClick,
    centerViewport,
    isStoryboardGroupNode,
  });
  const menuSelection = useCanvasNodeMenuSelectionController<
    CanvasNodeType,
    CanvasNode
  >({
    wrapperRef,
    nodes,
    nodeTypes: CANVAS_NODE_MENU_TYPES,
    flowPosition,
    menuPosition,
    menuAllowedTypes,
    pendingConnection,
    pendingBatchSourceIds,
    getLastCanvasPointerPosition: menuShortcut.getLastCanvasPointerPosition,
    createNode,
    beginNodePlacement: placement.beginNodePlacement,
    connectSpawnedNode,
    selectNode,
    hideMenuForPlacement,
    closeNodeMenu,
    releasePaneClickSuppression: paneClick.releasePaneClickSuppression,
  });
  const quickAdd = useCanvasQuickAddController<CanvasNodeType>({
    wrapperRef,
    screenToFlowPosition,
    createNode,
    selectNode,
    bindSkill,
    skillNodeType: CANVAS_NODE_TYPES.skill,
  });

  return {
    ...placement,
    ...paneClick,
    ...menuShortcut,
    ...nodeClick,
    ...menuSelection,
    ...quickAdd,
    openNodeMenuAtClientPosition,
  };
}
