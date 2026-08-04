// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import {
  resolveCanvasUpstreamDetachmentEdgeIds,
  type CanvasUpstreamDetachmentEdge,
} from '../domain/canvasUpstreamDetachment';

export type CanvasUpstreamEdgeDeletion = (edgeId: string) => void;

export interface DetachUpstreamDependencies {
  useDeleteEdge: () => CanvasUpstreamEdgeDeletion;
  readEdges: () => readonly CanvasUpstreamDetachmentEdge[];
}

export function createUseDetachUpstream({
  useDeleteEdge,
  readEdges,
}: DetachUpstreamDependencies) {
  return function useDetachUpstream(targetNodeId: string) {
    const deleteEdge = useDeleteEdge();

    return useCallback(
      (sourceNodeId: string) => {
        resolveCanvasUpstreamDetachmentEdgeIds(
          readEdges(),
          sourceNodeId,
          targetNodeId,
        ).forEach((edgeId) => deleteEdge(edgeId));
      },
      [deleteEdge, targetNodeId],
    );
  };
}
