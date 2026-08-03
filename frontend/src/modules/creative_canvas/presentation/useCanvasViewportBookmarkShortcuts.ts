// Copyright (c) 2026 AI anime
import { useEffect } from 'react';

import { digitToBookmarkIndex } from '@/modules/creative_canvas/domain/viewportBookmarks';
import { isTypingTarget } from './canvasInteractionTargets';

export interface CanvasViewportBookmarkCommands {
  clearBookmarks: () => void;
  captureBookmark: (index: number) => void;
  jumpToBookmarkSlot: (index: number) => void;
}

export interface CanvasViewportBookmarkShortcutOptions
  extends CanvasViewportBookmarkCommands {
  isImmersiveViewerActive: () => boolean;
}

export function useCanvasViewportBookmarkShortcuts({
  clearBookmarks,
  captureBookmark,
  jumpToBookmarkSlot,
  isImmersiveViewerActive,
}: CanvasViewportBookmarkShortcutOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || isImmersiveViewerActive()) {
        return;
      }
      const commandPressed = event.ctrlKey || event.metaKey;

      if (commandPressed && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        clearBookmarks();
        return;
      }
      if (event.shiftKey || event.altKey) {
        return;
      }

      const index = digitToBookmarkIndex(event.key);
      if (index === null) {
        return;
      }
      event.preventDefault();
      if (commandPressed) {
        captureBookmark(index);
        return;
      }
      jumpToBookmarkSlot(index);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    captureBookmark,
    clearBookmarks,
    isImmersiveViewerActive,
    jumpToBookmarkSlot,
  ]);
}
