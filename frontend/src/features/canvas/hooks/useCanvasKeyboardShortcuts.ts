// Copyright (c) 2026 AI anime
import { useEffect } from 'react';

import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';

import { isTypingTarget } from '@/modules/creative_canvas/public';

export interface CanvasKeyboardShortcutOptions {
  placementActive: boolean;
  nodeMenuOpen: boolean;
  canCopySelection: boolean;
  canGroupSelection: boolean;
  cancelPlacement: () => void;
  closeNodeMenu: () => void;
  organizeCanvas: () => void;
  copySelection: () => void;
  pasteSelection: () => void;
  undo: () => void;
  redo: () => void;
  groupSelection: () => void;
  deleteSelection: () => boolean;
}

export function useCanvasKeyboardShortcuts({
  placementActive,
  nodeMenuOpen,
  canCopySelection,
  canGroupSelection,
  cancelPlacement,
  closeNodeMenu,
  organizeCanvas,
  copySelection,
  pasteSelection,
  undo,
  redo,
  groupSelection,
  deleteSelection,
}: CanvasKeyboardShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || isImmersiveViewerActive()) {
        return;
      }

      const commandPressed = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const isUndo = commandPressed && key === 'z' && !event.shiftKey;
      const isRedo = commandPressed && (key === 'y' || (key === 'z' && event.shiftKey));
      const isGroup = commandPressed && key === 'g';
      const isCopy = commandPressed && key === 'c' && !event.shiftKey;
      const isPaste = commandPressed && key === 'v' && !event.shiftKey;
      const isOrganize = event.altKey && event.shiftKey && key === 'f' && !commandPressed;

      if (event.key === 'Escape') {
        if (placementActive) {
          event.preventDefault();
          cancelPlacement();
          return;
        }
        if (nodeMenuOpen) {
          event.preventDefault();
          closeNodeMenu();
        }
        return;
      }

      if (isOrganize) {
        event.preventDefault();
        organizeCanvas();
        return;
      }

      if (isCopy) {
        if (!canCopySelection) {
          return;
        }
        event.preventDefault();
        copySelection();
        return;
      }

      if (isPaste) {
        pasteSelection();
        return;
      }

      if (isUndo || isRedo) {
        event.preventDefault();
        if (isUndo) {
          undo();
        } else {
          redo();
        }
        return;
      }

      if (isGroup) {
        if (!canGroupSelection) {
          return;
        }
        event.preventDefault();
        groupSelection();
        return;
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace')
        && deleteSelection()
      ) {
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    canCopySelection,
    canGroupSelection,
    cancelPlacement,
    closeNodeMenu,
    copySelection,
    deleteSelection,
    groupSelection,
    nodeMenuOpen,
    organizeCanvas,
    pasteSelection,
    placementActive,
    redo,
    undo,
  ]);
}
