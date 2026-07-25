// Copyright (c) 2026 AI anime
import { resolveAbsolutePosition } from './canvasGeometry';
import {
  isGroupNode,
  isProtectedProjectionGroupNode,
  type CanvasEdge,
  type CanvasNode,
} from './canvasNodes';
import { restoreStoryboardEdges } from './storyboardGroup';

export interface CanvasGroupRemovalResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export function ungroupCanvasNode(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  groupNodeId: string,
): CanvasGroupRemovalResult | null {
  const groupNode = nodes.find((node) => node.id === groupNodeId);
  if (!isGroupNode(groupNode) || isProtectedProjectionGroupNode(groupNode)) {
    return null;
  }

  const children = nodes.filter((node) => node.parentId === groupNodeId);
  if (children.length === 0) {
    return null;
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const nextNodes = nodes
    .filter((node) => node.id !== groupNodeId)
    .map((node) => {
      if (node.parentId !== groupNodeId) {
        return node;
      }

      const absolute = resolveAbsolutePosition(node, nodeMap);
      return {
        ...node,
        parentId: undefined,
        extent: undefined,
        hidden: false,
        position: {
          x: Math.round(absolute.x),
          y: Math.round(absolute.y),
        },
        selected: false,
      };
    });
  const childIds = new Set(children.map((child) => child.id));
  const nextEdges = restoreStoryboardEdges(edges, groupNodeId, childIds).filter(
    (edge) => edge.source !== groupNodeId && edge.target !== groupNodeId,
  );

  return { nodes: nextNodes, edges: nextEdges };
}
