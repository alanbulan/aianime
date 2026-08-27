// Copyright (c) 2026 AI anime
import { useReactFlow } from '@xyflow/react';


import {
  CanvasMinimapBookmarksOverlay,
  captureCurrentViewport,
  jumpToBookmark,
} from '@/modules/creative_canvas/presentation/canvas-shell/internal';

import { useCanvasStore } from "@/modules/creative_canvas/presentation/canvas-shell/internal";
export interface CanvasMinimapBookmarksOverlayAdapterProps {
  onHoverChange?: (hovered: boolean) => void;
}

export function CanvasMinimapBookmarksOverlayAdapter({
  onHoverChange,
}: CanvasMinimapBookmarksOverlayAdapterProps) {
  const viewportPort = useReactFlow();
  const bookmarks = useCanvasStore((state) => state.viewportBookmarks);
  const currentViewport = useCanvasStore((state) => state.currentViewport);
  const canvasViewportSize = useCanvasStore(
    (state) => state.canvasViewportSize,
  );
  const nodeCount = useCanvasStore((state) => state.nodes.length);
  const setViewportBookmark = useCanvasStore(
    (state) => state.setViewportBookmark,
  );
  const clearViewportBookmarks = useCanvasStore(
    (state) => state.clearViewportBookmarks,
  );

  return (
    <CanvasMinimapBookmarksOverlay
      bookmarks={bookmarks}
      currentViewport={currentViewport}
      canvasViewportSize={canvasViewportSize}
      nodeCount={nodeCount}
      onSetCurrent={(index) => {
        setViewportBookmark(index, captureCurrentViewport(viewportPort));
      }}
      onJump={(index) => {
        const bookmark = bookmarks[index];
        if (bookmark) jumpToBookmark(viewportPort, bookmark);
      }}
      onDelete={(index) => setViewportBookmark(index, null)}
      onClearAll={clearViewportBookmarks}
      onHoverChange={onHoverChange}
    />
  );
}
