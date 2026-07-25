// Copyright (c) 2026 AI anime
import {
  validateCandidateBindingRoleCandidate,
  validatePropagatingEdgeCandidate,
} from '@/features/freezone/context/mainlineContext';

import {
  validateCanvasConnection,
  type CanvasConnectionRejectionReason,
} from '../domain/canvasConnection';
import { normalizeHandleId } from '../domain/canvasEdgeNormalization';
import type { CanvasEdge, CanvasNode } from '../domain/canvasNodes';

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
