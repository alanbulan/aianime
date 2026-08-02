// Copyright (c) 2026 AI anime
import { useEffect } from 'react';

import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';

import { digitToBookmarkIndex } from '../domain/viewportBookmarks';
import { isTypingTarget } from '@/modules/creative_canvas/public';

export interface CanvasViewportBookmarkCommands {
  clearBookmarks: () => void;
  captureBookmark: (index: number) => void;
  jumpToBookmarkSlot: (index: number) => void;
}

export function useCanvasViewportBookmarkShortcuts({
  clearBookmarks,
  captureBookmark,
  jumpToBookmarkSlot,
}: CanvasViewportBookmarkCommands): void {
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
  }, [captureBookmark, clearBookmarks, jumpToBookmarkSlot]);
}
