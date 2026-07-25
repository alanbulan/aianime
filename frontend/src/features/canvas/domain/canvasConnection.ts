// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from './canvasNodes';
import {
  isUpstreamConnectionAllowed,
  nodeHasSourceHandle,
  nodeHasTargetHandle,
} from './nodeRegistry';

export type CanvasConnectionMode = 'react_flow' | 'programmatic';

export type CanvasConnectionRejectionReason =
  | 'missing_endpoint'
  | 'missing_handle_capability'
  | 'disallowed_upstream_type'
  | 'three_d_world_input_exists';

export type CanvasConnectionValidation =
  | { ok: true }
  | { ok: false; reason: CanvasConnectionRejectionReason };

export function validateCanvasConnection(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  candidate: { source: string; target: string },
  mode: CanvasConnectionMode,
): CanvasConnectionValidation {
  const sourceNode = nodes.find((node) => node.id === candidate.source);
  const targetNode = nodes.find((node) => node.id === candidate.target);

  if (mode === 'react_flow') {
    if (
      targetNode?.type === CANVAS_NODE_TYPES.threeDWorld
      && edges.some(
        (edge) =>
          edge.target === candidate.target && edge.source !== candidate.source,
      )
    ) {
      return { ok: false, reason: 'three_d_world_input_exists' };
    }
    if (
      sourceNode
      && targetNode
      && !isUpstreamConnectionAllowed(sourceNode.type, targetNode.type)
    ) {
      return { ok: false, reason: 'disallowed_upstream_type' };
    }
    return { ok: true };
  }

  if (!sourceNode || !targetNode) {
    return { ok: false, reason: 'missing_endpoint' };
  }
  if (!nodeHasSourceHandle(sourceNode.type) || !nodeHasTargetHandle(targetNode.type)) {
    return { ok: false, reason: 'missing_handle_capability' };
  }
  if (!isUpstreamConnectionAllowed(sourceNode.type, targetNode.type)) {
    return { ok: false, reason: 'disallowed_upstream_type' };
  }
  return { ok: true };
}
