// Copyright (c) 2026 AI anime
import {
  VIDEO_GENERATION_ASPECT_RATIOS,
  snapToAllowedAspectRatio,
} from '@/features/canvas/application/imageData';
import type { CanvasAssetLibrarySelection } from '@/features/canvas/domain/assetLibrary';
import {
  CANVAS_NODE_TYPES,
  isAudioNode,
  isExportImageNode,
  isImageEditNode,
  isImageGenNode,
  isStoryboardGenNode,
  isUploadNode,
  isVideoNode,
  type CanvasEdge,
  type CanvasNode,
  type VideoGenCount,
  type VideoNodeData,
} from '@/features/canvas/domain/canvasNodes';
import {
  referenceImageUrl,
  referenceVideoUrl,
} from '@/features/canvas/domain/videoReferenceMedia';
import type { VideoReferenceItem } from '@/features/canvas/domain/videoReferenceLimits';
import type { VideoGenerationAspectRatio } from '@/features/canvas/application/submitVideoGeneration';

export const VIDEO_NODE_DEFAULT_WIDTH = 580;
export const VIDEO_NODE_DEFAULT_HEIGHT = 380;
export const VIDEO_NODE_MIN_WIDTH = 480;
export const VIDEO_NODE_MIN_HEIGHT = 280;
export const VIDEO_NODE_MAX_WIDTH = 1100;
export const VIDEO_NODE_MAX_HEIGHT = 1000;

export const VIDEO_NODE_IMAGE_SOURCE_WIDTH = 580;
export const VIDEO_NODE_IMAGE_SOURCE_HEIGHT = 360;
export const VIDEO_NODE_FIRST_FRAME_PROMPT = '以当前图为首帧生成视频';

export const VIDEO_NODE_OPERATIONS_PANEL_HEIGHT = 280;
export const VIDEO_NODE_OPERATIONS_PANEL_GAP = 12;
export const VIDEO_NODE_OPERATIONS_PANEL_OVERHANG = 120;
export const VIDEO_NODE_OPERATIONS_PANEL_EXPANDED_HEIGHT = 560;
export const VIDEO_NODE_OPERATIONS_PANEL_EXPANDED_WIDTH = 1040;

export const VIDEO_NODE_ASPECT_RATIOS: ReadonlyArray<VideoGenerationAspectRatio> = [
  'auto',
  '16:9',
  '4:3',
  '1:1',
  '3:4',
  '9:16',
  '21:9',
];
export const VIDEO_NODE_COUNT_OPTIONS: ReadonlyArray<VideoGenCount> = [1, 2, 4];

export interface VideoNodeModelOption {
  id: string;
  apiModel?: string | null;
}

export interface VideoNodeMediaCounts {
  images: number;
  videos: number;
  audios: number;
}

