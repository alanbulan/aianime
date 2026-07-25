// Copyright (c) 2026 AI anime
import {
  isGroupNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  type CanvasNode,
} from './canvasNodes';

export type CanvasAutoGroupSpawnPlan =
  | {
      kind: 'create_group';
      nodeIds: string[];
    }
  | {
      kind: 'append_to_group';
      nodes: CanvasNode[];
      groupNodeId: string;
    };

export function planCanvasAutoGroupSpawn(
  nodes: readonly CanvasNode[],
  sourceNodeId: string,
  spawnedNodeIds: Iterable<string>,
): CanvasAutoGroupSpawnPlan | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const source = nodeMap.get(sourceNodeId);
  if (!source) {
    return null;
  }

  const spawned = Array.from(spawnedNodeIds)
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is CanvasNode => Boolean(node && !node.parentId));
  if (spawned.length === 0) {
    return null;
  }

  let enclosingGroup: CanvasNode | null = null;
  let parentId = source.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodeMap.get(parentId);
    if (!parent) {
      break;
    }
    if (isGroupNode(parent)) {
      enclosingGroup = parent;
      break;
    }
    parentId = parent.parentId;
  }

  if (!enclosingGroup) {
    return {
      kind: 'create_group',
      nodeIds: [sourceNodeId, ...spawned.map((node) => node.id)],
    };
  }

  const groupNodeId = enclosingGroup.id;
  if (
    isStoryboardGroupNode(enclosingGroup)
    || isProtectedProjectionGroupNode(enclosingGroup)
  ) {
    return null;
  }

  const spawnedIds = new Set(spawned.map((node) => node.id));
  return {
    kind: 'append_to_group',
    groupNodeId,
    nodes: nodes.map((node) =>
      spawnedIds.has(node.id)
        ? { ...node, parentId: groupNodeId, extent: undefined }
        : node,
    ),
  };
}
