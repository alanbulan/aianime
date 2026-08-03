// Copyright (c) 2026 AI anime
export interface CanvasCapturePartnerNode<TNodeType = string> {
  id: string;
  type: TNodeType;
  parentId?: string;
  data?: unknown;
}

export interface CanvasCapturePartnerEdge {
  source: string;
  target: string;
}

function hasCaptureMetadata(data: unknown): boolean {
  return Boolean(
    data
    && typeof data === 'object'
    && 'captureMetadata' in data
    && (data as { captureMetadata?: unknown }).captureMetadata,
  );
}

function isCaptureChild<TNodeType>(
  node: CanvasCapturePartnerNode<TNodeType> | undefined,
): boolean {
  return Boolean(node?.parentId && hasCaptureMetadata(node.data));
}

export function findLinkedCapturePartnerIds<TNodeType>(
  draggedId: string,
  nodes: readonly CanvasCapturePartnerNode<TNodeType>[],
  edges: readonly CanvasCapturePartnerEdge[],
  groupNodeType: TNodeType,
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const dragged = nodeById.get(draggedId);
  if (!dragged || dragged.parentId) {
    return [];
  }

  const partners = new Set<string>();
  if (dragged.type === groupNodeType) {
    const childIds = new Set(
      nodes
        .filter((node) => node.parentId === draggedId && isCaptureChild(node))
        .map((node) => node.id),
    );
    if (childIds.size === 0) {
      return [];
    }
    for (const edge of edges) {
      if (!childIds.has(edge.target)) {
        continue;
      }
      const source = nodeById.get(edge.source);
      if (source && !source.parentId && source.id !== draggedId) {
        partners.add(source.id);
      }
    }
    return [...partners];
  }

  for (const edge of edges) {
    if (edge.source !== draggedId) {
      continue;
    }
    const target = nodeById.get(edge.target);
    if (!isCaptureChild(target) || !target?.parentId) {
      continue;
    }
    const group = nodeById.get(target.parentId);
    if (group?.type === groupNodeType && !group.parentId) {
      partners.add(group.id);
    }
  }
  return [...partners];
}
