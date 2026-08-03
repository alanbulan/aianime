// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  resolveAutoImageNodeDimensions,
} from '@/modules/creative_canvas/public';
import {
  getNodeSize,
  resolveAbsolutePosition,
} from '../domain/canvasGeometry';
import type { NodeFactory } from './ports';

export interface CanvasPanoCapture {
  dataUrl: string;
  width: number;
  height: number;
  label: string;
  uploadedUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CanvasPanoCaptureOptions {
  cols?: number;
  groupName?: string;
}

export interface CanvasPanoCaptureResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string;
}

function captureDisplayUrl(capture: CanvasPanoCapture): string {
  return typeof capture.uploadedUrl === 'string' && capture.uploadedUrl.length > 0
    ? capture.uploadedUrl
    : capture.dataUrl;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function captureAspectRatio(capture: CanvasPanoCapture): string {
  const divisor = greatestCommonDivisor(capture.width, capture.height) || 1;
  return `${Math.round(capture.width / divisor)}:${Math.round(capture.height / divisor)}`;
}

function captureEdge(sourceNodeId: string, targetNodeId: string): CanvasEdge {
  return {
    id: `e-${sourceNodeId}-${targetNodeId}`,
    source: sourceNodeId,
    target: targetNodeId,
    sourceHandle: 'source',
    targetHandle: 'target',
    type: 'disconnectableEdge',
  };
}

export function createPanoCaptureNodes(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  sourceNodeId: string,
  captures: CanvasPanoCapture[],
  options: CanvasPanoCaptureOptions | undefined,
  nodeFactory: NodeFactory,
): CanvasPanoCaptureResult | null {
  if (captures.length === 0) {
    return null;
  }
  const source = nodes.find((node) => node.id === sourceNodeId);
  if (!source) {
    return null;
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const sourceAbs = resolveAbsolutePosition(source, nodeMap);
  const sourceSize = getNodeSize(source);
  const deselectedNodes = nodes.map((node) =>
    node.selected ? { ...node, selected: false } : node,
  );

  if (captures.length === 1) {
    const capture = captures[0];
    const nodeWidth = 320;
    const nodeHeight = Math.max(
      80,
      Math.round((nodeWidth * capture.height) / Math.max(1, capture.width)),
    );
    const displayUrl = captureDisplayUrl(capture);
    const singleNode = nodeFactory.createNode(
      CANVAS_NODE_TYPES.exportImage,
      {
        x: Math.round(sourceAbs.x + sourceSize.width + 80),
        y: Math.round(sourceAbs.y),
      },
      {
        imageUrl: displayUrl,
        previewImageUrl: displayUrl,
        aspectRatio: captureAspectRatio(capture),
        displayName: capture.label,
        captureMetadata: capture.metadata ?? null,
      },
    );
    singleNode.width = nodeWidth;
    singleNode.height = nodeHeight;
    singleNode.style = {
      ...(singleNode.style ?? {}),
      width: nodeWidth,
      height: nodeHeight,
    };
    singleNode.selected = true;

    return {
      nodes: [...deselectedNodes, singleNode],
      edges: [...edges, captureEdge(sourceNodeId, singleNode.id)],
      selectedNodeId: singleNode.id,
    };
  }

  const cols = Math.max(1, options?.cols ?? Math.ceil(Math.sqrt(captures.length)));
  const rows = Math.ceil(captures.length / cols);
  const aspectRatio = captureAspectRatio(captures[0]);
  const cellSize = resolveAutoImageNodeDimensions(aspectRatio, {
    minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
    minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
  });
  const cellWidth = cellSize.width;
  const cellHeight = cellSize.height;
  const cellGap = 24;
  const sidePadding = 20;
  const topPadding = 34;
  const bottomPadding = 20;
  const groupWidth = sidePadding * 2 + cols * cellWidth + (cols - 1) * cellGap;
  const groupHeight =
    topPadding + bottomPadding + rows * cellHeight + (rows - 1) * cellGap;
  const groupDisplayName = options?.groupName ?? `全景截图组 (${captures.length} 张)`;
  const groupNode = nodeFactory.createNode(
    CANVAS_NODE_TYPES.group,
    {
      x: Math.round(sourceAbs.x + sourceSize.width + 80),
      y: Math.round(sourceAbs.y),
    },
    { label: groupDisplayName, displayName: groupDisplayName },
  );
  groupNode.width = groupWidth;
  groupNode.height = groupHeight;
  groupNode.style = { width: groupWidth, height: groupHeight };
  groupNode.selected = false;

  const childNodes = captures.map((capture, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const displayUrl = captureDisplayUrl(capture);
    const childNode = nodeFactory.createNode(
      CANVAS_NODE_TYPES.exportImage,
      {
        x: sidePadding + col * (cellWidth + cellGap),
        y: topPadding + row * (cellHeight + cellGap),
      },
      {
        imageUrl: displayUrl,
        previewImageUrl: displayUrl,
        aspectRatio,
        displayName: capture.label,
        captureMetadata: capture.metadata ?? null,
      },
    );
    childNode.parentId = groupNode.id;
    childNode.extent = 'parent';
    childNode.width = cellWidth;
    childNode.height = cellHeight;
    childNode.style = {
      ...(childNode.style ?? {}),
      width: cellWidth,
      height: cellHeight,
    };
    childNode.selected = false;
    return childNode;
  });

  return {
    nodes: [...deselectedNodes, groupNode, ...childNodes],
    edges: [
      ...edges,
      ...childNodes.map((childNode) => captureEdge(sourceNodeId, childNode.id)),
    ],
    selectedNodeId: groupNode.id,
  };
}
