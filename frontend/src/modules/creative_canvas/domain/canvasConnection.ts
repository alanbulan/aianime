// Copyright (c) 2026 AI anime

export const CANVAS_CONNECTION_NODE_TYPES = {
  upload: 'uploadNode',
  imageEdit: 'imageNode',
  imageGen: 'imageGenNode',
  exportImage: 'exportImageNode',
  beatContext: 'beatContextNode',
  group: 'groupNode',
  textAnnotation: 'textAnnotationNode',
  storyboardSplit: 'storyboardNode',
  storyboardGen: 'storyboardGenNode',
  video: 'videoNode',
  audio: 'audioNode',
  videoStory: 'videoStoryNode',
  videoCompose: 'videoComposeNode',
  script: 'scriptNode',
  pano360Viewer: 'pano360ViewerNode',
  threeDWorld: 'threeDWorldNode',
  skill: 'skillNode',
} as const;

export const CANVAS_NODE_TYPES = CANVAS_CONNECTION_NODE_TYPES;

const NODE_TYPE = CANVAS_CONNECTION_NODE_TYPES;

export type CanvasConnectionNodeType =
  (typeof CANVAS_CONNECTION_NODE_TYPES)[keyof typeof CANVAS_CONNECTION_NODE_TYPES];

export interface CanvasConnectionNodeLike {
  id: string;
  type: CanvasConnectionNodeType;
}

export interface CanvasConnectionEdgeLike {
  source: string;
  target: string;
}

interface CanvasNodeConnectivity {
  sourceHandle: boolean;
  targetHandle: boolean;
  connectMenu: {
    fromSource: boolean;
    fromTarget: boolean;
  };
}

const NODE_CONNECTIVITY = {
  [NODE_TYPE.upload]: {
    sourceHandle: true,
    targetHandle: false,
    connectMenu: { fromSource: false, fromTarget: true },
  },
  [NODE_TYPE.imageEdit]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: false },
  },
  [NODE_TYPE.imageGen]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: false },
  },
  [NODE_TYPE.exportImage]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: false, fromTarget: false },
  },
  [NODE_TYPE.beatContext]: {
    sourceHandle: true,
    targetHandle: false,
    connectMenu: { fromSource: true, fromTarget: false },
  },
  [NODE_TYPE.group]: {
    sourceHandle: false,
    targetHandle: false,
    connectMenu: { fromSource: false, fromTarget: false },
  },
  [NODE_TYPE.textAnnotation]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: false },
  },
  [NODE_TYPE.storyboardSplit]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: false, fromTarget: false },
  },
  [NODE_TYPE.storyboardGen]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: false },
  },
  [NODE_TYPE.video]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: false },
  },
  [NODE_TYPE.audio]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: true },
  },
  [NODE_TYPE.videoStory]: {
    sourceHandle: false,
    targetHandle: true,
    connectMenu: { fromSource: false, fromTarget: false },
  },
  [NODE_TYPE.videoCompose]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: false },
  },
  [NODE_TYPE.script]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: true },
  },
  [NODE_TYPE.pano360Viewer]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: false },
  },
  [NODE_TYPE.threeDWorld]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: true },
  },
  [NODE_TYPE.skill]: {
    sourceHandle: true,
    targetHandle: true,
    connectMenu: { fromSource: true, fromTarget: true },
  },
} satisfies Record<CanvasConnectionNodeType, CanvasNodeConnectivity>;

const UPSTREAM_SOURCE_WHITELIST: Partial<
  Record<CanvasConnectionNodeType, readonly CanvasConnectionNodeType[]>
> = {
  [NODE_TYPE.audio]: [NODE_TYPE.textAnnotation],
};

export function nodeHasSourceHandle(type: CanvasConnectionNodeType): boolean {
  return NODE_CONNECTIVITY[type].sourceHandle;
}

export function nodeHasTargetHandle(type: CanvasConnectionNodeType): boolean {
  return NODE_CONNECTIVITY[type].targetHandle;
}

export function getAllowedUpstreamSourceTypes(
  targetType: CanvasConnectionNodeType,
): readonly CanvasConnectionNodeType[] | null {
  return UPSTREAM_SOURCE_WHITELIST[targetType] ?? null;
}

export function isUpstreamConnectionAllowed(
  sourceType: CanvasConnectionNodeType,
  targetType: CanvasConnectionNodeType,
): boolean {
  const allowed = UPSTREAM_SOURCE_WHITELIST[targetType];
  return allowed ? allowed.includes(sourceType) : true;
}

export function getConnectMenuNodeTypes(
  handleType: 'source' | 'target',
): CanvasConnectionNodeType[] {
  const fromSource = handleType === 'source';
  return (Object.entries(NODE_CONNECTIVITY) as Array<
    [CanvasConnectionNodeType, CanvasNodeConnectivity]
  >)
    .filter(([, connectivity]) => (
      fromSource
        ? connectivity.connectMenu.fromSource && connectivity.targetHandle
        : connectivity.connectMenu.fromTarget && connectivity.sourceHandle
    ))
    .map(([type]) => type);
}

