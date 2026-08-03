// Copyright (c) 2026 AI anime
import {
  isUpstreamConnectionAllowed,
  nodeHasSourceHandle,
  nodeHasTargetHandle,
  type CanvasConnectionNodeType,
} from './canvasConnection';

export interface CanvasEdgeNormalizationNodeLike {
  id: string;
  type: CanvasConnectionNodeType;
  data?: unknown;
}

export interface CanvasEdgeNormalizationEdgeLike {
  id: string;
  source: string;
  target: string;
  sourceHandle?: unknown;
  targetHandle?: unknown;
  type?: string;
  data?: unknown;
}

export function normalizeHandleId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return undefined;
  }
  return trimmed;
}

function defaultSkillSourceHandle(
  node: CanvasEdgeNormalizationNodeLike,
  edge: CanvasEdgeNormalizationEdgeLike,
): string | undefined {
  if (node.type !== 'skillNode') {
    return undefined;
  }
  const skillId = (node.data as { skill_id?: unknown } | undefined)?.skill_id;
  const role = (edge.data as { role?: unknown } | undefined)?.role;
  if (skillId === 'freezone.scene_360' && role === 'scene_360_canonical') {
    return 'scene_360_candidate';
  }
  return undefined;
}

function isNoReferenceEdge(edge: CanvasEdgeNormalizationEdgeLike): boolean {
  const targetHandle =
    typeof edge.targetHandle === 'string' && edge.targetHandle.trim()
      ? edge.targetHandle.trim()
      : '';
  if (targetHandle === 'identity:__NO_CHARACTER__' || targetHandle === 'prop:__NO_PROP__') {
    return true;
  }
  const data = edge.data;
  const referenceTarget =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>).reference_target
      : undefined;
  if (!referenceTarget || typeof referenceTarget !== 'object' || Array.isArray(referenceTarget)) {
    return false;
  }
  const target = referenceTarget as Record<string, unknown>;
  return target.identity_id === '__NO_CHARACTER__' || target.prop_id === '__NO_PROP__';
}

function edgeDataRecord(
  edge: CanvasEdgeNormalizationEdgeLike,
): Record<string, unknown> {
  return edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
    ? (edge.data as Record<string, unknown>)
    : {};
}

function sourceRolePriority(
  node: CanvasEdgeNormalizationNodeLike | undefined,
): number {
  const data = node?.data as { __freezone_source?: unknown } | undefined;
  const source =
    data?.__freezone_source
    && typeof data.__freezone_source === 'object'
    && !Array.isArray(data.__freezone_source)
      ? (data.__freezone_source as Record<string, unknown>)
      : null;
  const role = typeof source?.role === 'string' ? source.role.trim() : '';
  if (role === 'character_identity' || role === 'prop_reference') {
    return 0;
  }
  if (role === 'character_portrait') {
    return 1;
  }
  return 2;
}

function referenceEdgeKey(edge: CanvasEdgeNormalizationEdgeLike): string | null {
  const data = edgeDataRecord(edge);
  const role = String(data.role || '').trim();
  if (role !== 'identity' && role !== 'prop') {
    return null;
  }
  const targetHandle = typeof edge.targetHandle === 'string' ? edge.targetHandle.trim() : '';
  if (!targetHandle.startsWith(`${role}:`)) {
    return null;
  }
  const referenceId = targetHandle.slice(role.length + 1).trim();
  return referenceId ? `${edge.target}:${role}:${referenceId}` : null;
}

function dedupeReferenceInputEdges<TEdge extends CanvasEdgeNormalizationEdgeLike>(
  edges: TEdge[],
  nodeMap: ReadonlyMap<string, CanvasEdgeNormalizationNodeLike>,
): TEdge[] {
  const selectedIndexByKey = new Map<string, number>();
  const droppedIndexes = new Set<number>();
  for (const [index, edge] of edges.entries()) {
    const key = referenceEdgeKey(edge);
    if (!key) continue;
    const existingIndex = selectedIndexByKey.get(key);
    if (existingIndex === undefined) {
      selectedIndexByKey.set(key, index);
      continue;
    }
    const currentPriority = sourceRolePriority(nodeMap.get(edge.source));
    const existingPriority = sourceRolePriority(nodeMap.get(edges[existingIndex].source));
    if (currentPriority < existingPriority) {
      droppedIndexes.add(existingIndex);
      selectedIndexByKey.set(key, index);
    } else {
      droppedIndexes.add(index);
    }
  }
  return edges.filter((_edge, index) => !droppedIndexes.has(index));
}

export function normalizeEdgesWithNodes<
  TEdge extends CanvasEdgeNormalizationEdgeLike,
>(
  rawEdges: TEdge[],
  nodes: CanvasEdgeNormalizationNodeLike[],
): TEdge[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node] as const));
  const normalizedEdges = rawEdges
    .filter((edge) => {
      if (isNoReferenceEdge(edge)) return false;
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (!sourceNode || !targetNode) return false;
      if (!nodeHasSourceHandle(sourceNode.type) || !nodeHasTargetHandle(targetNode.type)) {
        return false;
      }
      return isUpstreamConnectionAllowed(sourceNode.type, targetNode.type);
    })
    .map((edge) => ({
      ...edge,
      type: edge.type ?? 'disconnectableEdge',
      sourceHandle:
        normalizeHandleId(edge.sourceHandle)
        ?? defaultSkillSourceHandle(nodeMap.get(edge.source) as CanvasEdgeNormalizationNodeLike, edge)
        ?? 'source',
      targetHandle: normalizeHandleId(edge.targetHandle) ?? 'target',
    }));

  const referenceDedupedEdges = dedupeReferenceInputEdges(normalizedEdges, nodeMap);
  const edgeIndexById = new Map<string, number>();
  const dedupedEdges: TEdge[] = [];
  for (const edge of referenceDedupedEdges) {
    const existingIndex = edgeIndexById.get(edge.id);
    if (existingIndex === undefined) {
      edgeIndexById.set(edge.id, dedupedEdges.length);
      dedupedEdges.push(edge);
      continue;
    }
    dedupedEdges[existingIndex] = edge;
  }
  return dedupedEdges;
}
