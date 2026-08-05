// Copyright (c) 2026 AI anime
import type { UpstreamGraphEdge, UpstreamGraphNode } from "./graphContentResolver";

/**
 * Pure projection of a single node into its referenceable image URLs. Exported
 * so the per-node subscription hook (`useUpstreamImages`) can map a shallow-
 * selected slice of upstream nodes without re-walking the whole graph.
 */
export function extractUpstreamImages(node: UpstreamGraphNode | undefined): string[] {
  if (!node) {
    return [];
  }

  if (
    node.type === "uploadNode" ||
    node.type === "imageNode" ||
    node.type === "exportImageNode"
  ) {
    const data = node.data ?? {};
    return typeof data.imageUrl === "string" && data.imageUrl.length > 0
      ? [data.imageUrl]
      : [];
  }

  return [];
}

export function collectInputImages(
  nodeId: string,
  nodes: UpstreamGraphNode[],
  edges: UpstreamGraphEdge[],
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceNodeIds = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => edge.source);

  const images = sourceNodeIds
    .map((sourceId) => nodeById.get(sourceId))
    .flatMap((node) => extractUpstreamImages(node));

  return [...new Set(images)];
}
