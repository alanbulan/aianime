// Copyright (c) 2026 AI anime
import type { CanvasEdge } from './canvasNodes';
import { isPresetManagedEdge } from './mainlineNodeFlags';

export function canDeleteCanvasEdge(
  edge: CanvasEdge | undefined,
): edge is CanvasEdge {
  if (!edge) {
    return false;
  }
  return !isPresetManagedEdge(edge);
}

export function deleteCanvasEdge(
  edges: readonly CanvasEdge[],
  edgeId: string,
): CanvasEdge[] | null {
  const edge = edges.find((candidate) => candidate.id === edgeId);
  if (!canDeleteCanvasEdge(edge)) {
    return null;
  }

  return edges.filter((candidate) => candidate.id !== edgeId);
}
