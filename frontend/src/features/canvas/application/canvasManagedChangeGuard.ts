// Copyright (c) 2026 AI anime
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';
import {
  isPresetManagedEdge,
  isPresetManagedNode,
} from '@/modules/creative_canvas/public';

export interface CanvasChangeLike {
  type: string;
  id?: string;
}

export function filterPresetManagedNodeChanges<TChange extends CanvasChangeLike>(
  nodes: readonly CanvasNode[],
  changes: readonly TChange[],
): TChange[] {
  const lockedNodeIds = new Set(
    nodes.filter(isPresetManagedNode).map((node) => node.id),
  );
  return changes.filter(
    (change) =>
      !change.id
      || !lockedNodeIds.has(change.id)
      || change.type !== 'remove',
  );
}

export function filterPresetManagedEdgeChanges<TChange extends CanvasChangeLike>(
  edges: readonly CanvasEdge[],
  changes: readonly TChange[],
): TChange[] {
  const lockedEdgeIds = new Set(
    edges.filter(isPresetManagedEdge).map((edge) => edge.id),
  );
  return changes.filter(
    (change) =>
      !change.id
      || !lockedEdgeIds.has(change.id)
      || change.type === 'select',
  );
}
