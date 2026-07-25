// Copyright (c) 2026 AI anime
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
} from '../domain/canvasNodes';
import type { NodeFactory } from './ports';

export interface CanvasNodeDuplicationResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  createdIds: string[];
}

function sourceNodeHeight(source: CanvasNode): number {
  return source.measured?.height
    ?? (typeof source.height === 'number' ? source.height : 360);
}

function cloneIncomingEdge(
  edge: CanvasEdge,
  source: string,
  target: string,
): CanvasEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    sourceHandle: edge.sourceHandle ?? 'source',
    targetHandle: edge.targetHandle ?? 'target',
    type: 'disconnectableEdge',
  };
}

export function duplicateCanvasNodeAsSibling(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  sourceNodeId: string,
  index: number,
  dataOverrides: Partial<CanvasNodeData>,
  nodeFactory: NodeFactory,
): CanvasNodeDuplicationResult | null {
  const source = nodes.find((node) => node.id === sourceNodeId);
  if (!source) {
    return null;
  }

  const newNode = nodeFactory.createNode(
    source.type,
    {
      x: source.position.x,
      y: source.position.y + (sourceNodeHeight(source) + 24) * index,
    },
    {
      ...(source.data as Partial<CanvasNodeData>),
      ...dataOverrides,
    },
  );
  const clonedEdges = edges
    .filter((edge) => edge.target === sourceNodeId)
    .map((edge) => cloneIncomingEdge(edge, edge.source, newNode.id))
    .filter((edge) => !edges.some((existing) => existing.id === edge.id));

  return {
    nodes: [...nodes, newNode],
    edges: [...edges, ...clonedEdges],
    createdIds: [newNode.id],
  };
}

export function duplicateCanvasNodesAsSiblings(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  nodeIds: string[],
  nodeFactory: NodeFactory,
): CanvasNodeDuplicationResult {
  const sourceSet = new Set(nodeIds);
  const newNodes: CanvasNode[] = [];
  const createdIds: string[] = [];
  const idMap = new Map<string, string>();

  for (const sourceNodeId of nodeIds) {
    const source = nodes.find((node) => node.id === sourceNodeId);
    if (!source) {
      continue;
    }

    const sourceData = source.data as Record<string, unknown>;
    const nameOverrides: Record<string, unknown> = {};
    if (typeof sourceData.displayName === 'string' && sourceData.displayName) {
      nameOverrides.displayName = `${sourceData.displayName} - 副本`;
    }
    if (typeof sourceData.label === 'string' && sourceData.label) {
      nameOverrides.label = `${sourceData.label} - 副本`;
    }

    const newNode = nodeFactory.createNode(
      source.type,
      {
        x: source.position.x,
        y: source.position.y + sourceNodeHeight(source) + 24,
      },
      {
        ...(source.data as Partial<CanvasNodeData>),
        ...(nameOverrides as Partial<CanvasNodeData>),
      },
    );
    if (source.parentId) {
      newNode.parentId = source.parentId;
      newNode.extent = source.extent;
    }

    idMap.set(sourceNodeId, newNode.id);
    createdIds.push(newNode.id);
    newNodes.push(newNode);
  }

  if (newNodes.length === 0) {
    return { nodes, edges, createdIds };
  }

  const newEdges: CanvasEdge[] = [];
  for (const edge of edges) {
    const newTarget = idMap.get(edge.target);
    if (!newTarget) {
      continue;
    }
    const newSource = idMap.get(edge.source) ?? edge.source;
    newEdges.push(cloneIncomingEdge(edge, newSource, newTarget));
  }

  return {
    nodes: [
      ...nodes.map((node) =>
        node.selected || sourceSet.has(node.id)
          ? { ...node, selected: false }
          : node,
      ),
      ...newNodes.map((node) => ({ ...node, selected: true })),
    ],
    edges: [...edges, ...newEdges],
    createdIds,
  };
}
