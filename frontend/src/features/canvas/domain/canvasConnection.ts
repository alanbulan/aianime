// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
} from './canvasNodes';
import {
  getAllowedUpstreamSourceTypes,
  getConnectMenuNodeTypes,
  getDownstreamSpawnTypes,
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

const THREE_D_WORLD_MANUAL_SOURCE_TYPES = new Set<CanvasNodeType>([
  CANVAS_NODE_TYPES.upload,
  CANVAS_NODE_TYPES.exportImage,
  CANVAS_NODE_TYPES.imageGen,
  CANVAS_NODE_TYPES.imageEdit,
  CANVAS_NODE_TYPES.storyboardGen,
  CANVAS_NODE_TYPES.textAnnotation,
]);

const PANO_360_DOWNSTREAM_IMAGE_TYPES = new Set<CanvasNodeType>([
  CANVAS_NODE_TYPES.upload,
  CANVAS_NODE_TYPES.imageEdit,
  CANVAS_NODE_TYPES.imageGen,
  CANVAS_NODE_TYPES.exportImage,
]);

export function resolveAllowedNodeTypes(
  handleType: 'source' | 'target',
  originNodeType?: CanvasNodeType,
): CanvasNodeType[] {
  if (handleType === 'source') {
    return getDownstreamSpawnTypes(originNodeType);
  }
  const base = getConnectMenuNodeTypes(handleType);
  if (originNodeType === CANVAS_NODE_TYPES.threeDWorld) {
    const allowed = new Set<CanvasNodeType>([
      CANVAS_NODE_TYPES.textAnnotation,
      CANVAS_NODE_TYPES.imageGen,
    ]);
    return base.filter((type) => allowed.has(type));
  }
  if (originNodeType === CANVAS_NODE_TYPES.imageGen) {
    return [
      CANVAS_NODE_TYPES.textAnnotation,
      CANVAS_NODE_TYPES.script,
      CANVAS_NODE_TYPES.upload,
    ];
  }
  if (originNodeType === CANVAS_NODE_TYPES.video) {
    return [
      CANVAS_NODE_TYPES.textAnnotation,
      CANVAS_NODE_TYPES.imageGen,
      CANVAS_NODE_TYPES.audio,
    ];
  }
  if (originNodeType) {
    const allowedUpstream = getAllowedUpstreamSourceTypes(originNodeType);
    if (allowedUpstream) {
      return [...allowedUpstream];
    }
  }
  return base;
}

export function canNodeTypeBeManualConnectionSource(
  type: CanvasNodeType,
  targetType?: CanvasNodeType,
): boolean {
  if (targetType === CANVAS_NODE_TYPES.threeDWorld) {
    return THREE_D_WORLD_MANUAL_SOURCE_TYPES.has(type);
  }
  if (type === CANVAS_NODE_TYPES.pano360Viewer) {
    return targetType ? PANO_360_DOWNSTREAM_IMAGE_TYPES.has(targetType) : true;
  }
  if (targetType && getAllowedUpstreamSourceTypes(targetType)) {
    return isUpstreamConnectionAllowed(type, targetType);
  }
  return getDownstreamSpawnTypes(type).length > 0;
}

export function canNodeBeManualConnectionSource(
  nodeId: string | null | undefined,
  nodes: readonly CanvasNode[],
  targetNodeId?: string | null,
): boolean {
  if (!nodeId) {
    return false;
  }
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) {
    return false;
  }
  const targetType = targetNodeId
    ? nodes.find((item) => item.id === targetNodeId)?.type
    : undefined;
  return canNodeTypeBeManualConnectionSource(node.type, targetType);
}

export function canConnectCanvasNodesManually(
  sourceNode: CanvasNode,
  targetNode: CanvasNode,
): boolean {
  return (
    nodeHasSourceHandle(sourceNode.type)
    && nodeHasTargetHandle(targetNode.type)
    && canNodeTypeBeManualConnectionSource(sourceNode.type, targetNode.type)
  );
}

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
