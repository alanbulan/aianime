// Copyright (c) 2026 AI anime
import {
  isPresetManagedEdge,
  type MainlineEdgeLike,
} from "./mainlineNodeFlags";

export interface CanvasEdgeDeletionLike extends MainlineEdgeLike {
  id: string;
}

export function canDeleteCanvasEdge<TEdge extends CanvasEdgeDeletionLike>(
  edge: TEdge | undefined,
): edge is TEdge {
  return Boolean(edge && !isPresetManagedEdge(edge));
}

export function deleteCanvasEdge<TEdge extends CanvasEdgeDeletionLike>(
  edges: readonly TEdge[],
  edgeId: string,
): TEdge[] | null {
  const edge = edges.find((candidate) => candidate.id === edgeId);
  if (!canDeleteCanvasEdge(edge)) return null;
  return edges.filter((candidate) => candidate.id !== edgeId);
}
