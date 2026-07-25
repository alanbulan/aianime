// Copyright (c) 2026 AI anime
import type { CanvasNode } from './canvasNodes';

export interface CanvasGroupMembers {
  nodeMap: ReadonlyMap<string, CanvasNode>;
  memberIds: string[];
  members: CanvasNode[];
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
