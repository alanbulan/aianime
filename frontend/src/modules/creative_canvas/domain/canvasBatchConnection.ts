// Copyright (c) 2026 AI anime
import {
  canConnectCanvasNodesManually,
  getDownstreamSpawnTypes,
  nodeHasSourceHandle,
  nodeHasTargetHandle,
  type CanvasConnectionNodeType,
} from './canvasConnection';
import { getNodeSize, type CanvasGeometryNode } from './canvasGeometry';

export interface CanvasBatchConnectionNode extends CanvasGeometryNode {
  type: CanvasConnectionNodeType;
  selected?: boolean;
}

type CanvasNode = CanvasBatchConnectionNode;
type CanvasNodeType = CanvasConnectionNodeType;

export interface CanvasBatchConnectContext {
  sourceIds: string[];
  allowedTypes: CanvasNodeType[];
  bboxRightCenter: { x: number; y: number };
}

export interface CanvasBatchConnectTarget {
  targetId: string;
  sourceIds: string[];
}

export function resolveCanvasBatchConnectContext(
  nodes: readonly CanvasNode[],
): CanvasBatchConnectContext | null {
  const sources = nodes.filter(
    (node) => Boolean(node.selected) && nodeHasSourceHandle(node.type),
  );
  if (sources.length < 2) {
    return null;
  }

  let allowedTypes: CanvasNodeType[] | null = null;
  let minY = Infinity;
  let maxY = -Infinity;
  let maxX = -Infinity;
  for (const source of sources) {
    const downstreamTypes = getDownstreamSpawnTypes(source.type);
    allowedTypes = allowedTypes === null
      ? downstreamTypes
      : allowedTypes.filter((type) => downstreamTypes.includes(type));
    const size = getNodeSize(source);
    minY = Math.min(minY, source.position.y);
    maxY = Math.max(maxY, source.position.y + size.height);
    maxX = Math.max(maxX, source.position.x + size.width);
  }
  if (!allowedTypes || allowedTypes.length === 0) {
    return null;
  }

  return {
    sourceIds: sources.map((node) => node.id),
    allowedTypes,
    bboxRightCenter: { x: maxX, y: (minY + maxY) / 2 },
  };
}

export function planCanvasBatchConnectTarget(
  nodes: readonly CanvasNode[],
  sourceIds: readonly string[],
  targetId: string | null | undefined,
): CanvasBatchConnectTarget | null {
  if (!targetId || sourceIds.includes(targetId)) {
    return null;
  }
  const targetNode = nodes.find((node) => node.id === targetId);
  if (!targetNode || !nodeHasTargetHandle(targetNode.type)) {
    return null;
  }

  return {
    targetId,
    sourceIds: sourceIds.filter((sourceId) => {
      const sourceNode = nodes.find((node) => node.id === sourceId);
      return sourceNode
        ? canConnectCanvasNodesManually(sourceNode, targetNode)
        : false;
    }),
  };
}
