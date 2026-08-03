// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';

import {
  useCanvasContextMenuController,
  type CanvasContextMenuController,
} from './useCanvasContextMenuController';
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts';

interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasCommandHistoryPort {
  getCapabilities: () => {
    canUndo: boolean;
    canRedo: boolean;
  };
}

export interface CanvasCommandSurfaceControllerOptions<
  TNodeType = string,
  TNodeData extends object = Record<string, unknown>,
> {
  wrapperRef: RefObject<HTMLDivElement | null>;
  placementActive: boolean;
  nodeMenuOpen: boolean;
  selectedNodeCount: number;
  hasCopiedNodes: () => boolean;
  historyPort: CanvasCommandHistoryPort;
  uploadNodeType: TNodeType;
  isImmersiveViewerActive: () => boolean;
  screenToFlowPosition: (position: CanvasPosition) => CanvasPosition;
  createNode: (
    type: TNodeType,
    position: CanvasPosition,
    data?: Partial<TNodeData>,
  ) => string;
  openNodeMenu: (position: CanvasPosition) => void;
  cancelPlacement: () => void;
  closeNodeMenu: () => void;
  organizeCanvas: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  undo: () => void;
  redo: () => void;
  groupSelection: () => void;
  deleteSelection: () => boolean;
  pasteAt: (position: CanvasPosition) => void;
}

export function useCanvasCommandSurfaceController<
  TNodeType,
  TNodeData extends object,
>({
  wrapperRef,
  placementActive,
  nodeMenuOpen,
  selectedNodeCount,
  hasCopiedNodes,
  historyPort,
  uploadNodeType,
  isImmersiveViewerActive,
  screenToFlowPosition,
  createNode,
  openNodeMenu,
  cancelPlacement,
  closeNodeMenu,
  organizeCanvas,
  copySelection,
  pasteSelection,
  undo,
  redo,
  groupSelection,
  deleteSelection,
  pasteAt,
}: CanvasCommandSurfaceControllerOptions<
  TNodeType,
  TNodeData
>): CanvasContextMenuController {
  const getContextMenuCapabilities = useCallback(() => {
    return {
      ...historyPort.getCapabilities(),
      canPaste: hasCopiedNodes(),
    };
  }, [hasCopiedNodes, historyPort]);
  const createContextMenuUploadNode = useCallback(
    (position: CanvasPosition) => {
      createNode(uploadNodeType, position);
    },
    [createNode, uploadNodeType],
  );
  const contextMenuController = useCanvasContextMenuController({
    wrapperRef,
    disabled: placementActive,
    getCapabilities: getContextMenuCapabilities,
    screenToFlowPosition,
    createUploadNode: createContextMenuUploadNode,
    openNodeMenu,
    undo,
    redo,
    pasteAt,
  });
  useCanvasKeyboardShortcuts({
    placementActive,
    nodeMenuOpen,
    canCopySelection: selectedNodeCount > 0,
    canGroupSelection: selectedNodeCount >= 2,
    isImmersiveViewerActive,
    cancelPlacement,
    closeNodeMenu,
    organizeCanvas,
    copySelection,
    pasteSelection,
    undo,
    redo,
    groupSelection,
    deleteSelection,
  });

  return contextMenuController;
}
