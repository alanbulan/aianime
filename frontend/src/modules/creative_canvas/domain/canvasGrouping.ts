// Copyright (c) 2026 AI anime
export interface CanvasGroupingNode {
  id: string;
  parentId?: string;
  selected?: boolean;
}

export interface CanvasGroupMembers<TNode extends CanvasGroupingNode> {
  nodeMap: ReadonlyMap<string, TNode>;
  memberIds: string[];
  members: TNode[];
}

export function assembleCanvasGroupNodes<TNode extends CanvasGroupingNode>(
  nodes: readonly TNode[],
  groupNode: TNode,
  updatedMembers: ReadonlyMap<string, TNode>,
): TNode[] {
  const firstMemberIndex = nodes.findIndex((node) => updatedMembers.has(node.id));
  const nextNodes: TNode[] = [];
  let insertedGroup = false;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!insertedGroup && index === firstMemberIndex) {
      nextNodes.push(groupNode);
      insertedGroup = true;
    }
    const updatedMember = updatedMembers.get(node.id);
    nextNodes.push(
      updatedMember ?? (node.selected ? { ...node, selected: false } : node),
    );
  }

  if (!insertedGroup) {
    nextNodes.push(groupNode);
  }
  return nextNodes;
}

export function resolveCanvasGroupMembers<TNode extends CanvasGroupingNode>(
  nodes: readonly TNode[],
  nodeIds: Iterable<string>,
): CanvasGroupMembers<TNode> | null {
  const uniqueIds = Array.from(
    new Set(Array.from(nodeIds).filter((nodeId) => nodeId.trim().length > 0)),
  );
  if (uniqueIds.length < 2) {
    return null;
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const existingIds = uniqueIds.filter((nodeId) => nodeMap.has(nodeId));
  if (existingIds.length < 2) {
    return null;
  }

  const selectedIds = new Set(existingIds);
  const memberIds = existingIds.filter((nodeId) => {
    let currentParentId = nodeMap.get(nodeId)?.parentId;
    const visited = new Set<string>();
    while (currentParentId && !visited.has(currentParentId)) {
      if (selectedIds.has(currentParentId)) {
        return false;
      }
      visited.add(currentParentId);
      currentParentId = nodeMap.get(currentParentId)?.parentId;
    }
    return true;
  });
  if (memberIds.length < 2) {
    return null;
  }

  return {
    nodeMap,
    memberIds,
    members: memberIds.map((nodeId) => nodeMap.get(nodeId) as TNode),
  };
}
