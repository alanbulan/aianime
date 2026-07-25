// Copyright (c) 2026 AI anime
import type { ActiveToolDialog, CanvasNode } from './canvasNodes';
import {
  getNodeSize,
  rectsIntersect,
  resolveAbsolutePosition,
  type CanvasRect,
} from './canvasGeometry';

export function collectCanvasNodeIdsInRect(
  nodes: readonly CanvasNode[],
  selectionRect: CanvasRect,
): Set<string> {
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const hitIds = new Set(
    nodes
      .filter((node) => {
        const size = getNodeSize(node);
        const absolute = resolveAbsolutePosition(node, nodeMap);
        return rectsIntersect(selectionRect, {
          x: absolute.x,
          y: absolute.y,
          width: size.width,
          height: size.height,
        });
      })
      .map((node) => node.id),
  );

  // Selecting a container with its child makes React Flow apply drag movement twice.
  const ancestorHitIds = new Set<string>();
  for (const nodeId of hitIds) {
    const visited = new Set<string>();
    let parentId = nodeMap.get(nodeId)?.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      if (hitIds.has(parentId)) {
        ancestorHitIds.add(parentId);
      }
      parentId = nodeMap.get(parentId)?.parentId;
    }
  }

  return new Set([...hitIds].filter((nodeId) => !ancestorHitIds.has(nodeId)));
}

export function resolveSelectedNodeId(
  selectedNodeId: string | null,
  nodes: CanvasNode[],
): string | null {
  if (!selectedNodeId) {
    return null;
  }
  return nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : null;
}

export function resolveActiveToolDialog(
  activeToolDialog: ActiveToolDialog | null,
  nodes: CanvasNode[],
): ActiveToolDialog | null {
  if (!activeToolDialog) {
    return null;
  }
  return nodes.some((node) => node.id === activeToolDialog.nodeId)
    ? activeToolDialog
    : null;
}
