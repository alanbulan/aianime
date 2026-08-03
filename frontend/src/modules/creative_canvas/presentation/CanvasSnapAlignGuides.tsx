// Copyright (c) 2026 AI anime
import { useViewport } from '@xyflow/react';

import { useSnapAlignStore } from './snapAlignStore';

export function CanvasSnapAlignGuides() {
  const guides = useSnapAlignStore((state) => state.guides);
  const { x: viewportX, y: viewportY, zoom } = useViewport();

  if (guides.vertical.length === 0 && guides.horizontal.length === 0) {
    return null;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
      style={{ overflow: 'visible' }}
    >
      {guides.vertical.map((flowX) => {
        const screenX = viewportX + flowX * zoom;
        return (
          <line
            key={`v-${flowX}`}
            x1={screenX}
            x2={screenX}
            y1={0}
            y2="100%"
            stroke="rgb(var(--accent-rgb))"
            strokeWidth={1}
            strokeDasharray="6 6"
          />
        );
      })}
      {guides.horizontal.map((flowY) => {
        const screenY = viewportY + flowY * zoom;
        return (
          <line
            key={`h-${flowY}`}
            y1={screenY}
            y2={screenY}
            x1={0}
            x2="100%"
            stroke="rgb(var(--accent-rgb))"
            strokeWidth={1}
            strokeDasharray="6 6"
          />
        );
      })}
    </svg>
  );
}
