// Copyright (c) 2026 AI anime
import {
  isPresetManagedEdge,
  isPresetManagedNode,
  type MainlineEdgeLike,
  type MainlineNodeLike,
} from "../domain/mainlineNodeFlags";

export interface CanvasChangeLike {
  type: string;
  id?: string;
}

export interface CanvasManagedNodeLike extends MainlineNodeLike {
  id: string;
}

export interface CanvasManagedEdgeLike extends MainlineEdgeLike {
  id: string;
}

export function filterPresetManagedNodeChanges<TChange extends CanvasChangeLike>(
  nodes: readonly CanvasManagedNodeLike[],
  changes: readonly TChange[],
): TChange[] {
  const lockedNodeIds = new Set(
    nodes.filter(isPresetManagedNode).map((node) => node.id),
  );
  return changes.filter(
    (change) =>
      !change.id ||
      !lockedNodeIds.has(change.id) ||
      change.type !== "remove",
  );
}

export function filterPresetManagedEdgeChanges<TChange extends CanvasChangeLike>(
  edges: readonly CanvasManagedEdgeLike[],
  changes: readonly TChange[],
): TChange[] {
  const lockedEdgeIds = new Set(
    edges.filter(isPresetManagedEdge).map((edge) => edge.id),
  );
  return changes.filter(
    (change) =>
      !change.id ||
      !lockedEdgeIds.has(change.id) ||
      change.type === "select",
  );
}
