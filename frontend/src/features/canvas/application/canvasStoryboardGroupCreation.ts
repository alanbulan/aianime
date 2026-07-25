// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  isStoryboardGroupNode,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  getNodeSize,
  resolveAbsolutePosition,
} from '../domain/canvasGeometry';
import {
  assembleCanvasGroupNodes,
  resolveCanvasGroupMembers,
} from '../domain/canvasGrouping';
import {
  DEFAULT_STORYBOARD_ASPECT,
  computeStoryboardBoardLayout,
  computeStoryboardCell,
  computeStoryboardGridLayout,
  resolveStoryboardCols,
} from '../domain/storyboardGroup';
import type { NodeFactory } from './ports';

export interface CanvasStoryboardGroupCreationResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groupNodeId: string;
  groupedNodeIds: ReadonlySet<string>;
}

export function createCanvasStoryboardGroup(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  nodeIds: Iterable<string>,
  nodeFactory: NodeFactory,
): CanvasStoryboardGroupCreationResult | null {
  const resolved = resolveCanvasGroupMembers(nodes, nodeIds);
  if (!resolved) {
    return null;
  }
  const { nodeMap, memberIds, members } = resolved;

  const ordered = [...members].sort((first, second) => {
    const firstPosition = resolveAbsolutePosition(first, nodeMap);
    const secondPosition = resolveAbsolutePosition(second, nodeMap);
    return (
      firstPosition.y - secondPosition.y
      || firstPosition.x - secondPosition.x
    );
  });
  const baseWidth = Math.max(...ordered.map((node) => getNodeSize(node).width));
  const baseHeight = Math.max(...ordered.map((node) => getNodeSize(node).height));
  const aspectKey = DEFAULT_STORYBOARD_ASPECT;
  const cols = resolveStoryboardCols(ordered.length);
  const { cellWidth, cellHeight } = computeStoryboardCell(
    baseWidth,
    baseHeight,
    aspectKey,
  );
  const memberLayout = computeStoryboardGridLayout({
    count: ordered.length,
    cols,
    cellWidth,
    cellHeight,
  });
  const board = computeStoryboardBoardLayout({
    count: ordered.length,
    cols,
    aspectKey,
  });

  const anchor = ordered.reduce(
    (position, node) => {
      const absolute = resolveAbsolutePosition(node, nodeMap);
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
    isStoryboardGroupNode(node),
  ).length;
  const groupDisplayName = `分镜组 ${existingStoryboardCount + 1}`;
  const groupNode = nodeFactory.createNode(
    CANVAS_NODE_TYPES.group,
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
  const updatedMembers = new Map<string, CanvasNode>();
  ordered.forEach((node, index) => {
    const cell = memberLayout.cells[index];
    updatedMembers.set(node.id, {
      ...node,
      parentId: groupNode.id,
      hidden: true,
      position: { x: cell.x, y: cell.y },
      selected: false,
    });
  });

  const nextEdges = edges.map((edge) => {
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
