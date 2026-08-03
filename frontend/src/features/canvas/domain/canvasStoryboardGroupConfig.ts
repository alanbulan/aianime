// Copyright (c) 2026 AI anime
import {
  isStoryboardGroupNode,
  type CanvasNode,
  type GroupNodeData,
} from './canvasNodes';
import {
  DEFAULT_STORYBOARD_ASPECT,
  computeStoryboardBoardLayout,
  resolveStoryboardCols,
} from '@/modules/creative_canvas/public';

export interface CanvasStoryboardGroupConfig {
  aspectKey?: string;
  cols?: number;
  showIndex?: boolean;
}

export function configureCanvasStoryboardGroup(
  nodes: readonly CanvasNode[],
  groupNodeId: string,
  config: CanvasStoryboardGroupConfig,
): CanvasNode[] | null {
  const groupNode = nodes.find((node) => node.id === groupNodeId);
  if (!isStoryboardGroupNode(groupNode)) {
    return null;
  }

  const aspectKey =
    config.aspectKey
    ?? groupNode.data.storyboardAspect
    ?? DEFAULT_STORYBOARD_ASPECT;
  const showIndex =
    typeof config.showIndex === 'boolean'
      ? config.showIndex
      : groupNode.data.storyboardShowIndex === true;
  const childCount = nodes.reduce(
    (count, node) => count + (node.parentId === groupNodeId ? 1 : 0),
    0,
  );
  const cols = resolveStoryboardCols(
    childCount,
    config.cols ?? groupNode.data.storyboardCols,
  );
  const board = computeStoryboardBoardLayout({
    count: childCount,
    cols,
    aspectKey,
  });

  return nodes.map((node) =>
    node.id === groupNodeId
      ? {
          ...node,
          width: board.groupWidth,
          height: board.groupHeight,
          style: {
            ...(node.style ?? {}),
            width: board.groupWidth,
            height: board.groupHeight,
          },
          data: {
            ...(node.data as GroupNodeData),
            storyboardAspect: aspectKey,
            storyboardCols: board.cols,
            storyboardShowIndex: showIndex,
          },
        }
      : node,
  );
}
