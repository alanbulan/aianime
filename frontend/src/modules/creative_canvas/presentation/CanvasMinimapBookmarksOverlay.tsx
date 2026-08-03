// Copyright (c) 2026 AI anime
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  bookmarkCenterInFlow,
  bookmarkIndexToDigit,
  projectToMinimap,
  type MinimapViewBox,
  type ViewportBookmark,
  type ViewportBookmarks,
} from '@/modules/creative_canvas/domain/viewportBookmarks';
import { CanvasViewportBookmarks } from './CanvasViewportBookmarks';

interface MinimapMetrics {
  left: number;
  top: number;
  width: number;
  height: number;
  viewBox: MinimapViewBox | null;
}

export interface CanvasMinimapBookmarksOverlayProps {
  bookmarks: ViewportBookmarks;
  currentViewport: ViewportBookmark;
  canvasViewportSize: { width: number; height: number };
  nodeCount: number;
  onSetCurrent: (index: number) => void;
  onJump: (index: number) => void;
  onDelete: (index: number) => void;
  onClearAll: () => void;
  onHoverChange?: (hovered: boolean) => void;
}

const ROW_GAP = 8;
const ROW_HEIGHT = 32;

export function CanvasMinimapBookmarksOverlay({
  bookmarks,
  currentViewport,
  canvasViewportSize,
  nodeCount,
  onSetCurrent,
  onJump,
  onDelete,
  onClearAll,
  onHoverChange,
}: CanvasMinimapBookmarksOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<MinimapMetrics | null>(null);

  useLayoutEffect(() => {
    const overlay = containerRef.current;
    const pane = overlay?.closest('.react-flow') as HTMLElement | null;
    if (!pane) return;

    let animationFrame = 0;
    const measure = () => {
      const minimap = pane.querySelector(
        '.react-flow__minimap',
      ) as HTMLElement | null;
      if (!minimap) {
        setMetrics(null);
        return;
      }
      const paneRect = pane.getBoundingClientRect();
      const mapRect = minimap.getBoundingClientRect();
      const svg = minimap.querySelector(
        '.react-flow__minimap-svg',
      ) as SVGSVGElement | null;
      let viewBox: MinimapViewBox | null = null;
      if (svg?.viewBox.baseVal) {
        const value = svg.viewBox.baseVal;
        if (value.width > 0 && value.height > 0) {
          viewBox = {
            x: value.x,
            y: value.y,
            width: value.width,
            height: value.height,
          };
        }
      }
      setMetrics({
        left: mapRect.left - paneRect.left,
        top: mapRect.top - paneRect.top,
        width: mapRect.width,
        height: mapRect.height,
        viewBox,
      });
    };

    measure();
    animationFrame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [bookmarks, currentViewport, nodeCount]);

  const activeIndex = useMemo(
    () => bookmarks.findIndex(
      (bookmark) =>
        bookmark !== null
        && Math.abs(currentViewport.x - bookmark.x) < 1
        && Math.abs(currentViewport.y - bookmark.y) < 1
        && Math.abs(currentViewport.zoom - bookmark.zoom) < 0.005,
    ),
    [bookmarks, currentViewport],
  );
  const viewBox = metrics?.viewBox ?? null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-[10001]"
    >
      {metrics ? (
        <div
          className="pointer-events-auto absolute"
          style={{
            left: metrics.left,
            top: metrics.top - ROW_GAP - ROW_HEIGHT,
            width: metrics.width,
            paddingBottom: ROW_GAP,
          }}
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
        >
          <CanvasViewportBookmarks
            bookmarks={bookmarks}
            activeIndex={activeIndex}
            onJump={onJump}
            onSetCurrent={onSetCurrent}
            onDelete={onDelete}
            onClearAll={onClearAll}
          />
        </div>
      ) : null}

      {metrics && viewBox && canvasViewportSize.width > 0
        ? bookmarks.map((bookmark, index) => {
            if (!bookmark) return null;
            const center = bookmarkCenterInFlow(bookmark, canvasViewportSize);
            const point = projectToMinimap(center, viewBox, {
              width: metrics.width,
              height: metrics.height,
            });
            return (
              <div
                key={index}
                className="pointer-events-none absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background shadow"
                style={{
                  left: metrics.left + point.x,
                  top: metrics.top + point.y,
                }}
              >
                {bookmarkIndexToDigit(index)}
              </div>
            );
          })
        : null}
    </div>
  );
}
