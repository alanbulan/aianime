// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  isAudioNode,
  isExportImageNode,
  isImageEditNode,
  isImageGenNode,
  isTextAnnotationNode,
  isUploadNode,
  isVideoNode,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
  type ScriptGenAction,
  type ScriptNodeData,
} from '@/features/canvas/domain/canvasNodes';
import {
  isCanvasStoryScriptResult,
  type CanvasStoryScriptReference,
  type CanvasStoryScriptResult,
} from '@/modules/creative_canvas/public';

export const SCRIPT_NODE_SIZE_LIMITS = {
  minWidth: 360,
  minHeight: 240,
  maxWidth: 1600,
  maxHeight: 1200,
} as const;

export interface ScriptNodeAction {
  key: ScriptGenAction;
  label: string;
}

export const SCRIPT_NODE_ACTIONS: readonly ScriptNodeAction[] = [
  { key: 'fromScript', label: '剧本生成分镜脚本' },
  { key: 'fromVideoRef', label: '视频参考生成分镜脚本' },
  { key: 'fromCharacter', label: '角色生成分镜脚本' },
];

export interface ScriptNodeSpawnItem {
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface ScriptNodeSpawnPlan {
  groupLabel: string;
  items: ScriptNodeSpawnItem[];
}

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 320;
const DEFAULT_WIDTH_WITH_RESULT = 800;
const DEFAULT_HEIGHT_WITH_RESULT = 400;
const SPAWN_TEXT_WIDTH = 440;
const SPAWN_TEXT_HEIGHT = 320;
const SPAWN_VIDEO_WIDTH = 580;
const SPAWN_VIDEO_HEIGHT = 380;
const SPAWN_UPLOAD_WIDTH = 320;
const SPAWN_UPLOAD_HEIGHT = 350;
const SPAWN_GAP_X = 40;
const SPAWN_GAP_Y = 24;

export function classifyCanvasStoryScriptReference(
  node: CanvasNode,
): CanvasStoryScriptReference | null {
  if (isTextAnnotationNode(node)) {
    return {
      nodeId: node.id,
      kind: 'text',
      text: typeof node.data.content === 'string' ? node.data.content : '',
      displayName: node.data.displayName ?? null,
    };
  }
  if (isVideoNode(node)) {
    const videoUrl =
      typeof node.data.videoUrl === 'string' && node.data.videoUrl.length > 0
        ? node.data.videoUrl
        : null;
    const thumbUrl =
      (typeof node.data.previewImageUrl === 'string' &&
        node.data.previewImageUrl) ||
      null;
    const durationSec =
      typeof node.data.durationMs === 'number' && node.data.durationMs > 0
        ? node.data.durationMs / 1000
        : null;
    return {
      nodeId: node.id,
      kind: 'video',
      thumbUrl,
      videoUrl,
      durationSec,
      displayName: node.data.displayName ?? null,
    };
  }
  if (isAudioNode(node)) {
    return {
      nodeId: node.id,
      kind: 'audio',
      displayName: node.data.displayName ?? null,
    };
  }
  if (isImageGenNode(node)) {
    const data = node.data;
    const referenceImageUrl =
      typeof data.referenceImageUrl === 'string' &&
      data.referenceImageUrl.length > 0
        ? data.referenceImageUrl
        : null;
    return {
      nodeId: node.id,
      kind: 'image',
      thumbUrl: data.previewImageUrl || data.imageUrl || referenceImageUrl,
      displayName: data.displayName ?? null,
    };
  }
  if (isUploadNode(node) || isImageEditNode(node) || isExportImageNode(node)) {
    const data = node.data;
    return {
      nodeId: node.id,
      kind: 'image',
      thumbUrl: data.previewImageUrl || data.imageUrl || null,
      displayName: data.displayName ?? null,
    };
  }
  return null;
}

export function resolveScriptNodeSize(
  hasResult: boolean,
  width?: number,
  height?: number,
) {
  const fallbackWidth = hasResult ? DEFAULT_WIDTH_WITH_RESULT : DEFAULT_WIDTH;
  const fallbackHeight = hasResult ? DEFAULT_HEIGHT_WITH_RESULT : DEFAULT_HEIGHT;
  return {
    width: Math.max(
      SCRIPT_NODE_SIZE_LIMITS.minWidth,
      Math.round(width ?? fallbackWidth),
    ),
    height: Math.max(
      SCRIPT_NODE_SIZE_LIMITS.minHeight,
      Math.round(height ?? fallbackHeight),
    ),
  };
}

export function resolveScriptNodeResult(
  value: unknown,
): CanvasStoryScriptResult | null {
  return isCanvasStoryScriptResult(value) ? value : null;
}

export function updateScriptResultCell(
  result: CanvasStoryScriptResult,
  rowIndex: number,
  columnKey: string,
  nextValue: string,
): CanvasStoryScriptResult | null {
  const existing = result.rows[rowIndex];
  if (!existing) return null;
  const previousRaw = existing[columnKey];
  const previous =
    typeof previousRaw === 'string'
      ? previousRaw
      : previousRaw == null
        ? ''
        : String(previousRaw);
  if (previous === nextValue) return null;

  return {
    ...result,
    rows: result.rows.map((row, index) =>
      index === rowIndex ? { ...row, [columnKey]: nextValue } : row,
    ),
  };
}

export function resolveScriptNodeReferences(
  upstreamNodes: readonly CanvasNode[],
): CanvasStoryScriptReference[] {
  return [...upstreamNodes]
    .sort((left, right) =>
      (left.position?.y ?? 0) - (right.position?.y ?? 0),
    )
    .map((node) => classifyCanvasStoryScriptReference(node))
    .filter(
      (reference): reference is CanvasStoryScriptReference =>
        reference !== null,
    );
}

export function scriptPromptHasContent(data: ScriptNodeData): boolean {
  return typeof data.prompt === 'string' && data.prompt.trim().length > 0;
}

export function hasScriptGenerationSource(
  prompt: string,
  references: readonly CanvasStoryScriptReference[],
): boolean {
  return (
    prompt.trim().length > 0 ||
    references.some(
      (reference) =>
        (reference.kind === 'text' &&
          (reference.text ?? '').trim().length > 0) ||
        (reference.kind === 'video' && Boolean(reference.videoUrl)) ||
        (reference.kind === 'image' && Boolean(reference.thumbUrl)),
    )
  );
}

export function hasScriptReferencePreview(
  reference: CanvasStoryScriptReference,
): boolean {
  return (
    (reference.kind === 'image' && Boolean(reference.thumbUrl)) ||
    (reference.kind === 'video' &&
      Boolean(reference.videoUrl || reference.thumbUrl))
  );
}

function nodeSize(
  node: CanvasNode,
  fallbackWidth: number,
  fallbackHeight: number,
) {
  return {
    width:
      node.measured?.width ??
      (typeof node.width === 'number' ? node.width : fallbackWidth),
    height:
      node.measured?.height ??
      (typeof node.height === 'number' ? node.height : fallbackHeight),
  };
}

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  const margin = 12;
  return (
    left.x < right.x + right.width + margin &&
    left.x + left.width + margin > right.x &&
    left.y < right.y + right.height + margin &&
    left.y + left.height + margin > right.y
  );
}

