// Copyright (c) 2026 AI anime
import { useEffect, type RefObject } from 'react';

export interface CanvasTransformStorePort {
  getState: () => {
    transform: readonly [number, number, number];
  };
  subscribe: (listener: () => void) => () => void;
}

export interface CanvasViewportSize {
  width: number;
  height: number;
}

export interface CanvasViewportMetricsOptions {
  wrapperRef: RefObject<HTMLDivElement | null>;
  transformStore: CanvasTransformStorePort;
  setViewportSize: (size: CanvasViewportSize) => void;
}

export function useCanvasViewportMetrics({
  wrapperRef,
  transformStore,
  setViewportSize,
}: CanvasViewportMetricsOptions): void {
  useEffect(() => {
    const root = document.documentElement;
    let lastZoom = Number.NaN;
    const writeZoom = () => {
      const zoom = transformStore.getState().transform[2];
      if (zoom === lastZoom) {
        return;
      }
      lastZoom = zoom;
      root.style.setProperty('--ai-anime-canvas-zoom', String(zoom));
    };

    writeZoom();
    return transformStore.subscribe(writeZoom);
  }, [transformStore]);

  useEffect(() => {
    const wrapperElement = wrapperRef.current;
    if (!wrapperElement) {
      return;
    }

    const updateSize = () => {
      const rect = wrapperElement.getBoundingClientRect();
      setViewportSize({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(wrapperElement);
    return () => observer.disconnect();
  }, [setViewportSize, wrapperRef]);
}
