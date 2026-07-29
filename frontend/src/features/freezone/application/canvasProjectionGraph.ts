// Copyright (c) 2026 AI anime
import type { CanvasEdge, CanvasNode } from "@/features/canvas/domain/canvasNodes";
import {
  projectionScopedId,
  scopeProjectionGraphIds,
} from "@/features/canvas/domain/projectionGraphIds";

export function mergeProjectedCanvasWithLocalCanvas(
  remoteNodes: CanvasNode[],
  remoteEdges: CanvasEdge[],
  localNodes: CanvasNode[],
  localEdges: CanvasEdge[],
  projectionKey: string,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const remoteProjectionRawNodeIds = new Set(remoteNodes.filter((node) =>
    isProjectionManagedNode(node, projectionKey) ||
    isArchivedProjectionNode(node, projectionKey),
  ).map((node) => node.id));
  const remoteProjectionRawEdgeIds = new Set(remoteEdges.filter((edge) =>
    isProjectionManagedEdge(edge, projectionKey),
  ).map((edge) => edge.id));
  const remapLocalProjectionEndpoint = (id: string): string =>
    remoteProjectionRawNodeIds.has(id) ? projectionScopedId(projectionKey, id) : id;
  const scopedRemote = scopeProjectionGraphIds(remoteNodes, remoteEdges);
  const remoteProjectionNodes = uniqueById(scopedRemote.nodes.filter((node) =>
    isProjectionManagedNode(node, projectionKey) ||
    isArchivedProjectionNode(node, projectionKey),
  ));
  const remoteProjectionEdges = uniqueById(scopedRemote.edges.filter((edge) =>
    isProjectionManagedEdge(edge, projectionKey),
  ));
  const remoteProjectionNodeById = new Map(remoteProjectionNodes.map((node) => [node.id, node]));
  const remoteProjectionEdgeById = new Map(remoteProjectionEdges.map((edge) => [edge.id, edge]));
  const remoteProjectionNodeIds = new Set(remoteProjectionNodes.map((node) => node.id));
  const remoteProjectionEdgeIds = new Set(remoteProjectionEdges.map((edge) => edge.id));
  const emittedNodeIds = new Set<string>();
  const finalNodes: CanvasNode[] = [];
  for (const node of localNodes) {
    const replacement = remoteProjectionNodeById.get(node.id);
    if (replacement) {
      finalNodes.push(preserveLocalProjectionNodeLayout(replacement, node));
      emittedNodeIds.add(replacement.id);
      continue;
    }
    if (!isProjectionManagedNode(node, projectionKey)) {
      if (isLegacyUnscopedProjectionNode(node, remoteProjectionRawNodeIds)) {
        continue;
      }
      finalNodes.push(node);
      emittedNodeIds.add(node.id);
    }
  }
  for (const node of remoteProjectionNodes) {
    if (!emittedNodeIds.has(node.id)) {
      finalNodes.push(node);
      emittedNodeIds.add(node.id);
    }
  }
  const finalNodeIds = new Set(finalNodes.map((node) => node.id));
  const emittedEdgeIds = new Set<string>();
  const finalEdges: CanvasEdge[] = [];
  for (const edge of localEdges) {
    const localEdge = {
      ...edge,
      source: remapLocalProjectionEndpoint(edge.source),
      target: remapLocalProjectionEndpoint(edge.target),
    };
    const replacement = remoteProjectionEdgeById.get(localEdge.id);
    if (
      replacement &&
      finalNodeIds.has(replacement.source) &&
      finalNodeIds.has(replacement.target)
    ) {
      finalEdges.push(replacement);
      emittedEdgeIds.add(replacement.id);
      continue;
    }
    if (isProjectionManagedEdge(localEdge, projectionKey)) {
      continue;
    }
    if (isLegacyUnscopedProjectionEdge(localEdge, remoteProjectionRawEdgeIds)) {
      continue;
    }
    if (
      !remoteProjectionEdgeIds.has(localEdge.id) &&
      finalNodeIds.has(localEdge.source) &&
      finalNodeIds.has(localEdge.target)
    ) {
      finalEdges.push(localEdge);
      emittedEdgeIds.add(localEdge.id);
    }
  }
  for (const edge of remoteProjectionEdges) {
    if (emittedEdgeIds.has(edge.id)) continue;
    if (
      finalNodeIds.has(edge.source) &&
      finalNodeIds.has(edge.target) &&
      (remoteProjectionNodeIds.has(edge.source) || remoteProjectionNodeIds.has(edge.target))
    ) {
      finalEdges.push(edge);
      emittedEdgeIds.add(edge.id);
    }
  }
  return { nodes: sortParentNodesBeforeChildren(finalNodes), edges: finalEdges };
}

