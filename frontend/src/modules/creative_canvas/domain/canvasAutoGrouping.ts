// Copyright (c) 2026 AI anime
export interface CanvasAutoGroupingNode {
  id: string;
  parentId?: string;
  extent?: unknown;
}

export interface CanvasAutoGroupingPorts<TNode extends CanvasAutoGroupingNode> {
  isGroupNode: (node: TNode) => boolean;
  isProtectedGroupNode: (node: TNode) => boolean;
  isStoryboardGroupNode: (node: TNode) => boolean;
}

export type CanvasAutoGroupSpawnPlan<TNode extends CanvasAutoGroupingNode> =
  | {
      kind: 'create_group';
      nodeIds: string[];
    }
  | {
      kind: 'append_to_group';
      nodes: TNode[];
      groupNodeId: string;
    };

export function planCanvasAutoGroupSpawn<TNode extends CanvasAutoGroupingNode>(
  nodes: readonly TNode[],
  sourceNodeId: string,
  spawnedNodeIds: Iterable<string>,
  ports: CanvasAutoGroupingPorts<TNode>,
): CanvasAutoGroupSpawnPlan<TNode> | null {
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const source = nodeMap.get(sourceNodeId);
  if (!source) {
    return null;
  }

  const spawned = Array.from(spawnedNodeIds)
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is TNode => Boolean(node && !node.parentId));
  if (spawned.length === 0) {
    return null;
  }

  let enclosingGroup: TNode | null = null;
  let parentId = source.parentId;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = nodeMap.get(parentId);
    if (!parent) {
      break;
    }
    if (ports.isGroupNode(parent)) {
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
    ports.isStoryboardGroupNode(enclosingGroup)
    || ports.isProtectedGroupNode(enclosingGroup)
  ) {
    return null;
  }

  const spawnedIds = new Set(spawned.map((node) => node.id));
  return {
    kind: 'append_to_group',
    groupNodeId,
    nodes: nodes.map((node): TNode =>
      spawnedIds.has(node.id)
        ? { ...node, parentId: groupNodeId, extent: undefined }
        : node,
    ),
  };
}
