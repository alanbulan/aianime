// Copyright (c) 2026 AI anime
import type { CanvasEdge } from './canvasNodes';
import { isPresetManagedEdge } from './mainlineNodeFlags';

export function deleteCanvasEdge(
  edges: readonly CanvasEdge[],
  edgeId: string,
): CanvasEdge[] | null {
  const edge = edges.find((candidate) => candidate.id === edgeId);
  if (!edge || isPresetManagedEdge(edge)) {
    return null;
  }

  return edges.filter((candidate) => candidate.id !== edgeId);
}