function preserveLocalProjectionNodeLayout(replacement: CanvasNode, local: CanvasNode): CanvasNode {
  return {
    ...replacement,
    position: local.position,
    parentId: local.parentId,
    extent: local.extent,
    expandParent: local.expandParent,
    origin: local.origin,
    width: local.width ?? replacement.width,
    height: local.height ?? replacement.height,
    measured: local.measured ?? replacement.measured,
    style: local.style ?? replacement.style,
  };
}

export function removeProjectionFromLocalCanvas(
  localNodes: CanvasNode[],
  localEdges: CanvasEdge[],
  projectionKey: string,
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const removedNodeIds = new Set(
    localNodes
      .filter((node) =>
        isProjectionManagedNode(node, projectionKey) ||
        isArchivedProjectionNode(node, projectionKey),
      )
      .map((node) => node.id),
  );
  const nodes = localNodes
    .filter((node) => !removedNodeIds.has(node.id))
    .map((node) => {
      if (!node.parentId || !removedNodeIds.has(node.parentId)) {
        return node;
      }
      return {
        ...node,
        parentId: undefined,
        extent: undefined,
      };
    });
  const edges = localEdges.filter((edge) => {
    if (removedNodeIds.has(edge.source) || removedNodeIds.has(edge.target)) {
      return false;
    }
    return !isProjectionManagedEdge(edge, projectionKey);
  });
  return { nodes: sortParentNodesBeforeChildren(nodes), edges };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const order: string[] = [];
  const byId = new Map<string, T>();
  for (const item of items) {
    if (!byId.has(item.id)) {
      order.push(item.id);
    }
    byId.set(item.id, item);
  }
  return order.map((id) => byId.get(id)!);
}

function sortParentNodesBeforeChildren(nodes: CanvasNode[]): CanvasNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const originalIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: CanvasNode[] = [];

  const visit = (node: CanvasNode) => {
    if (visited.has(node.id)) return;
    if (visiting.has(node.id)) {
      sorted.push(node);
      visited.add(node.id);
      return;
    }
    visiting.add(node.id);
    if (node.parentId) {
      const parent = nodeById.get(node.parentId);
      if (parent) {
        visit(parent);
      }
    }
    visiting.delete(node.id);
    if (!visited.has(node.id)) {
      sorted.push(node);
      visited.add(node.id);
    }
  };

  for (const node of [...nodes].sort((a, b) => (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0))) {
    visit(node);
  }
  return sorted;
}

function isProjectionManagedNode(node: CanvasNode, projectionKey: string): boolean {
  const data = (node.data ?? {}) as {
    projection_key?: unknown;
    user_spawned?: unknown;
  };
  return data.user_spawned !== true && data.projection_key === projectionKey;
}

function isLegacyUnscopedProjectionNode(node: CanvasNode, remoteProjectionRawNodeIds: Set<string>): boolean {
  const data = (node.data ?? {}) as {
    projection_key?: unknown;
    user_spawned?: unknown;
  };
  return (
    data.user_spawned !== true &&
    typeof data.projection_key !== "string" &&
    remoteProjectionRawNodeIds.has(node.id)
  );
}

function isArchivedProjectionNode(node: CanvasNode, projectionKey: string): boolean {
  const data = (node.data ?? {}) as {
    projection_archived?: unknown;
    source_projection_key?: unknown;
  };
  return (
    data.projection_archived === true &&
    data.source_projection_key === projectionKey
  );
}

function isProjectionManagedEdge(edge: CanvasEdge, projectionKey: string): boolean {
  const data = (edge.data ?? {}) as {
    projection_key?: unknown;
    user_spawned?: unknown;
  };
  return data.user_spawned !== true && data.projection_key === projectionKey;
}

function isLegacyUnscopedProjectionEdge(edge: CanvasEdge, remoteProjectionRawEdgeIds: Set<string>): boolean {
  const data = (edge.data ?? {}) as {
    projection_key?: unknown;
    user_spawned?: unknown;
  };
  return (
    data.user_spawned !== true &&
    typeof data.projection_key !== "string" &&
    remoteProjectionRawEdgeIds.has(edge.id)
  );
}
