// Copyright (c) 2026 AI anime
import { NodeResizeControl } from '@xyflow/react';

export interface NodeResizeHandleProps {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  visible?: boolean;
  keepAspectRatio?: boolean;
}

const DEFAULT_MIN_WIDTH = 160;
const DEFAULT_MIN_HEIGHT = 100;
const DEFAULT_MAX_WIDTH = 1400;
const DEFAULT_MAX_HEIGHT = 1400;

export function NodeResizeHandle({
  minWidth = DEFAULT_MIN_WIDTH,
  minHeight = DEFAULT_MIN_HEIGHT,
  maxWidth = DEFAULT_MAX_WIDTH,
  maxHeight = DEFAULT_MAX_HEIGHT,
  visible = false,
  keepAspectRatio,
}: NodeResizeHandleProps) {
  return (
    <NodeResizeControl
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      keepAspectRatio={keepAspectRatio}
      position="bottom-right"
      className={`!h-5 !w-5 !min-h-0 !min-w-0 !rounded-none !border-0 !bg-transparent !p-0 transition-opacity duration-100 hover:!opacity-100 focus-within:!opacity-100 ${visible ? '!opacity-100' : '!opacity-0'}`}
    >
      <div className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-foreground/35 transition-colors hover:border-primary" />
    </NodeResizeControl>
  );
}
