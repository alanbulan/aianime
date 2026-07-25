// Copyright (c) 2026 AI anime
import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import { cloneCanvasNodeData } from './canvasNodeData';

export interface CreateCanvasClipboardSnapshotParams {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  selectedNodeIds: readonly string[];
  sourceProject: string | null;
}

export function createCanvasClipboardSnapshot({
  nodes,
  edges,
  selectedNodeIds,
  sourceProject,
}: CreateCanvasClipboardSnapshotParams): CanvasClipboardSnapshot | null {
  const selectedIdSet = new Set(selectedNodeIds);
  const selectedNodes = nodes
    .filter((node) => selectedIdSet.has(node.id))
    .map((node) => ({
      ...node,
      data: cloneCanvasNodeData(node.data),
      selected: false,
      dragging: false,
    }));
  if (selectedNodes.length === 0) {
    return null;
  }

  return {
    nodes: selectedNodes,
    edges: edges
      .filter((edge) => selectedIdSet.has(edge.source) && selectedIdSet.has(edge.target))
      .map((edge) => ({ ...edge })),
    sourceProject,
  };
}
