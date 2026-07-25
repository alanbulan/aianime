// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  isStoryboardGroupNode,
  type CanvasNode,
  type GroupNodeData,
} from '../domain/canvasNodes';
import {
  layoutCanvasStoryboardGroupMembers,
  mapCanvasStoryboardMemberPositions,
  sortCanvasStoryboardGroupMembers,
} from '../domain/canvasStoryboardGroupMembers';
import type { NodeFactory } from './ports';

export interface CanvasStoryboardMemberImage {
  imageUrl: string;
  previewImageUrl?: string;
  displayName?: string;
}

export interface CanvasStoryboardMemberAdditionResult {
  nodes: CanvasNode[];
  createdNodeIds: string[];
}

export function addCanvasStoryboardGroupMembers(
  nodes: readonly CanvasNode[],
  groupNodeId: string,
  images: readonly CanvasStoryboardMemberImage[],
  nodeFactory: NodeFactory,
): CanvasStoryboardMemberAdditionResult | null {
  const validImages = images.filter(
    (image) => image.imageUrl.trim().length > 0,
  );
  if (validImages.length === 0) {
    return null;
  }

  const group = nodes.find((node) => node.id === groupNodeId);
  if (!isStoryboardGroupNode(group)) {
    return null;
  }

  const existing = sortCanvasStoryboardGroupMembers(nodes, groupNodeId);
  const currentLayout = layoutCanvasStoryboardGroupMembers(existing, {
    baseWidth: group.data.storyboardBaseWidth,
    baseHeight: group.data.storyboardBaseHeight,
    aspectKey: group.data.storyboardAspect,
    cols: group.data.storyboardCols,
  });
  const { baseWidth, baseHeight, aspectKey } = currentLayout;
  const roundedWidth = Math.round(baseWidth);
  const roundedHeight = Math.round(baseHeight);

  const newNodes = validImages.map((image) => {
    const node = nodeFactory.createNode(
      CANVAS_NODE_TYPES.exportImage,
      { x: 0, y: 0 },
      {
        imageUrl: image.imageUrl,
        previewImageUrl: image.previewImageUrl ?? image.imageUrl,
        displayName: image.displayName ?? '分镜',
      },
    );
    node.parentId = groupNodeId;
    node.hidden = true;
    node.selected = false;
    node.width = roundedWidth;
    node.height = roundedHeight;
    node.style = { width: roundedWidth, height: roundedHeight };
    return node;
  });

  const allMembers = [...existing, ...newNodes];
  const { memberLayout, board } = layoutCanvasStoryboardGroupMembers(
    allMembers,
    {
      baseWidth,
      baseHeight,
      aspectKey,
      cols: group.data.storyboardCols,
    },
  );
  const positions = mapCanvasStoryboardMemberPositions(
    allMembers,
    memberLayout,
  );

  const updatedExisting = nodes.map((node) => {
    if (node.id === groupNodeId) {
      return {
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
          storyboardCols: board.cols,
        },
      };
    }
    const position = positions.get(node.id);
    return position ? { ...node, position } : node;
  });
  const positionedNew = newNodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));

  return {
    nodes: [...updatedExisting, ...positionedNew],
    createdNodeIds: newNodes.map((node) => node.id),
  };
}
