// Copyright (c) 2026 AI anime
import { useMemo, useRef, type RefObject } from 'react';

import {
  captureCurrentViewport,
  jumpToBookmark,
  useCanvasViewportBookmarkShortcuts,
  type CanvasViewportBookmarkCommands,
  type CanvasViewportPort,
} from '@/modules/creative_canvas/public';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';

import {
  useCanvasEdgePan,
  type CanvasEdgePanController,
} from './useCanvasEdgePan';
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

export interface CanvasViewportRuntimeControllerOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  viewportPort: CanvasViewportPort;
  transformStore: CanvasTransformStorePort;
  commitViewport: (viewport: CanvasViewportSnapshot) => void;
  setViewportSize: (size: CanvasViewportSize) => void;
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
  commitViewport,
  setViewportSize,
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
      clearBookmarks: () => useCanvasStore.getState().clearViewportBookmarks(),
      captureBookmark: (index) => {
        useCanvasStore
          .getState()
          .setViewportBookmark(index, captureCurrentViewport(viewportPort));
      },
      jumpToBookmarkSlot: (index) => {
        const bookmark = useCanvasStore.getState().viewportBookmarks[index];
        if (bookmark) {
          jumpToBookmark(viewportPort, bookmark);
        }
      },
    }),
    [viewportPort],
  );
  useCanvasViewportBookmarkShortcuts({
    ...viewportBookmarkCommands,
    isImmersiveViewerActive,
  });

  // Hydration completes before Canvas mounts, so React Flow must receive the restored camera once.
  const initialViewportRef = useRef(useCanvasStore.getState().currentViewport);

  return {
    initialViewport: initialViewportRef.current,
    handleMove,
    handleMoveEnd,
    handleEdgeClick,
  };
}
