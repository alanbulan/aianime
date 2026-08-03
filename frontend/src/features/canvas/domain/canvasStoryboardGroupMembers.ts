// Copyright (c) 2026 AI anime
import {
  DEFAULT_NODE_WIDTH,
  isStoryboardGroupNode,
  type CanvasNode,
} from './canvasNodes';
import { getNodeSize } from './canvasGeometry';
import {
  DEFAULT_STORYBOARD_ASPECT,
  computeStoryboardBoardLayout,
  computeStoryboardCell,
  computeStoryboardGridLayout,
  resolveStoryboardCols,
  type StoryboardGridLayout,
} from '@/modules/creative_canvas/public';

export interface CanvasStoryboardMemberLayoutOptions {
  baseWidth?: number;
  baseHeight?: number;
  aspectKey?: string;
  cols?: number;
}

export interface CanvasStoryboardMemberLayout {
  baseWidth: number;
  baseHeight: number;
  aspectKey: string;
  memberLayout: StoryboardGridLayout;
  board: StoryboardGridLayout;
}

export function sortCanvasStoryboardGroupMembers(
  nodes: readonly CanvasNode[],
  groupNodeId: string,
): CanvasNode[] {
  return nodes
    .filter((node) => node.parentId === groupNodeId)
    .sort(
      (first, second) =>
        first.position.y - second.position.y
        || first.position.x - second.position.x,
    );
}

export function layoutCanvasStoryboardGroupMembers(
  members: readonly CanvasNode[],
  options: CanvasStoryboardMemberLayoutOptions = {},
): CanvasStoryboardMemberLayout {
  const baseWidth =
    options.baseWidth
    ?? (members.length > 0
      ? Math.max(...members.map((node) => getNodeSize(node).width))
      : DEFAULT_NODE_WIDTH);
  const baseHeight =
    options.baseHeight
    ?? (members.length > 0
      ? Math.max(...members.map((node) => getNodeSize(node).height))
      : 200);
  const aspectKey = options.aspectKey ?? DEFAULT_STORYBOARD_ASPECT;
  const cols = resolveStoryboardCols(members.length, options.cols);
  const { cellWidth, cellHeight } = computeStoryboardCell(
    baseWidth,
    baseHeight,
    aspectKey,
  );

  return {
    baseWidth,
    baseHeight,
    aspectKey,
    memberLayout: computeStoryboardGridLayout({
      count: members.length,
      cols,
      cellWidth,
      cellHeight,
    }),
    board: computeStoryboardBoardLayout({
      count: members.length,
      cols,
      aspectKey,
    }),
  };
}

export function mapCanvasStoryboardMemberPositions(
  members: readonly CanvasNode[],
  layout: StoryboardGridLayout,
): ReadonlyMap<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  members.forEach((node, index) => {
    const cell = layout.cells[index];
    if (cell) {
      positions.set(node.id, { x: cell.x, y: cell.y });
    }
  });
  return positions;
}

export function reorderCanvasStoryboardGroupMember(
  nodes: readonly CanvasNode[],
  groupNodeId: string,
  fromIndex: number,
  toIndex: number,
): CanvasNode[] | null {
  const group = nodes.find((node) => node.id === groupNodeId);
  if (!isStoryboardGroupNode(group)) {
    return null;
  }

  const members = sortCanvasStoryboardGroupMembers(nodes, groupNodeId);
  if (
    fromIndex < 0
    || fromIndex >= members.length
    || toIndex < 0
    || toIndex >= members.length
    || fromIndex === toIndex
  ) {
    return null;
  }

  const reordered = [...members];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  const { memberLayout } = layoutCanvasStoryboardGroupMembers(reordered, {
    baseWidth: group.data.storyboardBaseWidth,
    baseHeight: group.data.storyboardBaseHeight,
    aspectKey: group.data.storyboardAspect,
    cols: group.data.storyboardCols,
  });
  const positions = mapCanvasStoryboardMemberPositions(reordered, memberLayout);

  return nodes.map((node) => {
    const position = positions.get(node.id);
    return position ? { ...node, position } : node;
  });
}
