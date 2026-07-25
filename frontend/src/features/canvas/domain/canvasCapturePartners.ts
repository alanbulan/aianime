// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from './canvasNodes';

function isCaptureChild(node: CanvasNode | undefined): boolean {
  return Boolean(
    node?.parentId
    && (node.data as { captureMetadata?: unknown } | undefined)?.captureMetadata,
  );
}

export function findLinkedCapturePartnerIds(
  draggedId: string,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const dragged = nodeById.get(draggedId);
  if (!dragged || dragged.parentId) {
    return [];
  }

  const partners = new Set<string>();
  if (dragged.type === CANVAS_NODE_TYPES.group) {
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
    if (group?.type === CANVAS_NODE_TYPES.group && !group.parentId) {
      partners.add(group.id);
    }
  }
  return [...partners];
}
