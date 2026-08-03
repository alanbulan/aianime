// Copyright (c) 2026 AI anime
import type { CanvasClipboardSnapshot } from '@/modules/creative_canvas/public';
import {
  getNodeSize,
  hasRectCollision,
  type CanvasNodeSize,
} from '../domain/canvasGeometry';
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
  CanvasNodeType,
} from '../domain/canvasNodes';
import { cloneCanvasNodeData } from './canvasNodeData';

const DUPLICATION_BASE_OFFSETS = [
  { x: 44, y: 30 },
  { x: 72, y: 8 },
  { x: 18, y: 68 },
  { x: 96, y: 42 },
] as const;
const DUPLICATION_FALLBACK_MAX_STEP = 16;
const PASTE_ITERATION_OFFSET = { x: 8, y: 6 } as const;

export interface CanvasClipboardDuplicationOptions {
  explicitOffset?: { x: number; y: number };
  disableOffsetIteration?: boolean;
  suppressSelect?: boolean;
  sourceSnapshot?: CanvasClipboardSnapshot<CanvasNode, CanvasEdge>;
  targetFlowPosition?: { x: number; y: number };
  selectAll?: boolean;
}

export interface CanvasClipboardDuplicationNodePlan {
  sourceNodeId: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: CanvasNodeData;
  size: CanvasNodeSize;
}

export interface CanvasClipboardDuplicationConnectionPlan {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
}

export type CanvasClipboardDuplicationSelection = 'none' | 'first' | 'all';

export interface CanvasClipboardDuplicationPlan {
  nodes: CanvasClipboardDuplicationNodePlan[];
  connections: CanvasClipboardDuplicationConnectionPlan[];
  selection: CanvasClipboardDuplicationSelection;
  advancePasteIteration: boolean;
  sourceProject: string | null;
}

export interface PlanCanvasClipboardDuplicationParams {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  sourceNodeIds: readonly string[];
  pasteIteration: number;
  options?: CanvasClipboardDuplicationOptions;
}

function cloneDataWithoutGenerationState(data: CanvasNodeData): CanvasNodeData {
  const cloned = cloneCanvasNodeData(data);
  const record = cloned as Record<string, unknown>;

  if ('isGenerating' in record) record.isGenerating = false;
  if ('generationStartedAt' in record) record.generationStartedAt = null;
  if ('generationJobId' in record) record.generationJobId = null;
  if ('generationProviderId' in record) record.generationProviderId = null;
  if ('generationClientSessionId' in record) record.generationClientSessionId = null;
  if ('generationStoryboardMetadata' in record) record.generationStoryboardMetadata = undefined;
  if ('generationError' in record) record.generationError = null;
  if ('generationErrorDetails' in record) record.generationErrorDetails = null;
  if ('generationDebugContext' in record) record.generationDebugContext = undefined;

  return cloned;
}

function resolveSelection(
  options: CanvasClipboardDuplicationOptions,
): CanvasClipboardDuplicationSelection {
  if (options.suppressSelect) return 'none';
  return options.selectAll ? 'all' : 'first';
}

function resolveOffset(
  sourceNodes: readonly CanvasNode[],
  existingNodes: readonly CanvasNode[],
  pasteIteration: number,
  options: CanvasClipboardDuplicationOptions,
): { x: number; y: number } {
  if (options.explicitOffset) {
    return options.explicitOffset;
  }

  const offsetStep = options.disableOffsetIteration ? 0 : pasteIteration;
  const isAvailable = (offset: { x: number; y: number }) =>
    sourceNodes.every((node) => {
      const size = getNodeSize(node);
      return !hasRectCollision(
        {
          x: node.position.x + offset.x + offsetStep * PASTE_ITERATION_OFFSET.x,
          y: node.position.y + offset.y + offsetStep * PASTE_ITERATION_OFFSET.y,
          width: size.width,
          height: size.height,
        },
        existingNodes,
        new Set<string>(),
      );
    });

  const baseOffset = DUPLICATION_BASE_OFFSETS.find(isAvailable);
  if (baseOffset) {
    return baseOffset;
  }

  for (let step = 1; step <= DUPLICATION_FALLBACK_MAX_STEP; step += 1) {
    const candidate = { x: 24 + step * 26, y: 16 + step * 18 };
    if (isAvailable(candidate)) {
      return candidate;
    }
  }

  return DUPLICATION_BASE_OFFSETS[0];
}

export function planCanvasClipboardDuplication({
  nodes,
  edges,
  sourceNodeIds,
  pasteIteration,
  options = {},
}: PlanCanvasClipboardDuplicationParams): CanvasClipboardDuplicationPlan | null {
  const snapshot = options.sourceSnapshot;
  const sourceNodes = snapshot
    ? snapshot.nodes
    : nodes.filter((node) => sourceNodeIds.includes(node.id));
  if (sourceNodes.length === 0) {
    return null;
  }

  const sourceIdSet = new Set(sourceNodes.map((node) => node.id));
  const sourceEdges = snapshot ? snapshot.edges : edges;
  const internalEdges = sourceEdges.filter(
    (edge) => sourceIdSet.has(edge.source) && sourceIdSet.has(edge.target),
  );
  const targetPosition = options.targetFlowPosition;
  const groupMinX = targetPosition
    ? Math.min(...sourceNodes.map((node) => node.position.x))
    : 0;
  const groupMinY = targetPosition
    ? Math.min(...sourceNodes.map((node) => node.position.y))
    : 0;
  const offsetStep = options.disableOffsetIteration ? 0 : pasteIteration;
  const offset = targetPosition
    ? { x: 0, y: 0 }
    : resolveOffset(sourceNodes, nodes, pasteIteration, options);

  return {
    nodes: sourceNodes.map((sourceNode) => ({
      sourceNodeId: sourceNode.id,
      type: sourceNode.type as CanvasNodeType,
      position: targetPosition
        ? {
            x: targetPosition.x + sourceNode.position.x - groupMinX,
            y: targetPosition.y + sourceNode.position.y - groupMinY,
          }
        : {
            x:
              sourceNode.position.x
              + offset.x
              + offsetStep * PASTE_ITERATION_OFFSET.x,
            y:
              sourceNode.position.y
              + offset.y
              + offsetStep * PASTE_ITERATION_OFFSET.y,
          },
      data: cloneDataWithoutGenerationState(sourceNode.data),
      size: getNodeSize(sourceNode),
    })),
    connections: internalEdges.map((edge) => ({
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourceHandle: edge.sourceHandle ?? 'source',
      targetHandle: edge.targetHandle ?? 'target',
    })),
    selection: resolveSelection(options),
    advancePasteIteration: !options.disableOffsetIteration && !targetPosition,
    sourceProject: snapshot?.sourceProject ?? null,
  };
}
