// Copyright (c) 2026 AI anime
import {
  isPresetManagedNode,
  type MainlineNodeLike,
} from "./mainlineNodeFlags";

export interface CanvasNodeDeletionNode extends MainlineNodeLike {
  id: string;
  parentId?: string;
  extent?: unknown;
  position: { x: number; y: number };
}

export interface CanvasNodeDeletionEdge {
  source: string;
  target: string;
}

export type ResolveCanvasNodeAbsolutePosition<
  TNode extends CanvasNodeDeletionNode,
> = (
  node: TNode,
  nodeMap: ReadonlyMap<string, TNode>,
) => { x: number; y: number };

export interface CanvasNodeDeletionResult<
  TNode extends CanvasNodeDeletionNode,
  TEdge extends CanvasNodeDeletionEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
  deletedNodeIds: ReadonlySet<string>;
}

export function collectNodeIdsWithDescendants<
  TNode extends Pick<CanvasNodeDeletionNode, "id" | "parentId">,
>(nodes: readonly TNode[], seedIds: Iterable<string>): Set<string> {
  const collected = new Set(seedIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (!node.parentId || collected.has(node.id)) {
        continue;
      }
      if (collected.has(node.parentId)) {
        collected.add(node.id);
        changed = true;
      }
    }
  }

  return collected;
}

export function deleteCanvasNodes<
  TNode extends CanvasNodeDeletionNode,
  TEdge extends CanvasNodeDeletionEdge,
>(
  nodes: readonly TNode[],
  edges: readonly TEdge[],
  nodeIds: Iterable<string>,
  resolveAbsolutePosition: ResolveCanvasNodeAbsolutePosition<TNode>,
): CanvasNodeDeletionResult<TNode, TEdge> | null {
  const uniqueIds = Array.from(
    new Set(Array.from(nodeIds).filter((nodeId) => nodeId.trim().length > 0)),
  );
  if (uniqueIds.length === 0) {
    return null;
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const existingIds = uniqueIds.filter((nodeId) => {
    const node = nodeMap.get(nodeId);
    return Boolean(node && !isPresetManagedNode(node));
  });
  if (existingIds.length === 0) {
    return null;
  }

  const deletedNodeIds = collectNodeIdsWithDescendants(nodes, existingIds);
  for (const node of nodes) {
    if (deletedNodeIds.has(node.id) && isPresetManagedNode(node)) {
      deletedNodeIds.delete(node.id);
    }
  }

  const nextNodes = nodes
    .filter((node) => !deletedNodeIds.has(node.id))
    .map((node): TNode => {
      if (!node.parentId || !deletedNodeIds.has(node.parentId)) {
        return node;
      }
      const absolute = resolveAbsolutePosition(node, nodeMap);
      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        position: {
          x: Math.round(absolute.x),
          y: Math.round(absolute.y),
        },
      };
    });
  const nextEdges = edges.filter(
    (edge) =>
      !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target),
  );

  return {
    nodes: nextNodes,
    edges: nextEdges,
    deletedNodeIds,
  };
}

export function collectBatchDeletableIds<
  TNode extends CanvasNodeDeletionNode,
>(
  nodes: readonly TNode[],
  selectedIds: Iterable<string>,
  isGroupNode: (node: TNode) => boolean,
): string[] {
  const selectedSet = new Set(selectedIds);
  const deletable = new Set<string>();

  for (const node of nodes) {
    if (selectedSet.has(node.id) && !isPresetManagedNode(node)) {
      deletable.add(node.id);
    }
  }

  const childTally = new Map<
    string,
    { total: number; selected: number; hasLocked: boolean }
  >();
  for (const node of nodes) {
    if (!node.parentId) {
      continue;
    }
    const tally =
      childTally.get(node.parentId) ?? { total: 0, selected: 0, hasLocked: false };
    tally.total += 1;
    if (selectedSet.has(node.id)) {
      tally.selected += 1;
    }
    if (isPresetManagedNode(node)) {
      tally.hasLocked = true;
    }
    childTally.set(node.parentId, tally);
  }

  for (const node of nodes) {
    if (!isGroupNode(node)) {
      continue;
    }
    if (deletable.has(node.id) || isPresetManagedNode(node)) {
      continue;
    }
    const tally = childTally.get(node.id);
    if (
      tally &&
      tally.total > 0 &&
      tally.total === tally.selected &&
      !tally.hasLocked
    ) {
      deletable.add(node.id);
    }
  }

  return Array.from(deletable);
}
