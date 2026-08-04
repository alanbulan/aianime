// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';

import type {
  CanvasNodeMenuCreationData,
  CanvasNodeMenuSelectionNode,
  CanvasNodeMenuTypes,
} from '../application/canvasNodeMenuSelection';
import type { SkillDefinition } from '../domain/skillContract';
import {
  useCanvasNodeClickController,
  type CanvasNodeClickController,
  type CanvasNodeClickControllerOptions,
  type CanvasNodeClickTarget,
} from './useCanvasNodeClickController';
import {
  useCanvasNodeMenuSelectionController,
  type CanvasNodeMenuPlacement,
  type CanvasNodeMenuSelectionController,
  type CanvasNodeMenuSelectionControllerOptions,
} from './useCanvasNodeMenuSelectionController';
import {
  useCanvasNodeMenuShortcut,
  type CanvasNodeMenuShortcutController,
} from './useCanvasNodeMenuShortcut';
import type { CanvasNodeMenuStateController } from './useCanvasNodeMenuStateController';
import {
  useCanvasNodePlacementController,
  type CanvasNodePlacement,
  type CanvasNodePlacementController,
} from './useCanvasNodePlacementController';
import {
  useCanvasPaneClickController,
  type CanvasPaneClickController,
} from './useCanvasPaneClickController';
import {
  useCanvasQuickAddController,
  type CanvasQuickAddController,
} from './useCanvasQuickAddController';

interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasNodeInteractionNode
  extends CanvasNodeClickTarget,
    CanvasNodeMenuSelectionNode {}

export interface CanvasNodeInteractionControllerOptions<
  TNodeType extends string,
  TNodeData extends object,
  TNode extends CanvasNodeInteractionNode,
> {
  wrapperRef: RefObject<HTMLDivElement | null>;
  nodes: readonly TNode[];
  nodeTypes: CanvasNodeMenuTypes<TNodeType>;
  skillNodeType: TNodeType;
  screenToFlowPosition: (clientPosition: CanvasPosition) => CanvasPosition;
  createNode: (
    type: TNodeType,
    position: CanvasPosition,
    data?: Partial<TNodeData>,
  ) => string;
  adaptMenuCreationData: (
    data: CanvasNodeMenuCreationData,
  ) => Partial<TNodeData>;
  selectNode: (nodeId: string | null) => void;
  bindSkill: (nodeId: string, skill: SkillDefinition) => void;
  confirmPlacement: (nodeId: string) => void;
  resolvePlacementLabel: (
    placement: CanvasNodePlacement<TNodeType, TNodeData>,
  ) => string;
  openPlainNodeMenu:
    CanvasNodeMenuStateController<TNodeType>['openPlainNodeMenu'];
  dismissNodeMenu:
    CanvasNodeMenuStateController<TNodeType>['dismissNodeMenuForPaneClick'];
  onBlankPaneClick?: () => void;
  centerViewport: CanvasNodeClickControllerOptions<TNode>['centerViewport'];
  isStoryboardGroupNode: (node: TNode) => boolean;
  isImmersiveViewerActive: () => boolean;
  flowPosition: CanvasPosition;
  menuPosition: CanvasPosition;
  menuAllowedTypes: readonly TNodeType[] | undefined;
  pendingConnection:
    CanvasNodeMenuSelectionControllerOptions<
      TNodeType,
      TNode
    >['pendingConnection'];
  pendingBatchSourceIds:
    CanvasNodeMenuSelectionControllerOptions<
      TNodeType,
      TNode
    >['pendingBatchSourceIds'];
  connectSpawnedNode:
    CanvasNodeMenuSelectionControllerOptions<
      TNodeType,
      TNode
    >['connectSpawnedNode'];
  hideMenuForPlacement:
    CanvasNodeMenuStateController<TNodeType>['hideNodeMenuForPlacement'];
  closeNodeMenu:
    CanvasNodeMenuStateController<TNodeType>['closeNodeMenu'];
}

