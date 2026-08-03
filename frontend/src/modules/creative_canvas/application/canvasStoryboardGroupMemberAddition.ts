// Copyright (c) 2026 AI anime
import {
  layoutCanvasStoryboardGroupMembers,
  mapCanvasStoryboardMemberPositions,
  sortCanvasStoryboardGroupMembers,
} from '@/modules/creative_canvas/domain/canvasStoryboardGroupMembers';
import type { StoryboardGroupNodePorts } from '@/modules/creative_canvas/domain/storyboardGroup';
import type { CanvasGroupCreationNode } from '@/modules/creative_canvas/application/canvasGroupCreation';

export interface CanvasStoryboardMemberAdditionPorts<
  TNode extends CanvasGroupCreationNode,
> extends StoryboardGroupNodePorts<TNode> {
  createMemberNode: (data: Record<string, unknown>) => TNode;
}

export interface CanvasStoryboardMemberImage {
  imageUrl: string;
  previewImageUrl?: string;
  displayName?: string;
}

export interface CanvasStoryboardMemberAdditionResult<
  TNode extends CanvasGroupCreationNode,
> {
  nodes: TNode[];
  createdNodeIds: string[];
}

export function addCanvasStoryboardGroupMembers<
  TNode extends CanvasGroupCreationNode,
>(
  nodes: readonly TNode[],
  groupNodeId: string,
  images: readonly CanvasStoryboardMemberImage[],
  ports: CanvasStoryboardMemberAdditionPorts<TNode>,
): CanvasStoryboardMemberAdditionResult<TNode> | null {
  const validImages = images.filter(
    (image) => image.imageUrl.trim().length > 0,
  );
  if (validImages.length === 0) {
    return null;
  }

  const group = nodes.find((node) => node.id === groupNodeId);
  if (!group || !ports.isStoryboardGroupNode(group)) {
    return null;
  }

  const existing = sortCanvasStoryboardGroupMembers(nodes, groupNodeId);
  const currentLayout = layoutCanvasStoryboardGroupMembers(
    existing,
    {
      baseWidth: group.data.storyboardBaseWidth,
      baseHeight: group.data.storyboardBaseHeight,
      aspectKey: group.data.storyboardAspect,
      cols: group.data.storyboardCols,
    },
    ports,
  );
  const { baseWidth, baseHeight, aspectKey } = currentLayout;
  const roundedWidth = Math.round(baseWidth);
  const roundedHeight = Math.round(baseHeight);

  const newNodes = validImages.map((image) => {
    const node = ports.createMemberNode({
      imageUrl: image.imageUrl,
      previewImageUrl: image.previewImageUrl ?? image.imageUrl,
      displayName: image.displayName ?? '分镜',
    });
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
    ports,
  );
  const positions = mapCanvasStoryboardMemberPositions(
    allMembers,
    memberLayout,
  );

  const updatedExisting = nodes.map((node): TNode => {
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
          ...node.data,
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
