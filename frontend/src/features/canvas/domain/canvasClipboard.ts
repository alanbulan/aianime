// Copyright (c) 2026 AI anime
import type { CanvasEdge, CanvasNode } from './canvasNodes';

export interface CanvasClipboardSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  sourceProject: string | null;
}
