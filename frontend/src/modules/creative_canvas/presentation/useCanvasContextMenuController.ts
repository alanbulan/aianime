// Copyright (c) 2026 AI anime
import { useMemo, type RefObject } from 'react';

import type { CanvasContextMenuItem } from './CanvasContextMenu';
import {
  useCanvasPaneContextMenu,
  type CanvasPaneContextMenuCapabilities,
  type CanvasPaneContextMenuState,
} from './useCanvasPaneContextMenu';

export interface CanvasContextMenuControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  getCapabilities: () => CanvasPaneContextMenuCapabilities;
  screenToFlowPosition: (
    clientPosition: { x: number; y: number },
  ) => { x: number; y: number };
  createUploadNode: (position: { x: number; y: number }) => void;
  openNodeMenu: (clientPosition: { x: number; y: number }) => void;
  undo: () => void;
  redo: () => void;
  pasteAt: (position: { x: number; y: number }) => void;
}

export interface CanvasContextMenuController {
  contextMenu: CanvasPaneContextMenuState | null;
  sections: CanvasContextMenuItem[][];
  closeContextMenu: () => void;
}

export function useCanvasContextMenuController({
  wrapperRef,
  disabled,
  getCapabilities,
  screenToFlowPosition,
  createUploadNode,
  openNodeMenu,
  undo,
  redo,
  pasteAt,
}: CanvasContextMenuControllerOptions): CanvasContextMenuController {
  const { contextMenu, closeContextMenu } = useCanvasPaneContextMenu({
    wrapperRef,
    disabled,
    getCapabilities,
  });

  const sections = useMemo<CanvasContextMenuItem[][]>(() => {
    if (!contextMenu) {
      return [];
    }
    const clientPosition = {
      x: contextMenu.clientX,
      y: contextMenu.clientY,
    };

    return [
      [
        {
          key: 'upload',
          label: '上传',
          onSelect: () => createUploadNode(
            screenToFlowPosition(clientPosition),
          ),
        },
        {
          key: 'add-node',
          label: '添加节点',
          onSelect: () => openNodeMenu(clientPosition),
        },
      ],
      [
        {
          key: 'undo',
          label: '撤销',
          shortcut: '⌘Z',
          disabled: !contextMenu.canUndo,
          onSelect: undo,
        },
        {
          key: 'redo',
          label: '重做',
          shortcut: '⇧⌘Z',
          disabled: !contextMenu.canRedo,
          onSelect: redo,
        },
      ],
      [
        {
          key: 'paste',
          label: '粘贴',
          shortcut: '⌘V',
          disabled: !contextMenu.canPaste,
          onSelect: () => pasteAt(screenToFlowPosition(clientPosition)),
        },
      ],
    ];
  }, [
    contextMenu,
    createUploadNode,
    openNodeMenu,
    pasteAt,
    redo,
    screenToFlowPosition,
    undo,
  ]);

  return {
    contextMenu,
    sections,
    closeContextMenu,
  };
}
