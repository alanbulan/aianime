// Copyright (c) 2026 AI anime
import {
  assembleCanvasGroupNodes,
  resolveCanvasGroupMembers,
} from '@/modules/creative_canvas/domain/canvasGrouping';
import {
  layoutCanvasStoryboardGroupMembers,
  mapCanvasStoryboardMemberPositions,
} from '@/modules/creative_canvas/domain/canvasStoryboardGroupMembers';
import type {
  StoryboardGroupEdge,
  StoryboardGroupNodePorts,
} from '@/modules/creative_canvas/domain/storyboardGroup';
import type { CanvasGroupCreationNode } from '@/modules/creative_canvas/application/canvasGroupCreation';

export interface CanvasStoryboardGroupCreationPorts<
  TNode extends CanvasGroupCreationNode,
> extends StoryboardGroupNodePorts<TNode> {
  createGroupNode: (
    position: { x: number; y: number },
    data: Record<string, unknown>,
  ) => TNode;
  resolveAbsolutePosition: (
    node: TNode,
    nodeMap: ReadonlyMap<string, TNode>,
  ) => { x: number; y: number };
}

export interface CanvasStoryboardGroupCreationResult<
  TNode extends CanvasGroupCreationNode,
  TEdge extends StoryboardGroupEdge,
> {
  nodes: TNode[];
  edges: TEdge[];
  groupNodeId: string;
  groupedNodeIds: ReadonlySet<string>;
}

export function createCanvasStoryboardGroup<
  TNode extends CanvasGroupCreationNode,
  TEdge extends StoryboardGroupEdge,
>(
  nodes: readonly TNode[],
  edges: readonly TEdge[],
  nodeIds: Iterable<string>,
  ports: CanvasStoryboardGroupCreationPorts<TNode>,
): CanvasStoryboardGroupCreationResult<TNode, TEdge> | null {
  const resolved = resolveCanvasGroupMembers(nodes, nodeIds);
  if (!resolved) {
    return null;
  }
  const { nodeMap, memberIds, members } = resolved;

  const ordered = [...members].sort((first, second) => {
    const firstPosition = ports.resolveAbsolutePosition(first, nodeMap);
    const secondPosition = ports.resolveAbsolutePosition(second, nodeMap);
    return (
      firstPosition.y - secondPosition.y
      || firstPosition.x - secondPosition.x
    );
  });
  const {
    baseWidth,
    baseHeight,
    aspectKey,
    memberLayout,
    board,
  } = layoutCanvasStoryboardGroupMembers(ordered, {}, ports);
  const memberPositions = mapCanvasStoryboardMemberPositions(
    ordered,
    memberLayout,
  );

  const anchor = ordered.reduce(
    (position, node) => {
      const absolute = ports.resolveAbsolutePosition(node, nodeMap);
      return {
        x: Math.min(position.x, absolute.x),
        y: Math.min(position.y, absolute.y),
      };
    },
    { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY },
  );
  const groupX = Math.round(Number.isFinite(anchor.x) ? anchor.x : 0);
  const groupY = Math.round(Number.isFinite(anchor.y) ? anchor.y : 0);

  const existingStoryboardCount = nodes.filter((node) =>
    ports.isStoryboardGroupNode(node),
  ).length;
  const groupDisplayName = `分镜组 ${existingStoryboardCount + 1}`;
  const groupNode = ports.createGroupNode(
    { x: groupX, y: groupY },
    {
      label: groupDisplayName,
      displayName: groupDisplayName,
      storyboardGroup: true,
      storyboardAspect: aspectKey,
      storyboardCols: board.cols,
      storyboardShowIndex: false,
      storyboardBaseWidth: baseWidth,
      storyboardBaseHeight: baseHeight,
    },
  );
  groupNode.style = { width: board.groupWidth, height: board.groupHeight };
  groupNode.dragHandle = '.storyboard-group-drag-handle';
  groupNode.selected = true;

  const groupedNodeIds = new Set(memberIds);
  const updatedMembers = new Map<string, TNode>();
  ordered.forEach((node) => {
    const position = memberPositions.get(node.id) ?? node.position;
    updatedMembers.set(node.id, {
      ...node,
      parentId: groupNode.id,
      hidden: true,
      position,
      selected: false,
    });
  });

  const nextEdges = edges.map((edge): TEdge => {
    const sourceMember = groupedNodeIds.has(edge.source);
    const targetMember = groupedNodeIds.has(edge.target);
    if (sourceMember && targetMember) {
      return { ...edge, hidden: true };
    }
    if (sourceMember) {
      return {
        ...edge,
        source: groupNode.id,
        data: { ...(edge.data ?? {}), __sbOrigSource: edge.source },
      };
    }
    if (targetMember) {
      return {
        ...edge,
        target: groupNode.id,
        data: { ...(edge.data ?? {}), __sbOrigTarget: edge.target },
      };
    }
    return edge;
  });

  return {
    nodes: assembleCanvasGroupNodes(nodes, groupNode, updatedMembers),
    edges: nextEdges,
    groupNodeId: groupNode.id,
    groupedNodeIds,
  };
}
