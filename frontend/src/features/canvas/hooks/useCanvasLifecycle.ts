// Copyright (c) 2026 AI anime
import { useEffect, type RefObject } from 'react';

import {
  resolveCanvasOriginViewport,
  type ViewportBookmark,
} from '@/modules/creative_canvas/public';

export interface CanvasLifecycleOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  isCanvasEmpty: () => boolean;
  setViewport: (viewport: ViewportBookmark) => void;
  closeImageViewer: () => void;
}

export function useCanvasLifecycle({
  wrapperRef,
  isCanvasEmpty,
  setViewport,
  closeImageViewer,
}: CanvasLifecycleOptions): void {
  useEffect(() => {
    if (isCanvasEmpty()) {
      setViewport(
        resolveCanvasOriginViewport(wrapperRef.current?.getBoundingClientRect()),
      );
    }
    return closeImageViewer;
  }, [closeImageViewer, isCanvasEmpty, setViewport, wrapperRef]);
}
