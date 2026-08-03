// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';

import {
  useCanvasNodeClickController,
  useCanvasNodeMenuShortcut,
  useCanvasNodePlacementController,
  useCanvasPaneClickController,
  type CanvasNodeClickController,
  type CanvasNodeClickControllerOptions,
  type CanvasNodeMenuShortcutController,
  type CanvasNodePlacement,
  type CanvasNodePlacementController,
  type CanvasPaneClickController,
  type SkillDefinition,
} from '@/modules/creative_canvas/public';
import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';

import {
  isStoryboardGroupNode,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';
import type {
  CanvasNodeMenuStateController,
} from './useCanvasNodeMenuStateController';
import {
  useCanvasNodeMenuSelectionController,
  type CanvasNodeMenuSelectionController,
  type CanvasNodeMenuSelectionControllerOptions,
} from './useCanvasNodeMenuSelectionController';
import {
  useCanvasQuickAddController,
  type CanvasQuickAddController,
} from './useCanvasQuickAddController';

interface CanvasPosition {
  x: number;
  y: number;
}

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
  openPlainNodeMenu: CanvasNodeMenuStateController['openPlainNodeMenu'];
  dismissNodeMenu:
    CanvasNodeMenuStateController['dismissNodeMenuForPaneClick'];
  onBlankPaneClick?: () => void;
  centerViewport: CanvasNodeClickControllerOptions<CanvasNode>['centerViewport'];
  flowPosition: CanvasPosition;
  menuPosition: CanvasPosition;
  menuAllowedTypes: readonly CanvasNodeType[] | undefined;
  pendingConnection:
    CanvasNodeMenuSelectionControllerOptions['pendingConnection'];
  pendingBatchSourceIds:
    CanvasNodeMenuSelectionControllerOptions['pendingBatchSourceIds'];
  connectSpawnedNode:
    CanvasNodeMenuSelectionControllerOptions['connectSpawnedNode'];
  hideMenuForPlacement:
    CanvasNodeMenuStateController['hideNodeMenuForPlacement'];
  closeNodeMenu: CanvasNodeMenuStateController['closeNodeMenu'];
}

export interface CanvasNodeInteractionController
  extends CanvasNodePlacementController<CanvasNodeType, CanvasNodeData>,
  CanvasPaneClickController,
  CanvasNodeMenuShortcutController,
  CanvasNodeClickController<CanvasNode>,
  CanvasNodeMenuSelectionController,
  CanvasQuickAddController {
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
  const placement = useCanvasNodePlacementController({
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
  const menuSelection = useCanvasNodeMenuSelectionController({
    wrapperRef,
    nodes,
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
  const quickAdd = useCanvasQuickAddController({
    wrapperRef,
    screenToFlowPosition,
    createNode,
    selectNode,
    bindSkill,
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
