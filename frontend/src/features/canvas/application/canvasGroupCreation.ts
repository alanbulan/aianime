// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  getNodeSize,
  resolveAbsolutePosition,
} from '../domain/canvasGeometry';
import { resolveCanvasGroupMembers } from '../domain/canvasGrouping';
import type { NodeFactory } from './ports';

export interface CanvasGroupCreationOptions {
  label?: string;
  extraPadding?: number;
}

export interface CanvasGroupCreationResult {
  nodes: CanvasNode[];
  groupNodeId: string;
  groupedNodeIds: ReadonlySet<string>;
}

export function createCanvasNodeGroup(
  nodes: readonly CanvasNode[],
  nodeIds: Iterable<string>,
  options: CanvasGroupCreationOptions | undefined,
  nodeFactory: NodeFactory,
): CanvasGroupCreationResult | null {
  const resolved = resolveCanvasGroupMembers(nodes, nodeIds);
  if (!resolved) {
    return null;
  }

  const { nodeMap, memberIds, members } = resolved;
  const groupedNodeIds = new Set(memberIds);
  const absoluteBounds = members.reduce(
    (bounds, node) => {
      const absolute = resolveAbsolutePosition(node, nodeMap);
      const size = getNodeSize(node);
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
  if (!Number.isFinite(absoluteBounds.minX) || !Number.isFinite(absoluteBounds.minY)) {
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

  const existingGroupCount = nodes.filter(
    (node) => node.type === CANVAS_NODE_TYPES.group,
  ).length;
  const groupDisplayName = options?.label?.trim() || `组 ${existingGroupCount + 1}`;
  const groupNode = nodeFactory.createNode(
    CANVAS_NODE_TYPES.group,
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

  const updatedMembers = new Map<string, CanvasNode>();
  for (const node of members) {
    const absolute = resolveAbsolutePosition(node, nodeMap);
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

  const firstMemberIndex = nodes.findIndex((node) => groupedNodeIds.has(node.id));
  const nextNodes: CanvasNode[] = [];
  let insertedGroup = false;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!insertedGroup && index === firstMemberIndex) {
      nextNodes.push(groupNode);
      insertedGroup = true;
    }
    nextNodes.push(updatedMembers.get(node.id) ?? { ...node, selected: false });
  }
  if (!insertedGroup) {
    nextNodes.push(groupNode);
  }

  return {
    nodes: nextNodes,
    groupNodeId: groupNode.id,
    groupedNodeIds,
  };
}