export interface CanvasNodeInteractionController<
  TNodeType extends string,
  TNodeData extends object,
  TNode extends CanvasNodeInteractionNode,
> extends CanvasNodePlacementController<TNodeType, TNodeData>,
    CanvasPaneClickController,
    CanvasNodeMenuShortcutController,
    CanvasNodeClickController<TNode>,
    CanvasNodeMenuSelectionController<TNodeType>,
    CanvasQuickAddController<TNodeType> {
  openNodeMenuAtClientPosition: (clientPosition: CanvasPosition) => void;
}

export function useCanvasNodeInteractionController<
  TNodeType extends string,
  TNodeData extends object,
  TNode extends CanvasNodeInteractionNode,
>({
  wrapperRef,
  nodes,
  nodeTypes,
  skillNodeType,
  screenToFlowPosition,
  createNode,
  adaptMenuCreationData,
  selectNode,
  bindSkill,
  confirmPlacement,
  resolvePlacementLabel,
  openPlainNodeMenu,
  dismissNodeMenu,
  onBlankPaneClick,
  centerViewport,
  isStoryboardGroupNode,
  isImmersiveViewerActive,
  flowPosition,
  menuPosition,
  menuAllowedTypes,
  pendingConnection,
  pendingBatchSourceIds,
  connectSpawnedNode,
  hideMenuForPlacement,
  closeNodeMenu,
}: CanvasNodeInteractionControllerOptions<
  TNodeType,
  TNodeData,
  TNode
>): CanvasNodeInteractionController<TNodeType, TNodeData, TNode> {
  const placement = useCanvasNodePlacementController<
    TNodeType,
    TNodeData
  >({
    wrapperRef,
    screenToFlowPosition,
    createNode,
    selectNode,
    bindSkill,
    confirmPlacement,
    resolvePlacementLabel,
  });
  const createMenuNode = useCallback(
    (
      type: TNodeType,
      position: CanvasPosition,
      data?: CanvasNodeMenuCreationData,
    ) => data
      ? createNode(type, position, adaptMenuCreationData(data))
      : createNode(type, position),
    [adaptMenuCreationData, createNode],
  );
  const beginMenuNodePlacement = useCallback(
    (
      menuPlacement: CanvasNodeMenuPlacement<TNodeType>,
      clientPosition: CanvasPosition | null,
    ) => placement.beginNodePlacement(
      {
        type: menuPlacement.type,
        initialData: menuPlacement.initialData
          ? adaptMenuCreationData(menuPlacement.initialData)
          : undefined,
        skill: menuPlacement.skill,
      },
      clientPosition,
    ),
    [adaptMenuCreationData, placement.beginNodePlacement],
  );
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
  const nodeClick = useCanvasNodeClickController<TNode>({
    placementActive: placement.placementActive,
    commitPlacement: placement.commitNodePlacementAtClientPosition,
    suppressNextPaneClick: paneClick.suppressNextPaneClick,
    centerViewport,
    isStoryboardGroupNode,
  });
  const menuSelection = useCanvasNodeMenuSelectionController<
    TNodeType,
    TNode
  >({
    wrapperRef,
    nodes,
    nodeTypes,
    flowPosition,
    menuPosition,
    menuAllowedTypes,
    pendingConnection,
    pendingBatchSourceIds,
    getLastCanvasPointerPosition: menuShortcut.getLastCanvasPointerPosition,
    createNode: createMenuNode,
    beginNodePlacement: beginMenuNodePlacement,
    connectSpawnedNode,
    selectNode,
    hideMenuForPlacement,
    closeNodeMenu,
    releasePaneClickSuppression: paneClick.releasePaneClickSuppression,
  });
  const quickAdd = useCanvasQuickAddController<TNodeType>({
    wrapperRef,
    screenToFlowPosition,
    createNode: createMenuNode,
    selectNode,
    bindSkill,
    skillNodeType,
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
