// Copyright (c) 2026 AI anime
export interface CanvasUpstreamDetachmentEdge {
  id: string;
  source: string;
  target: string;
}

export function resolveCanvasUpstreamDetachmentEdgeIds(
  edges: readonly CanvasUpstreamDetachmentEdge[],
  sourceNodeId: string,
  targetNodeId: string,
): string[] {
  return edges
    .filter(
      (edge) => edge.source === sourceNodeId && edge.target === targetNodeId,
    )
    .map((edge) => edge.id);
}
