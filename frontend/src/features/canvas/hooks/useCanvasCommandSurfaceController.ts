// Copyright (c) 2026 AI anime
import { useCallback, type RefObject } from 'react';

import { useCanvasStore } from '@/stores/canvasStore';

import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';
import {
  useCanvasContextMenuController,
  type CanvasContextMenuController,
} from './useCanvasContextMenuController';
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts';

interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasCommandSurfaceControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  placementActive: boolean;
  nodeMenuOpen: boolean;
  selectedNodeCount: number;
  hasCopiedNodes: () => boolean;
  screenToFlowPosition: (position: CanvasPosition) => CanvasPosition;
  createNode: (
    type: CanvasNodeType,
    position: CanvasPosition,
    data?: Partial<CanvasNodeData>,
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

export function useCanvasCommandSurfaceController({
  wrapperRef,
  placementActive,
  nodeMenuOpen,
  selectedNodeCount,
  hasCopiedNodes,
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
}: CanvasCommandSurfaceControllerOptions): CanvasContextMenuController {
  const getContextMenuCapabilities = useCallback(() => {
    const history = useCanvasStore.getState().history;
    return {
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      canPaste: hasCopiedNodes(),
    };
  }, [hasCopiedNodes]);
  const createContextMenuUploadNode = useCallback(
    (position: CanvasPosition) => {
      createNode(CANVAS_NODE_TYPES.upload, position);
    },
    [createNode],
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
