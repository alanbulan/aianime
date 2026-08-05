// Copyright (c) 2026 AI anime
export interface DuplicationGraphNode {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  selected?: boolean;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  parentId?: string;
  extent?: string;
  [key: string]: unknown;
}

export interface DuplicationGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string | null;
  [key: string]: unknown;
}

export interface DuplicationCreatedNode {
  id: string;
  type?: string | null;
  position: { x: number; y: number };
  data?: Record<string, unknown> | null;
  parentId?: string;
  extent?: string;
  selected?: boolean;
  [key: string]: unknown;
}

export interface DuplicationNodeFactory {
  createNode: (
    type: unknown,
    position: unknown,
    data?: unknown,
  ) => DuplicationCreatedNode;
}

export interface CanvasNodeDuplicationResult {
  nodes: DuplicationCreatedNode[];
  edges: DuplicationGraphEdge[];
  createdIds: string[];
}

function sourceNodeHeight(source: DuplicationGraphNode): number {
  return source.measured?.height
    ?? (typeof source.height === "number" ? source.height : 360);
}

function cloneIncomingEdge(
  edge: DuplicationGraphEdge,
  source: string,
  target: string,
): DuplicationGraphEdge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    sourceHandle: edge.sourceHandle ?? "source",
    targetHandle: edge.targetHandle ?? "target",
    type: "disconnectableEdge",
  };
}

export function duplicateCanvasNodeAsSibling(
  nodes: DuplicationGraphNode[],
  edges: DuplicationGraphEdge[],
  sourceNodeId: string,
  index: number,
  dataOverrides: Record<string, unknown>,
  nodeFactory: DuplicationNodeFactory,
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
      ...source.data,
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
  nodes: DuplicationGraphNode[],
  edges: DuplicationGraphEdge[],
  nodeIds: string[],
  nodeFactory: DuplicationNodeFactory,
): CanvasNodeDuplicationResult {
  const sourceSet = new Set(nodeIds);
  const newNodes: DuplicationCreatedNode[] = [];
  const createdIds: string[] = [];
  const idMap = new Map<string, string>();

  for (const sourceNodeId of nodeIds) {
    const source = nodes.find((node) => node.id === sourceNodeId);
    if (!source) {
      continue;
    }

    const sourceData = source.data;
    const nameOverrides: Record<string, unknown> = {};
    if (typeof sourceData.displayName === "string" && sourceData.displayName) {
      nameOverrides.displayName = `${sourceData.displayName} - 副本`;
    }
    if (typeof sourceData.label === "string" && sourceData.label) {
      nameOverrides.label = `${sourceData.label} - 副本`;
    }

    const newNode = nodeFactory.createNode(
      source.type,
      {
        x: source.position.x,
        y: source.position.y + sourceNodeHeight(source) + 24,
      },
      {
        ...sourceData,
        ...nameOverrides,
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

  const newEdges: DuplicationGraphEdge[] = [];
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
