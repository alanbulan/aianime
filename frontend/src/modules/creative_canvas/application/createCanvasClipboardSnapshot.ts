// Copyright (c) 2026 AI anime
import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';

export interface CanvasClipboardSnapshotNode {
  id: string;
}

export interface CanvasClipboardSnapshotEdge {
  source: string;
  target: string;
}

export interface CreateCanvasClipboardSnapshotParams<
  TNode extends CanvasClipboardSnapshotNode,
  TEdge extends CanvasClipboardSnapshotEdge,
> {
  nodes: readonly TNode[];
  edges: readonly TEdge[];
  selectedNodeIds: readonly string[];
  sourceProject: string | null;
  cloneNode(
    node: TNode,
    state: { selected: false; dragging: false },
  ): TNode;
  cloneEdge(edge: TEdge): TEdge;
}

export function createCanvasClipboardSnapshot<
  TNode extends CanvasClipboardSnapshotNode,
  TEdge extends CanvasClipboardSnapshotEdge,
>({
  nodes,
  edges,
  selectedNodeIds,
  sourceProject,
  cloneNode,
  cloneEdge,
}: CreateCanvasClipboardSnapshotParams<TNode, TEdge>): CanvasClipboardSnapshot<
  TNode,
  TEdge
> | null {
  const selectedIdSet = new Set(selectedNodeIds);
  const selectedNodes = nodes
    .filter((node) => selectedIdSet.has(node.id))
    .map((node) => cloneNode(node, { selected: false, dragging: false }));
  if (selectedNodes.length === 0) {
    return null;
  }

  return {
    nodes: selectedNodes,
    edges: edges
      .filter(
        (edge) =>
          selectedIdSet.has(edge.source) && selectedIdSet.has(edge.target),
      )
      .map(cloneEdge),
    sourceProject,
  };
}
