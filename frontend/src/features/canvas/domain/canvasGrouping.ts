// Copyright (c) 2026 AI anime
import type { CanvasNode } from './canvasNodes';

export interface CanvasGroupMembers {
  nodeMap: ReadonlyMap<string, CanvasNode>;
  memberIds: string[];
  members: CanvasNode[];
}

export function assembleCanvasGroupNodes(
  nodes: readonly CanvasNode[],
  groupNode: CanvasNode,
  updatedMembers: ReadonlyMap<string, CanvasNode>,
): CanvasNode[] {
  const firstMemberIndex = nodes.findIndex((node) => updatedMembers.has(node.id));
  const nextNodes: CanvasNode[] = [];
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

export function resolveCanvasGroupMembers(
  nodes: readonly CanvasNode[],
  nodeIds: Iterable<string>,
): CanvasGroupMembers | null {
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
    members: memberIds.map((nodeId) => nodeMap.get(nodeId) as CanvasNode),
  };
}