export interface VideoNodeDisplayedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VideoNodeDerivedNodePlan {
  type:
    | typeof CANVAS_NODE_TYPES.audio
    | typeof CANVAS_NODE_TYPES.imageGen
    | typeof CANVAS_NODE_TYPES.upload
    | typeof CANVAS_NODE_TYPES.video;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface VideoFrameSourcePlan {
  nodes: VideoNodeDerivedNodePlan[];
  groupLabel: string;
  videoPatch: Partial<VideoNodeData>;
}

export function resolveVideoNodeModel<T extends VideoNodeModelOption>(
  models: readonly T[],
  persistedModel: unknown,
): T | undefined {
  const persisted =
    typeof persistedModel === 'string' && persistedModel.length > 0
      ? persistedModel
      : null;
  return (
    (persisted
      ? models.find((model) => model.id === persisted)
      : undefined) ?? models[0]
  );
}

export function resolveVideoNodeAspectRatio(
  value: unknown,
): VideoGenerationAspectRatio {
  const raw = String(value ?? '');
  if ((VIDEO_NODE_ASPECT_RATIOS as readonly string[]).includes(raw)) {
    return raw as VideoGenerationAspectRatio;
  }
  return snapToAllowedAspectRatio(
    raw,
    VIDEO_GENERATION_ASPECT_RATIOS,
    '16:9',
  ) as VideoGenerationAspectRatio;
}

export function resolveVideoNodeSubmitAspectRatio(
  data: Pick<VideoNodeData, 'widthPx' | 'heightPx'>,
  aspectRatio: VideoGenerationAspectRatio,
): VideoGenerationAspectRatio {
  if (aspectRatio !== 'auto') return aspectRatio;
  const naturalRatio =
    typeof data.widthPx === 'number' &&
    typeof data.heightPx === 'number' &&
    data.widthPx > 0 &&
    data.heightPx > 0
      ? `${data.widthPx}:${data.heightPx}`
      : '';
  return snapToAllowedAspectRatio(
    naturalRatio,
    VIDEO_GENERATION_ASPECT_RATIOS,
    '16:9',
  ) as VideoGenerationAspectRatio;
}

export function resolveVideoNodeDimensions(
  width: number | undefined,
  height: number | undefined,
): { width: number; height: number } {
  return {
    width: Math.max(
      VIDEO_NODE_MIN_WIDTH,
      Math.round(width ?? VIDEO_NODE_DEFAULT_WIDTH),
    ),
    height: Math.max(
      VIDEO_NODE_MIN_HEIGHT,
      Math.round(height ?? VIDEO_NODE_DEFAULT_HEIGHT),
    ),
  };
}

export function videoNodeAlbumUrls(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      )
    : [];
}

export function resolveVideoNodeSource(
  videoUrl: string | null | undefined,
  transientPreviewUrl: string | null,
): string | null {
  return videoUrl || transientPreviewUrl || null;
}

export function resolveVideoNodePosterSource(
  videoSource: string | null,
): string | null {
  if (!videoSource) return null;
  return videoSource.includes('#t=') ? videoSource : `${videoSource}#t=0.1`;
}

export function hasVideoNodeGenerationError(input: {
  isGenerating: boolean;
  videoUrl?: string | null;
  generationError?: string | null;
}): boolean {
  return (
    !input.isGenerating &&
    !input.videoUrl &&
    Boolean(input.generationError?.trim())
  );
}

export function composeVideoNodePrompt(
  upstreamText: string,
  prompt: string,
  cameraFragment?: string | null,
): string {
  const userPrompt = [upstreamText.trim(), prompt.trim()]
    .filter(Boolean)
    .join('\n\n');
  return cameraFragment
    ? userPrompt
      ? `${cameraFragment}，${userPrompt}`
      : cameraFragment
    : userPrompt;
}

export function resolveVideoNodeDisplayedRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number | null | undefined,
  videoHeight: number | null | undefined,
): VideoNodeDisplayedRect {
  if (
    !videoWidth ||
    !videoHeight ||
    containerWidth <= 0 ||
    containerHeight <= 0
  ) {
    return {
      left: 0,
      top: 0,
      width: containerWidth,
      height: containerHeight,
    };
  }
  const containerRatio = containerWidth / containerHeight;
  const videoRatio = videoWidth / videoHeight;
  if (videoRatio > containerRatio) {
    const height = containerWidth / videoRatio;
    return {
      left: 0,
      top: (containerHeight - height) / 2,
      width: containerWidth,
      height,
    };
  }
  const width = containerHeight * videoRatio;
  return {
    left: (containerWidth - width) / 2,
    top: 0,
    width,
    height: containerHeight,
  };
}

export function resolveVideoFrameSeekSeconds(input: {
  mode: 'first' | 'last' | 'current';
  liveDuration: number | null;
  fallbackDuration: number | null;
  currentTime: number | null;
}): number {
  if (input.mode === 'first') return 0;
  if (input.mode === 'current') return input.currentTime ?? 0;
  const duration = input.liveDuration ?? input.fallbackDuration;
  return duration === null
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, duration - 0.05);
}

