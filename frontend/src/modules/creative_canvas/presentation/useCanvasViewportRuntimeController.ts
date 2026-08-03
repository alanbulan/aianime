// Copyright (c) 2026 AI anime
import { useMemo, useRef, type RefObject } from 'react';

import {
  captureCurrentViewport,
  jumpToBookmark,
  type CanvasViewportPort,
} from '@/modules/creative_canvas/application/bookmarkActions';
import type { ViewportBookmark } from '@/modules/creative_canvas/domain/viewportBookmarks';
import {
  useCanvasEdgePan,
  type CanvasEdgePanController,
} from './useCanvasEdgePan';
import {
  useCanvasViewportBookmarkShortcuts,
  type CanvasViewportBookmarkCommands,
} from './useCanvasViewportBookmarkShortcuts';
import {
  useCanvasViewportCommit,
  type CanvasViewportCommitController,
  type CanvasViewportSnapshot,
} from './useCanvasViewportCommit';
import {
  useCanvasViewportMetrics,
  type CanvasTransformStorePort,
  type CanvasViewportSize,
} from './useCanvasViewportMetrics';

export interface CanvasViewportBookmarkStorePort {
  getCurrentViewport: () => ViewportBookmark;
  clearBookmarks: () => void;
  setBookmark: (index: number, bookmark: ViewportBookmark) => void;
  getBookmark: (index: number) => ViewportBookmark | null | undefined;
}

export interface CanvasViewportRuntimeControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  viewportPort: CanvasViewportPort;
  transformStore: CanvasTransformStorePort;
  bookmarkStore: CanvasViewportBookmarkStorePort;
  commitViewport: (viewport: CanvasViewportSnapshot) => void;
  setViewportSize: (size: CanvasViewportSize) => void;
  isImmersiveViewerActive: () => boolean;
}

export interface CanvasViewportRuntimeController
  extends CanvasViewportCommitController,
    CanvasEdgePanController {
  initialViewport: CanvasViewportSnapshot;
}

export function useCanvasViewportRuntimeController({
  wrapperRef,
  viewportPort,
  transformStore,
  bookmarkStore,
  commitViewport,
  setViewportSize,
  isImmersiveViewerActive,
}: CanvasViewportRuntimeControllerOptions): CanvasViewportRuntimeController {
  useCanvasViewportMetrics({
    wrapperRef,
    transformStore,
    setViewportSize,
  });
  const { handleMove, handleMoveEnd } = useCanvasViewportCommit(commitViewport);
  const { handleEdgeClick } = useCanvasEdgePan({
    wrapperRef,
    viewportPort,
    commitViewport,
  });
  const viewportBookmarkCommands = useMemo<CanvasViewportBookmarkCommands>(
    () => ({
      clearBookmarks: bookmarkStore.clearBookmarks,
      captureBookmark: (index) => {
        bookmarkStore.setBookmark(index, captureCurrentViewport(viewportPort));
      },
      jumpToBookmarkSlot: (index) => {
        const bookmark = bookmarkStore.getBookmark(index);
        if (bookmark) {
          jumpToBookmark(viewportPort, bookmark);
        }
      },
    }),
    [bookmarkStore, viewportPort],
  );
  useCanvasViewportBookmarkShortcuts({
    ...viewportBookmarkCommands,
    isImmersiveViewerActive,
  });

  const initialViewportRef = useRef(bookmarkStore.getCurrentViewport());

  return {
    initialViewport: initialViewportRef.current,
    handleMove,
    handleMoveEnd,
    handleEdgeClick,
  };
}
