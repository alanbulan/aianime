// Copyright (c) 2026 AI anime
import {
  assembleCanvasGroupNodes,
  resolveCanvasGroupMembers,
  type CanvasGroupingNode,
} from '@/modules/creative_canvas/domain/canvasGrouping';
import type { StoryboardGroupNode } from '@/modules/creative_canvas/domain/storyboardGroup';

export interface CanvasGroupCreationNode
  extends CanvasGroupingNode, StoryboardGroupNode {
  extent?: unknown;
  type?: unknown;
}

export interface CanvasGroupCreationPorts<
  TNode extends CanvasGroupCreationNode,
> {
  createGroupNode: (
    position: { x: number; y: number },
    data: Record<string, unknown>,
  ) => TNode;
  getNodeSize: (node: TNode) => { width: number; height: number };
  isGroupNode: (node: TNode) => boolean;
  resolveAbsolutePosition: (
    node: TNode,
    nodeMap: ReadonlyMap<string, TNode>,
  ) => { x: number; y: number };
}

export interface CanvasGroupCreationOptions {
  label?: string;
  extraPadding?: number;
}

export interface CanvasGroupCreationResult<
  TNode extends CanvasGroupCreationNode,
> {
  nodes: TNode[];
  groupNodeId: string;
  groupedNodeIds: ReadonlySet<string>;
}

export function createCanvasNodeGroup<TNode extends CanvasGroupCreationNode>(
  nodes: readonly TNode[],
  nodeIds: Iterable<string>,
  options: CanvasGroupCreationOptions | undefined,
  ports: CanvasGroupCreationPorts<TNode>,
): CanvasGroupCreationResult<TNode> | null {
  const resolved = resolveCanvasGroupMembers(nodes, nodeIds);
  if (!resolved) {
    return null;
  }

  const { nodeMap, memberIds, members } = resolved;
  const groupedNodeIds = new Set(memberIds);
  const absoluteBounds = members.reduce(
    (bounds, node) => {
      const absolute = ports.resolveAbsolutePosition(node, nodeMap);
      const size = ports.getNodeSize(node);
      return {
        minX: Math.min(bounds.minX, absolute.x),
        minY: Math.min(bounds.minY, absolute.y),
        maxX: Math.max(bounds.maxX, absolute.x + size.width),
        maxY: Math.max(bounds.maxY, absolute.y + size.height),
      };
    },
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
  if (
    !Number.isFinite(absoluteBounds.minX)
    || !Number.isFinite(absoluteBounds.minY)
  ) {
    return null;
  }

  const extraPadding = Math.max(0, options?.extraPadding ?? 0);
  const sidePadding = 20 + extraPadding;
  const topPadding = 34 + extraPadding;
  const bottomPadding = 20 + extraPadding;
  const groupX = Math.round(absoluteBounds.minX - sidePadding);
  const groupY = Math.round(absoluteBounds.minY - topPadding);
  const groupWidth = Math.round(
    Math.max(
      220,
      absoluteBounds.maxX - absoluteBounds.minX + sidePadding * 2,
    ),
  );
  const groupHeight = Math.round(
    Math.max(
      140,
      absoluteBounds.maxY
        - absoluteBounds.minY
        + topPadding
        + bottomPadding,
    ),
  );

  const existingGroupCount = nodes.filter(ports.isGroupNode).length;
  const groupDisplayName =
    options?.label?.trim() || `组 ${existingGroupCount + 1}`;
  const groupNode = ports.createGroupNode(
    { x: groupX, y: groupY },
    {
      label: groupDisplayName,
      displayName: groupDisplayName,
    },
  );
  groupNode.width = groupWidth;
  groupNode.height = groupHeight;
  groupNode.style = { width: groupWidth, height: groupHeight };
  groupNode.selected = true;

  const updatedMembers = new Map<string, TNode>();
  for (const node of members) {
    const absolute = ports.resolveAbsolutePosition(node, nodeMap);
    updatedMembers.set(node.id, {
      ...node,
      parentId: groupNode.id,
      extent: undefined,
      position: {
        x: Math.round(absolute.x - groupX),
        y: Math.round(absolute.y - groupY),
      },
      selected: false,
    });
  }

  return {
    nodes: assembleCanvasGroupNodes(nodes, groupNode, updatedMembers),
    groupNodeId: groupNode.id,
    groupedNodeIds,
  };
}
