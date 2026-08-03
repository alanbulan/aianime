// Copyright (c) 2026 AI anime
import {
  DEFAULT_STORYBOARD_ASPECT,
  computeStoryboardBoardLayout,
  computeStoryboardCell,
  computeStoryboardGridLayout,
  resolveStoryboardCols,
  type StoryboardGroupNode,
  type StoryboardGroupNodePorts,
  type StoryboardGridLayout,
} from './storyboardGroup';

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

export function sortCanvasStoryboardGroupMembers<
  TNode extends StoryboardGroupNode,
>(
  nodes: readonly TNode[],
  groupNodeId: string,
): TNode[] {
  return nodes
    .filter((node) => node.parentId === groupNodeId)
    .sort(
      (first, second) =>
        first.position.y - second.position.y
        || first.position.x - second.position.x,
    );
}

export function layoutCanvasStoryboardGroupMembers<
  TNode extends StoryboardGroupNode,
>(
  members: readonly TNode[],
  options: CanvasStoryboardMemberLayoutOptions = {},
  ports: StoryboardGroupNodePorts<TNode>,
): CanvasStoryboardMemberLayout {
  const baseWidth =
    options.baseWidth
    ?? (members.length > 0
      ? Math.max(...members.map((node) => ports.getNodeSize(node).width))
      : ports.defaultNodeWidth);
  const baseHeight =
    options.baseHeight
    ?? (members.length > 0
      ? Math.max(...members.map((node) => ports.getNodeSize(node).height))
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

export function mapCanvasStoryboardMemberPositions<
  TNode extends StoryboardGroupNode,
>(
  members: readonly TNode[],
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

export function reorderCanvasStoryboardGroupMember<
  TNode extends StoryboardGroupNode,
>(
  nodes: readonly TNode[],
  groupNodeId: string,
  fromIndex: number,
  toIndex: number,
  ports: StoryboardGroupNodePorts<TNode>,
): TNode[] | null {
  const group = nodes.find((node) => node.id === groupNodeId);
  if (!group || !ports.isStoryboardGroupNode(group)) {
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
  }, ports);
  const positions = mapCanvasStoryboardMemberPositions(reordered, memberLayout);

  return nodes.map((node): TNode => {
    const position = positions.get(node.id);
    return position ? { ...node, position } : node;
  });
}
