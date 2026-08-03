// Copyright (c) 2026 AI anime
import {
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type { EdgeChange, NodeChange } from '@xyflow/react';

import {
  canDeleteCanvasEdge,
  filterPresetManagedEdgeChanges,
  filterPresetManagedNodeChanges,
} from '@/modules/creative_canvas/public';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';

export interface CanvasGraphChangeControllerOptions {
  getGraph: () => {
    nodes: readonly CanvasNode[];
    edges: readonly CanvasEdge[];
  };
  isCopyDragActive: () => boolean;
  alignNodeChanges: (params: {
    nodes: readonly CanvasNode[];
    changes: NodeChange<CanvasNode>[];
    copyDragActive: boolean;
  }) => NodeChange<CanvasNode>[];
  applyNodeChanges: (changes: NodeChange<CanvasNode>[]) => void;
  applyEdgeChanges: (changes: EdgeChange<CanvasEdge>[]) => void;
  deleteEdge: (edgeId: string) => void;
}

export interface CanvasGraphChangeController {
  handleNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  handleEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  handleEdgeDoubleClick: (
    event: ReactMouseEvent,
    edge: CanvasEdge,
  ) => void;
}

export function useCanvasGraphChangeController({
  getGraph,
  isCopyDragActive,
  alignNodeChanges,
  applyNodeChanges,
  applyEdgeChanges,
  deleteEdge,
}: CanvasGraphChangeControllerOptions): CanvasGraphChangeController {
  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
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
    (changes: EdgeChange<CanvasEdge>[]) => {
      const { edges } = getGraph();
      const unlockedChanges = filterPresetManagedEdgeChanges(edges, changes);
      if (unlockedChanges.length > 0) {
        applyEdgeChanges(unlockedChanges);
      }
    },
    [applyEdgeChanges, getGraph],
  );

  const handleEdgeDoubleClick = useCallback(
    (event: ReactMouseEvent, edge: CanvasEdge) => {
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