export function getDownstreamSpawnTypes(
  originType: CanvasConnectionNodeType | undefined,
): CanvasConnectionNodeType[] {
  const base = getConnectMenuNodeTypes('source');
  if (!originType) return base;

  if (originType === NODE_TYPE.video) {
    const allowed = new Set<CanvasConnectionNodeType>([
      NODE_TYPE.textAnnotation,
      NODE_TYPE.video,
      NODE_TYPE.videoCompose,
      NODE_TYPE.script,
    ]);
    return base.filter((type) => allowed.has(type));
  }
  if (originType === NODE_TYPE.audio) {
    const allowed = new Set<CanvasConnectionNodeType>([
      NODE_TYPE.video,
      NODE_TYPE.videoCompose,
    ]);
    return base.filter((type) => allowed.has(type));
  }
  if (originType === NODE_TYPE.pano360Viewer) {
    const allowed = new Set<CanvasConnectionNodeType>([
      NODE_TYPE.imageGen,
      NODE_TYPE.imageEdit,
      NODE_TYPE.exportImage,
      NODE_TYPE.upload,
    ]);
    return base.filter((type) => allowed.has(type));
  }
  if (
    originType === NODE_TYPE.upload
    || originType === NODE_TYPE.imageEdit
    || originType === NODE_TYPE.imageGen
    || originType === NODE_TYPE.exportImage
  ) {
    const allowed = new Set<CanvasConnectionNodeType>([
      NODE_TYPE.textAnnotation,
      NODE_TYPE.imageGen,
      NODE_TYPE.video,
      NODE_TYPE.script,
      NODE_TYPE.pano360Viewer,
      NODE_TYPE.threeDWorld,
    ]);
    return base.filter((type) => allowed.has(type));
  }
  return base;
}

export type CanvasConnectionMode = 'react_flow' | 'programmatic';

export type CanvasConnectionRejectionReason =
  | 'missing_endpoint'
  | 'missing_handle_capability'
  | 'disallowed_upstream_type'
  | 'three_d_world_input_exists';

export type CanvasConnectionValidation =
  | { ok: true }
  | { ok: false; reason: CanvasConnectionRejectionReason };

const THREE_D_WORLD_MANUAL_SOURCE_TYPES = new Set<CanvasConnectionNodeType>([
  NODE_TYPE.upload,
  NODE_TYPE.exportImage,
  NODE_TYPE.imageGen,
  NODE_TYPE.imageEdit,
  NODE_TYPE.storyboardGen,
  NODE_TYPE.textAnnotation,
]);

const PANO_360_DOWNSTREAM_IMAGE_TYPES = new Set<CanvasConnectionNodeType>([
  NODE_TYPE.upload,
  NODE_TYPE.imageEdit,
  NODE_TYPE.imageGen,
  NODE_TYPE.exportImage,
]);

export function resolveAllowedNodeTypes(
  handleType: 'source' | 'target',
  originNodeType?: CanvasConnectionNodeType,
): CanvasConnectionNodeType[] {
  if (handleType === 'source') {
    return getDownstreamSpawnTypes(originNodeType);
  }
  const base = getConnectMenuNodeTypes(handleType);
  if (originNodeType === NODE_TYPE.threeDWorld) {
    const allowed = new Set<CanvasConnectionNodeType>([
      NODE_TYPE.textAnnotation,
      NODE_TYPE.imageGen,
    ]);
    return base.filter((type) => allowed.has(type));
  }
  if (originNodeType === NODE_TYPE.imageGen) {
    return [
      NODE_TYPE.textAnnotation,
      NODE_TYPE.script,
      NODE_TYPE.upload,
    ];
  }
  if (originNodeType === NODE_TYPE.video) {
    return [
      NODE_TYPE.textAnnotation,
      NODE_TYPE.imageGen,
      NODE_TYPE.audio,
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
  type: CanvasConnectionNodeType,
  targetType?: CanvasConnectionNodeType,
): boolean {
  if (targetType === NODE_TYPE.threeDWorld) {
    return THREE_D_WORLD_MANUAL_SOURCE_TYPES.has(type);
  }
  if (type === NODE_TYPE.pano360Viewer) {
    return targetType ? PANO_360_DOWNSTREAM_IMAGE_TYPES.has(targetType) : true;
  }
  if (targetType && getAllowedUpstreamSourceTypes(targetType)) {
    return isUpstreamConnectionAllowed(type, targetType);
  }
  return getDownstreamSpawnTypes(type).length > 0;
}

export function canNodeBeManualConnectionSource(
  nodeId: string | null | undefined,
  nodes: readonly CanvasConnectionNodeLike[],
  targetNodeId?: string | null,
): boolean {
  if (!nodeId) return false;
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return false;
  const targetType = targetNodeId
    ? nodes.find((item) => item.id === targetNodeId)?.type
    : undefined;
  return canNodeTypeBeManualConnectionSource(node.type, targetType);
}

export function canConnectCanvasNodesManually(
  sourceNode: CanvasConnectionNodeLike,
  targetNode: CanvasConnectionNodeLike,
): boolean {
  return (
    nodeHasSourceHandle(sourceNode.type)
    && nodeHasTargetHandle(targetNode.type)
    && canNodeTypeBeManualConnectionSource(sourceNode.type, targetNode.type)
  );
}

export function validateCanvasConnection(
  nodes: readonly CanvasConnectionNodeLike[],
  edges: readonly CanvasConnectionEdgeLike[],
  candidate: { source: string; target: string },
  mode: CanvasConnectionMode,
): CanvasConnectionValidation {
  const sourceNode = nodes.find((node) => node.id === candidate.source);
  const targetNode = nodes.find((node) => node.id === candidate.target);

  if (mode === 'react_flow') {
    if (
      targetNode?.type === NODE_TYPE.threeDWorld
      && edges.some(
        (edge) => edge.target === candidate.target && edge.source !== candidate.source,
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