export function projectVideoReferenceMedia(
  sortedUpstreamNodes: readonly CanvasNode[],
): VideoReferenceItem[] {
  const items: VideoReferenceItem[] = [];
  for (const node of sortedUpstreamNodes) {
    const videoUrl = referenceVideoUrl(node);
    if (videoUrl) {
      const data = node.data as {
        previewImageUrl?: string | null;
        displayName?: string | null;
      };
      items.push({
        kind: 'video',
        nodeId: node.id,
        videoUrl,
        thumbUrl: data.previewImageUrl || null,
        displayName: data.displayName ?? null,
      });
      continue;
    }
    if (isAudioNode(node)) {
      const audioUrl =
        typeof node.data.audioUrl === 'string' && node.data.audioUrl.length > 0
          ? node.data.audioUrl
          : null;
      if (audioUrl) {
        items.push({
          kind: 'audio',
          nodeId: node.id,
          audioUrl,
          displayName: node.data.displayName ?? null,
        });
      }
      continue;
    }
    const imageUrl = referenceImageUrl(node);
    if (imageUrl) {
      items.push({
        kind: 'image',
        nodeId: node.id,
        imageUrl,
        displayName:
          (node.data as { displayName?: string | null }).displayName ?? null,
      });
    }
  }
  return items;
}

export function countVideoUpstreamMedia(
  upstreamNodes: readonly CanvasNode[],
): VideoNodeMediaCounts {
  const counts: VideoNodeMediaCounts = { images: 0, videos: 0, audios: 0 };
  for (const node of upstreamNodes) {
    if (referenceVideoUrl(node)) {
      counts.videos += 1;
    } else if (isAudioNode(node)) {
      if (typeof node.data.audioUrl === 'string' && node.data.audioUrl) {
        counts.audios += 1;
      }
    } else if (referenceImageUrl(node)) {
      counts.images += 1;
    }
  }
  return counts;
}

export function countVideoUpstreamNodeTypes(
  upstreamNodes: readonly CanvasNode[],
): VideoNodeMediaCounts {
  const counts: VideoNodeMediaCounts = { images: 0, videos: 0, audios: 0 };
  for (const node of upstreamNodes) {
    if (isVideoNode(node) || referenceVideoUrl(node)) {
      counts.videos += 1;
    } else if (isAudioNode(node)) {
      counts.audios += 1;
    } else if (
      isImageGenNode(node) ||
      isUploadNode(node) ||
      isImageEditNode(node) ||
      isExportImageNode(node) ||
      isStoryboardGenNode(node)
    ) {
      counts.images += 1;
    }
  }
  return counts;
}

function canvasNodeSize(
  node: CanvasNode,
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  return {
    width:
      node.measured?.width ??
      (typeof node.width === 'number' ? node.width : fallbackWidth),
    height:
      node.measured?.height ??
      (typeof node.height === 'number' ? node.height : fallbackHeight),
  };
}

