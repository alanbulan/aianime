// Copyright (c) 2026 AI anime
import { restoreStoryboardEdges } from './storyboardGroup';

export interface CanvasGroupRemovalNode {
  id: string;
  parentId?: string;
  extent?: unknown;
  hidden?: boolean;
  position: { x: number; y: number };
  selected?: boolean;
}

export interface CanvasGroupRemovalEdge {
  source: string;
  target: string;
  data?: unknown;
  hidden?: boolean;
}

export interface CanvasGroupRemovalPorts<TNode extends CanvasGroupRemovalNode> {
  isGroupNode: (node: TNode) => boolean;
  isProtectedGroupNode: (node: TNode) => boolean;
  resolveAbsolutePosition: (
    node: TNode,
    nodeMap: ReadonlyMap<string, TNode>,
  ) => { x: number; y: number };
}

export interface CanvasGroupRemovalResult<
  TNode extends CanvasGroupRemovalNode,
  TEdge extends CanvasGroupRemovalEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
}

export function ungroupCanvasNode<
  TNode extends CanvasGroupRemovalNode,
  TEdge extends CanvasGroupRemovalEdge,
>(
  nodes: readonly TNode[],
  edges: readonly TEdge[],
  groupNodeId: string,
  ports: CanvasGroupRemovalPorts<TNode>,
): CanvasGroupRemovalResult<TNode, TEdge> | null {
  const groupNode = nodes.find((node) => node.id === groupNodeId);
  if (
    !groupNode ||
    !ports.isGroupNode(groupNode) ||
    ports.isProtectedGroupNode(groupNode)
  ) {
    return null;
  }

  const children = nodes.filter((node) => node.parentId === groupNodeId);
  if (children.length === 0) {
    return null;
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const nextNodes = nodes
    .filter((node) => node.id !== groupNodeId)
    .map((node): TNode => {
      if (node.parentId !== groupNodeId) {
        return node;
      }

      const absolute = ports.resolveAbsolutePosition(node, nodeMap);
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