export function resolveScriptNodeSpawnPlan({
  action,
  self,
  nodes,
  edges,
  fallbackHeight,
}: {
  action: ScriptGenAction;
  self: CanvasNode;
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  fallbackHeight: number;
}): ScriptNodeSpawnPlan {
  const actionDefinition = SCRIPT_NODE_ACTIONS.find(
    (candidate) => candidate.key === action,
  );
  const groupLabel = `${actionDefinition?.label ?? ''}组`;
  const selfHeight = self.height ?? fallbackHeight;
  const centerY = self.position.y + selfHeight / 2;

  if (action === 'fromScript') {
    return {
      groupLabel,
      items: [
        {
          type: CANVAS_NODE_TYPES.textAnnotation,
          position: {
            x: self.position.x - SPAWN_TEXT_WIDTH - SPAWN_GAP_X,
            y: centerY - SPAWN_TEXT_HEIGHT / 2,
          },
          data: { referenceOnly: true, displayName: '剧本' },
        },
      ],
    };
  }

  if (action === 'fromVideoRef') {
    return {
      groupLabel,
      items: [
        {
          type: CANVAS_NODE_TYPES.video,
          position: {
            x: self.position.x - SPAWN_VIDEO_WIDTH - SPAWN_GAP_X,
            y: centerY - SPAWN_VIDEO_HEIGHT / 2,
          },
          data: { referenceOnly: true },
        },
      ],
    };
  }

  const baseX = self.position.x - SPAWN_UPLOAD_WIDTH - SPAWN_GAP_X;
  const seeds = [{ displayName: '角色 1' }, { displayName: '角色 2' }];
  const stepY = SPAWN_UPLOAD_HEIGHT + SPAWN_GAP_Y;
  const totalHeight =
    SPAWN_UPLOAD_HEIGHT * seeds.length + SPAWN_GAP_Y * (seeds.length - 1);
  const preferredStartY = self.position.y + (selfHeight - totalHeight) / 2;
  const upstreamIds = new Set(
    edges.filter((edge) => edge.target === self.id).map((edge) => edge.source),
  );
  const lastColumnY = nodes
    .filter(
      (node) =>
        upstreamIds.has(node.id) &&
        node.type === CANVAS_NODE_TYPES.upload &&
        Math.abs(node.position.x - baseX) < 8,
    )
    .reduce<number | null>(
      (maximum, node) =>
        maximum === null ? node.position.y : Math.max(maximum, node.position.y),
      null,
    );
  let y =
    lastColumnY === null
      ? preferredStartY
      : Math.max(preferredStartY, lastColumnY + stepY);
  const occupiedRects = nodes
    .filter((node) => node.id !== self.id)
    .map((node) => {
      const size = nodeSize(node, SPAWN_UPLOAD_WIDTH, SPAWN_UPLOAD_HEIGHT);
      return {
        x: node.position.x,
        y: node.position.y,
        width: size.width,
        height: size.height,
      };
    });
  const items = seeds.map((seed) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = {
        x: baseX,
        y,
        width: SPAWN_UPLOAD_WIDTH,
        height: SPAWN_UPLOAD_HEIGHT,
      };
      if (!occupiedRects.some((rect) => overlaps(candidate, rect))) break;
      y += stepY;
    }
    occupiedRects.push({
      x: baseX,
      y,
      width: SPAWN_UPLOAD_WIDTH,
      height: SPAWN_UPLOAD_HEIGHT,
    });
    const item: ScriptNodeSpawnItem = {
      type: CANVAS_NODE_TYPES.upload,
      position: { x: baseX, y },
      data: seed,
    };
    y += stepY;
    return item;
  });

  return { groupLabel, items };
}
