// Copyright (c) 2026 AI anime

/** Collect one-hop upstream nodes in edge connection order. */
export function upstreamNodesInEdgeOrder<T extends { id: string }>(
  nodes: readonly T[],
  edges: ReadonlyArray<{ source: string; target: string }>,
  targetId: string,
): T[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => byId.get(edge.source))
    .filter((node): node is T => node !== undefined);
}

/** Keep the node-owned reference first and deduplicate upstream references. */
export function orderedReferenceUrlsWithOwnFirst(
  ownReferenceUrl: string | null,
  upstreamUrls: readonly string[],
): string[] {
  return Array.from(
    new Set(
      [ownReferenceUrl, ...upstreamUrls].filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      ),
    ),
  );
}

/** Apply explicit reference order, preserving connection order for the rest. */
export function sortUpstreamByReferenceOrder<T extends { id: string }>(
  nodes: readonly T[],
  referenceOrder: readonly string[] | undefined,
): T[] {
  const orderIndex = new Map<string, number>();
  (referenceOrder ?? []).forEach((nodeId, index) =>
    orderIndex.set(nodeId, index),
  );
  const inputIndex = new Map<string, number>();
  nodes.forEach((node, index) => inputIndex.set(node.id, index));
  return [...nodes].sort((left, right) => {
    const leftIndex = orderIndex.has(left.id)
      ? (orderIndex.get(left.id) as number)
      : Number.POSITIVE_INFINITY;
    const rightIndex = orderIndex.has(right.id)
      ? (orderIndex.get(right.id) as number)
      : Number.POSITIVE_INFINITY;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return (inputIndex.get(left.id) ?? 0) - (inputIndex.get(right.id) ?? 0);
  });
}
