// Copyright (c) 2026 AI anime
import {
  isStoryboardGroupNode,
  type CanvasNode,
} from './canvasNodes';
import { getNodeSize } from './canvasGeometry';
import {
  DEFAULT_STORYBOARD_ASPECT,
  computeStoryboardCell,
  computeStoryboardGridLayout,
  resolveStoryboardCols,
} from './storyboardGroup';

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

  const members = nodes
    .filter((node) => node.parentId === groupNodeId)
    .sort(
      (first, second) =>
        first.position.y - second.position.y
        || first.position.x - second.position.x,
    );
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

  const baseWidth =
    group.data.storyboardBaseWidth
    ?? Math.max(...members.map((node) => getNodeSize(node).width));
  const baseHeight =
    group.data.storyboardBaseHeight
    ?? Math.max(...members.map((node) => getNodeSize(node).height));
  const cols = resolveStoryboardCols(
    reordered.length,
    group.data.storyboardCols,
  );
  const { cellWidth, cellHeight } = computeStoryboardCell(
    baseWidth,
    baseHeight,
    group.data.storyboardAspect ?? DEFAULT_STORYBOARD_ASPECT,
  );
  const layout = computeStoryboardGridLayout({
    count: reordered.length,
    cols,
    cellWidth,
    cellHeight,
  });
  const positions = new Map<string, { x: number; y: number }>();
  reordered.forEach((node, index) => {
    const cell = layout.cells[index];
    if (cell) {
      positions.set(node.id, { x: cell.x, y: cell.y });
    }
  });

  return nodes.map((node) => {
    const position = positions.get(node.id);
    return position ? { ...node, position } : node;
  });
}
