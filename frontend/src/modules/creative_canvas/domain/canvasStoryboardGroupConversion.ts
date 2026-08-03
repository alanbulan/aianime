// Copyright (c) 2026 AI anime
import {
  restoreStoryboardEdges,
  type StoryboardGroupEdge,
  type StoryboardGroupNode,
  type StoryboardGroupNodePorts,
} from './storyboardGroup';

export interface CanvasStoryboardGroupConversionResult<
  TNode extends StoryboardGroupNode,
  TEdge extends StoryboardGroupEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
}

export function convertCanvasStoryboardGroupToPlain<
  TNode extends StoryboardGroupNode,
  TEdge extends StoryboardGroupEdge,
>(
  nodes: readonly TNode[],
  edges: readonly TEdge[],
  groupNodeId: string,
  ports: StoryboardGroupNodePorts<TNode>,
): CanvasStoryboardGroupConversionResult<TNode, TEdge> | null {
  const groupNode = nodes.find((node) => node.id === groupNodeId);
  if (!groupNode || !ports.isStoryboardGroupNode(groupNode)) {
    return null;
  }

  const children = nodes.filter((node) => node.parentId === groupNodeId);
  let maxX = 0;
  let maxY = 0;
  for (const child of children) {
    const size = ports.getNodeSize(child);
    maxX = Math.max(maxX, child.position.x + size.width);
    maxY = Math.max(maxY, child.position.y + size.height);
  }
  const groupWidth = Math.max(220, Math.round(maxX + 20));
  const groupHeight = Math.max(140, Math.round(maxY + 20));

  const nextNodes = nodes.map((node): TNode => {
    if (node.id === groupNodeId) {
      const {
        storyboardGroup: _storyboardGroup,
        storyboardAspect: _storyboardAspect,
        storyboardCols: _storyboardCols,
        storyboardShowIndex: _storyboardShowIndex,
        storyboardBaseWidth: _storyboardBaseWidth,
        storyboardBaseHeight: _storyboardBaseHeight,
        ...restData
      } = node.data;
      return {
        ...node,
        dragHandle: undefined,
        width: groupWidth,
        height: groupHeight,
        style: {
          ...(node.style ?? {}),
          width: groupWidth,
          height: groupHeight,
        },
        data: restData,
      };
    }
    if (node.parentId === groupNodeId && node.hidden) {
      return { ...node, hidden: false };
    }
    return node;
  });
  const childIds = new Set(children.map((child) => child.id));

  return {
    nodes: nextNodes,
    edges: restoreStoryboardEdges(edges, groupNodeId, childIds),
  };
}
