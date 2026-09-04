// Copyright (c) 2026 AI anime
import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';

const DUPLICATION_BASE_OFFSETS = [
  { x: 44, y: 30 },
  { x: 72, y: 8 },
  { x: 18, y: 68 },
  { x: 96, y: 42 },
] as const;
const DUPLICATION_FALLBACK_MAX_STEP = 16;
const PASTE_ITERATION_OFFSET = { x: 8, y: 6 } as const;

export interface CanvasClipboardDuplicationSourceNode<TNodeData extends object> {
  id: string;
  position: { x: number; y: number };
  data: TNodeData;
}

export interface CanvasClipboardDuplicationSourceEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface CanvasClipboardNodeSize {
  width: number;
  height: number;
}

export interface CanvasClipboardRect extends CanvasClipboardNodeSize {
  x: number;
  y: number;
}

export interface CanvasClipboardDuplicationPorts<
  TNode,
  TNodeType,
  TNodeData extends object,
> {
  resolveNodeType: (node: TNode) => TNodeType;
  cloneNodeData: (data: TNodeData) => TNodeData;
  getNodeSize: (node: TNode) => CanvasClipboardNodeSize;
  hasRectCollision: (
    candidateRect: CanvasClipboardRect,
    nodes: readonly TNode[],
  ) => boolean;
}

export interface CanvasClipboardDuplicationOptions<TNode, TEdge> {
  explicitOffset?: { x: number; y: number };
  disableOffsetIteration?: boolean;
  suppressSelect?: boolean;
  sourceSnapshot?: CanvasClipboardSnapshot<TNode, TEdge>;
  targetFlowPosition?: { x: number; y: number };
  selectAll?: boolean;
}

export interface CanvasClipboardDuplicationNodePlan<
  TNodeType,
  TNodeData extends object,
> {
  sourceNodeId: string;
  type: TNodeType;
  position: { x: number; y: number };
  data: TNodeData;
  size: CanvasClipboardNodeSize;
}

export interface CanvasClipboardDuplicationConnectionPlan {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
}

export type CanvasClipboardDuplicationSelection = 'none' | 'first' | 'all';

export interface CanvasClipboardDuplicationPlan<
  TNodeType,
  TNodeData extends object,
> {
  nodes: CanvasClipboardDuplicationNodePlan<TNodeType, TNodeData>[];
  connections: CanvasClipboardDuplicationConnectionPlan[];
  selection: CanvasClipboardDuplicationSelection;
  advancePasteIteration: boolean;
  sourceProject: string | null;
}

export interface PlanCanvasClipboardDuplicationParams<
  TNode extends CanvasClipboardDuplicationSourceNode<TNodeData>,
  TEdge extends CanvasClipboardDuplicationSourceEdge,
  TNodeType,
  TNodeData extends object,
> {
  nodes: readonly TNode[];
  edges: readonly TEdge[];
  sourceNodeIds: readonly string[];
  pasteIteration: number;
  ports: CanvasClipboardDuplicationPorts<TNode, TNodeType, TNodeData>;
  options?: CanvasClipboardDuplicationOptions<TNode, TEdge>;
}

function cloneDataWithoutGenerationState<TNodeData extends object>(
  data: TNodeData,
  cloneNodeData: (data: TNodeData) => TNodeData,
): TNodeData {
  const cloned = cloneNodeData(data);
  const clearedValues = [
    ['isGenerating', false],
    ['generationStartedAt', null],
    ['generationJobId', null],
    ['generationProviderId', null],
    ['generationClientSessionId', null],
    ['generationTaskKey', null],
    ['generationTaskType', null],
    ['generationTaskJobId', null],
    ['generationTaskRefs', null],
    ['generationStoryboardMetadata', undefined],
    ['generationError', null],
    ['generationErrorDetails', null],
    ['generationDebugContext', undefined],
  ] as const;

  for (const [key, value] of clearedValues) {
    if (Reflect.has(cloned, key)) {
      Reflect.set(cloned, key, value);
    }
  }
  return cloned;
}

function resolveSelection<TNode, TEdge>(
  options: CanvasClipboardDuplicationOptions<TNode, TEdge>,
): CanvasClipboardDuplicationSelection {
  if (options.suppressSelect) return 'none';
  return options.selectAll ? 'all' : 'first';
}

function resolveOffset<
  TNode extends CanvasClipboardDuplicationSourceNode<TNodeData>,
  TNodeType,
  TNodeData extends object,
>(
  sourceNodes: readonly TNode[],
  existingNodes: readonly TNode[],
  pasteIteration: number,
  options: CanvasClipboardDuplicationOptions<TNode, unknown>,
  ports: CanvasClipboardDuplicationPorts<TNode, TNodeType, TNodeData>,
): { x: number; y: number } {
  if (options.explicitOffset) {
    return options.explicitOffset;
  }

  const offsetStep = options.disableOffsetIteration ? 0 : pasteIteration;
  const isAvailable = (offset: { x: number; y: number }) =>
    sourceNodes.every((node) => {
      const size = ports.getNodeSize(node);
      return !ports.hasRectCollision(
        {
          x: node.position.x + offset.x + offsetStep * PASTE_ITERATION_OFFSET.x,
          y: node.position.y + offset.y + offsetStep * PASTE_ITERATION_OFFSET.y,
          width: size.width,
          height: size.height,
        },
        existingNodes,
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

export function planCanvasClipboardDuplication<
  TNode extends CanvasClipboardDuplicationSourceNode<TNodeData>,
  TEdge extends CanvasClipboardDuplicationSourceEdge,
  TNodeType,
  TNodeData extends object,
>({
  nodes,
  edges,
  sourceNodeIds,
  pasteIteration,
  ports,
  options = {},
}: PlanCanvasClipboardDuplicationParams<
  TNode,
  TEdge,
  TNodeType,
  TNodeData
>): CanvasClipboardDuplicationPlan<TNodeType, TNodeData> | null {
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
    : resolveOffset(sourceNodes, nodes, pasteIteration, options, ports);

  return {
    nodes: sourceNodes.map((sourceNode) => ({
      sourceNodeId: sourceNode.id,
      type: ports.resolveNodeType(sourceNode),
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
      data: cloneDataWithoutGenerationState(
        sourceNode.data,
        ports.cloneNodeData,
      ),
      size: ports.getNodeSize(sourceNode),
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
