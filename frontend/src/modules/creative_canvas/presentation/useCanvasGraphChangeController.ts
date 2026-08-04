// Copyright (c) 2026 AI anime
import { useCallback } from 'react';

import {
  filterPresetManagedEdgeChanges,
  filterPresetManagedNodeChanges,
  type CanvasChangeLike,
  type CanvasManagedEdgeLike,
  type CanvasManagedNodeLike,
} from '../application/canvasManagedChangeGuard';
import {
  canDeleteCanvasEdge,
  type CanvasEdgeDeletionLike,
} from '../domain/canvasEdgeDeletion';

export interface CanvasGraphChangeEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

export interface CanvasGraphChangeControllerOptions<
  TNode extends CanvasManagedNodeLike,
  TEdge extends CanvasManagedEdgeLike & CanvasEdgeDeletionLike,
  TNodeChange extends CanvasChangeLike,
  TEdgeChange extends CanvasChangeLike,
> {
  getGraph: () => {
    nodes: readonly TNode[];
    edges: readonly TEdge[];
  };
  isCopyDragActive: () => boolean;
  alignNodeChanges: (params: {
    nodes: readonly TNode[];
    changes: TNodeChange[];
    copyDragActive: boolean;
  }) => TNodeChange[];
  applyNodeChanges: (changes: TNodeChange[]) => void;
  applyEdgeChanges: (changes: TEdgeChange[]) => void;
  deleteEdge: (edgeId: string) => void;
}

export interface CanvasGraphChangeController<
  TEdge,
  TNodeChange,
  TEdgeChange,
> {
  handleNodesChange: (changes: TNodeChange[]) => void;
  handleEdgesChange: (changes: TEdgeChange[]) => void;
  handleEdgeDoubleClick: (
    event: CanvasGraphChangeEvent,
    edge: TEdge,
  ) => void;
}

export function useCanvasGraphChangeController<
  TNode extends CanvasManagedNodeLike,
  TEdge extends CanvasManagedEdgeLike & CanvasEdgeDeletionLike,
  TNodeChange extends CanvasChangeLike,
  TEdgeChange extends CanvasChangeLike,
>({
  getGraph,
  isCopyDragActive,
  alignNodeChanges,
  applyNodeChanges,
  applyEdgeChanges,
  deleteEdge,
}: CanvasGraphChangeControllerOptions<
  TNode,
  TEdge,
  TNodeChange,
  TEdgeChange
>): CanvasGraphChangeController<TEdge, TNodeChange, TEdgeChange> {
  const handleNodesChange = useCallback(
    (changes: TNodeChange[]) => {
      const { nodes } = getGraph();
      const unlockedChanges = filterPresetManagedNodeChanges(nodes, changes);
      if (unlockedChanges.length === 0) {
        return;
      }
      applyNodeChanges(alignNodeChanges({
        nodes,
        changes: unlockedChanges,
        copyDragActive: isCopyDragActive(),
      }));
    },
    [alignNodeChanges, applyNodeChanges, getGraph, isCopyDragActive],
  );

  const handleEdgesChange = useCallback(
    (changes: TEdgeChange[]) => {
      const { edges } = getGraph();
      const unlockedChanges = filterPresetManagedEdgeChanges(edges, changes);
      if (unlockedChanges.length > 0) {
        applyEdgeChanges(unlockedChanges);
      }
    },
    [applyEdgeChanges, getGraph],
  );

  const handleEdgeDoubleClick = useCallback(
    (event: CanvasGraphChangeEvent, edge: TEdge) => {
      event.preventDefault();
      event.stopPropagation();
      if (canDeleteCanvasEdge(edge)) {
        deleteEdge(edge.id);
      }
    },
    [deleteEdge],
  );

  return {
    handleNodesChange,
    handleEdgesChange,
    handleEdgeDoubleClick,
  };
}
