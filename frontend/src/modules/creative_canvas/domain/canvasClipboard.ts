// Copyright (c) 2026 AI anime
export interface CanvasClipboardSnapshot<TNode, TEdge> {
  nodes: TNode[];
  edges: TEdge[];
  sourceProject: string | null;
}
