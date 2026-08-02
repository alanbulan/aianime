// Copyright (c) 2026 AI anime
import {
  type SkillDefinition,
} from '@/modules/creative_canvas/public';
import {
  validateCandidateBindingRoleCandidate,
  validatePropagatingEdgeCandidate,
} from '@/modules/creative_canvas/public';

import {
  validateCanvasConnection,
  type CanvasConnectionRejectionReason,
} from '../domain/canvasConnection';
import { normalizeHandleId } from '../domain/canvasEdgeNormalization';
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import { applySkillRoleBindingConnection } from '../domain/skillConnectionEdges';

export interface CanvasEdgeCreationResult {
  edgeId: string;
  edges: CanvasEdge[];
  created: boolean;
}

export interface CanvasDataEdgeCreationOptions {
  id?: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface CanvasPreparedConnection {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  type: 'disconnectableEdge';
}

export interface CanvasGraphConnection {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface CanvasSpawnConnectionOrigin {
  nodeId: string;
  handleType: 'source' | 'target';
}

export type CanvasGraphConnectionPlan =
  | { kind: 'regular' }
  | { kind: 'skill_binding'; edges: CanvasEdge[] }
  | {
      kind: 'skill_registry_unavailable';
      skillId: string;
      skillNodeId: string;
    };

export type CanvasDataEdgeCreationOutcome =
  | { ok: true; result: CanvasEdgeCreationResult }
  | {
      ok: false;
      stage: 'connection';
      reason: CanvasConnectionRejectionReason;
    }
  | {
      ok: false;
      stage: 'propagation' | 'role';
      reason: string;
      edge: CanvasEdge;
    };

function skillIdFromNode(node: CanvasNode): string {
  const skillId = (node.data as { skill_id?: unknown }).skill_id;
  return typeof skillId === 'string' ? skillId : '';
}

export function planCanvasGraphConnection({
  nodes,
  edges,
  connection,
  skillById,
  explicitSkill,
}: {
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  connection: CanvasGraphConnection;
  skillById: ReadonlyMap<string, SkillDefinition>;
  explicitSkill?: SkillDefinition | null;
}): CanvasGraphConnectionPlan {
  const targetNode = nodes.find((node) => node.id === connection.target);
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const skillNode =
    targetNode?.type === CANVAS_NODE_TYPES.skill
      ? targetNode
      : sourceNode?.type === CANVAS_NODE_TYPES.skill
        ? sourceNode
        : null;
  if (!skillNode) {
    return { kind: 'regular' };
  }

  const skillId = skillIdFromNode(skillNode);
  const skillSpec = explicitSkill ?? skillById.get(skillId);
  if (!skillSpec) {
    return {
      kind: 'skill_registry_unavailable',
      skillId,
      skillNodeId: skillNode.id,
    };
  }

  if (
    sourceNode?.type === CANVAS_NODE_TYPES.skill
    && targetNode?.type !== CANVAS_NODE_TYPES.skill
  ) {
    const sourceRole = normalizeHandleId(connection.sourceHandle)?.split(':', 1)[0] ?? '';
    if (!sourceRole || !skillSpec.inputs.some((input) => input.role === sourceRole)) {
      return { kind: 'regular' };
    }
  }

  return {
    kind: 'skill_binding',
    edges: applySkillRoleBindingConnection({
      nodes,
      edges,
      connection,
      skillSpec,
    }),
  };
}

export function planSingleBeatContextBinding(
  nodes: readonly CanvasNode[],
  skillNodeId: string,
  skill: SkillDefinition,
): CanvasGraphConnection | null {
  if (!skill.inputs.some((input) => input.role === 'beat_context')) {
    return null;
  }
  const beatContextNodes = nodes.filter(
    (node) => node.type === CANVAS_NODE_TYPES.beatContext,
  );
  if (beatContextNodes.length !== 1) {
    return null;
  }
  return {
    source: beatContextNodes[0].id,
    target: skillNodeId,
    sourceHandle: 'source',
    targetHandle: 'beat_context',
  };
}

export function planCanvasSpawnConnections({
  spawnedNodeId,
  pendingConnection,
  batchSourceIds,
}: {
  spawnedNodeId: string;
  pendingConnection: CanvasSpawnConnectionOrigin | null;
  batchSourceIds: readonly string[] | null;
}): CanvasGraphConnection[] {
  if (batchSourceIds && batchSourceIds.length > 0) {
    return batchSourceIds.map((sourceId) => ({
      source: sourceId,
      target: spawnedNodeId,
      sourceHandle: 'source',
      targetHandle: 'target',
    }));
  }
  if (!pendingConnection) {
    return [];
  }
  return pendingConnection.handleType === 'source'
    ? [{
        source: pendingConnection.nodeId,
        target: spawnedNodeId,
        sourceHandle: 'source',
        targetHandle: 'target',
      }]
    : [{
        source: spawnedNodeId,
        target: pendingConnection.nodeId,
        sourceHandle: 'source',
        targetHandle: 'target',
      }];
}

export function prepareCanvasReactFlowConnection(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  connection: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
): CanvasPreparedConnection | null {
  const validation = validateCanvasConnection(
    nodes,
    edges,
    connection,
    'react_flow',
  );
  if (!validation.ok) {
    return null;
  }
  return {
    source: connection.source,
    target: connection.target,
    sourceHandle: normalizeHandleId(connection.sourceHandle) ?? 'source',
    targetHandle: normalizeHandleId(connection.targetHandle) ?? 'target',
    type: 'disconnectableEdge',
  };
}

export function createCanvasProgrammaticEdge(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  source: string,
  target: string,
): CanvasEdgeCreationResult | null {
  const validation = validateCanvasConnection(
    nodes,
    edges,
    { source, target },
    'programmatic',
  );
  if (!validation.ok) {
    return null;
  }

  const edgeId = `e-${source}-${target}`;
  if (edges.some((edge) => edge.id === edgeId)) {
    return { edgeId, edges: [...edges], created: false };
  }
  const edge: CanvasEdge = {
    id: edgeId,
    source,
    target,
    sourceHandle: 'source',
    targetHandle: 'target',
    type: 'disconnectableEdge',
  };
  return { edgeId, edges: [...edges, edge], created: true };
}

export function createCanvasDataEdge(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  source: string,
  target: string,
  data: Record<string, unknown>,
  options?: CanvasDataEdgeCreationOptions,
): CanvasDataEdgeCreationOutcome {
  const connectionValidation = validateCanvasConnection(
    nodes,
    edges,
    { source, target },
    'programmatic',
  );
  if (!connectionValidation.ok) {
    return {
      ok: false,
      stage: 'connection',
      reason: connectionValidation.reason,
    };
  }

  const edgeId = options?.id
    || `e-${source}-${target}-${String(data.edgeKind || 'data')}`;
  if (edges.some((edge) => edge.id === edgeId)) {
    return {
      ok: true,
      result: { edgeId, edges: [...edges], created: false },
    };
  }
  const edge: CanvasEdge = {
    id: edgeId,
    source,
    target,
    sourceHandle: normalizeHandleId(options?.sourceHandle) ?? 'source',
    targetHandle: normalizeHandleId(options?.targetHandle) ?? 'target',
    type: 'disconnectableEdge',
    data,
  };
  const propagationValidation = validatePropagatingEdgeCandidate(
    nodes,
    edges,
    edge,
  );
  if (!propagationValidation.ok) {
    return {
      ok: false,
      stage: 'propagation',
      reason: propagationValidation.reason,
      edge,
    };
  }
  const roleValidation = validateCandidateBindingRoleCandidate(edges, edge);
  if (!roleValidation.ok) {
    return {
      ok: false,
      stage: 'role',
      reason: roleValidation.reason,
      edge,
    };
  }

  return {
    ok: true,
    result: { edgeId, edges: [...edges, edge], created: true },
  };
}