function overlapsWithMargin(
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

export function planVideoFrameSources(input: {
  mode: 'firstFrame' | 'firstLastFrame';
  targetNode: CanvasNode;
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
  prompt: string;
}): VideoFrameSourcePlan {
  const isFirstFrame = input.mode === 'firstFrame';
  const frameWidth = isFirstFrame ? VIDEO_NODE_IMAGE_SOURCE_WIDTH : 320;
  const frameHeight = isFirstFrame ? VIDEO_NODE_IMAGE_SOURCE_HEIGHT : 350;
  const gapX = 40;
  const gapY = 24;
  const baseX = input.targetNode.position.x - frameWidth - gapX;
  const stepY = frameHeight + gapY;
  const occupiedRects = input.nodes
    .filter((node) => node.id !== input.targetNode.id)
    .map((node) => {
      const size = canvasNodeSize(node, frameWidth, frameHeight);
      return { ...node.position, ...size };
    });
  const upstreamIds = new Set(
    input.edges
      .filter((edge) => edge.target === input.targetNode.id)
      .map((edge) => edge.source),
  );
  const lastFrameColumnY = input.nodes
    .filter(
      (node) =>
        upstreamIds.has(node.id) &&
        (node.type === CANVAS_NODE_TYPES.upload ||
          node.type === CANVAS_NODE_TYPES.imageGen) &&
        Math.abs(node.position.x - baseX) < 8,
    )
    .reduce<number | null>(
      (maximum, node) =>
        maximum === null ? node.position.y : Math.max(maximum, node.position.y),
      null,
    );
  const resolveAvailableY = (preferredY: number): number => {
    let y =
      lastFrameColumnY === null
        ? preferredY
        : Math.max(preferredY, lastFrameColumnY + stepY);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = {
        x: baseX,
        y,
        width: frameWidth,
        height: frameHeight,
      };
      if (!occupiedRects.some((rect) => overlapsWithMargin(candidate, rect))) {
        occupiedRects.push(candidate);
        return y;
      }
      y += stepY;
    }
    occupiedRects.push({
      x: baseX,
      y,
      width: frameWidth,
      height: frameHeight,
    });
    return y;
  };
  const targetHeight = input.targetNode.height ?? VIDEO_NODE_DEFAULT_HEIGHT;
  if (isFirstFrame) {
    const y = resolveAvailableY(
      input.targetNode.position.y + (targetHeight - frameHeight) / 2,
    );
    return {
      nodes: [
        {
          type: CANVAS_NODE_TYPES.imageGen,
          position: { x: baseX, y },
          data: { displayName: '首帧' },
        },
      ],
      groupLabel: '首帧生成视频组',
      videoPatch: {
        genMode: 'allReference',
        ...(input.prompt.trim()
          ? {}
          : { prompt: VIDEO_NODE_FIRST_FRAME_PROMPT }),
      },
    };
  }
  const totalHeight = frameHeight * 2 + gapY;
  const startY =
    input.targetNode.position.y + (targetHeight - totalHeight) / 2;
  const firstY = resolveAvailableY(startY);
  const lastY = resolveAvailableY(firstY + stepY);
  return {
    nodes: [
      {
        type: CANVAS_NODE_TYPES.upload,
        position: { x: baseX, y: firstY },
        data: { displayName: '首帧' },
      },
      {
        type: CANVAS_NODE_TYPES.upload,
        position: { x: baseX, y: lastY },
        data: { displayName: '尾帧' },
      },
    ],
    groupLabel: '首尾帧生成视频组',
    videoPatch: { genMode: 'firstLastFrame' },
  };
}

export function planVideoAssetReferences(input: {
  selections: readonly CanvasAssetLibrarySelection[];
  targetPosition: { x: number; y: number };
  targetHeight: number | undefined;
  aspectRatio: VideoNodeData['aspectRatio'];
}): VideoNodeDerivedNodePlan[] {
  const width = 320;
  const height = 240;
  const gapX = 40;
  const gapY = 24;
  const baseX = input.targetPosition.x - width - gapX;
  const totalHeight =
    height * input.selections.length + gapY * (input.selections.length - 1);
  const startY =
    input.targetPosition.y +
    ((input.targetHeight ?? VIDEO_NODE_DEFAULT_HEIGHT) - totalHeight) / 2;
  return input.selections.map((selection, index) => {
    const position = { x: baseX, y: startY + index * (height + gapY) };
    const displayName = selection.name || undefined;
    if (selection.media === 'audio') {
      return {
        type: CANVAS_NODE_TYPES.audio,
        position,
        data: { audioUrl: selection.url, displayName },
      };
    }
    if (selection.media === 'video') {
      return {
        type: CANVAS_NODE_TYPES.video,
        position,
        data: {
          videoUrl: selection.url,
          aspectRatio: input.aspectRatio,
          displayName,
          referenceOnly: true,
        },
      };
    }
    return {
      type: CANVAS_NODE_TYPES.upload,
      position,
      data: {
        imageUrl: selection.url,
        previewImageUrl: selection.url,
        displayName,
      },
    };
  });
}
