// Copyright (c) 2026 AI anime
import {
  CANVAS_NODE_TYPES,
  DEFAULT_ASPECT_RATIO,
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  type CanvasNode,
  type CanvasNodeData,
  type CanvasNodeType,
} from '../domain/canvasNodes';
import {
  aspectRatioFromImageDimensions,
  ensureAtLeastOneMinEdge,
  resolveMinEdgeFittedSize,
  resolveSizeInsideTargetBox,
} from './imageNodeSizing';

const IMAGE_NODE_VISUAL_MIN_EDGE = 300;

export function isImageAutoResizableType(type: CanvasNodeType): boolean {
  return type === CANVAS_NODE_TYPES.upload
    || type === CANVAS_NODE_TYPES.imageEdit
    || type === CANVAS_NODE_TYPES.exportImage
    || type === CANVAS_NODE_TYPES.imageGen
    || type === CANVAS_NODE_TYPES.video;
}

export function withManualSizeLock(node: CanvasNode): CanvasNode {
  const nodeData = node.data as CanvasNodeData & {
    isSizeManuallyAdjusted?: boolean;
    aspectRatio?: string;
  };
  const aspectRatio = typeof nodeData.aspectRatio === 'string' ? nodeData.aspectRatio : '';
  const currentWidth =
    (typeof node.width === 'number' ? node.width : null)
    ?? (typeof node.measured?.width === 'number' ? node.measured.width : null)
    ?? (typeof node.style?.width === 'number' ? node.style.width : null);
  const currentHeight =
    (typeof node.height === 'number' ? node.height : null)
    ?? (typeof node.measured?.height === 'number' ? node.measured.height : null)
    ?? (typeof node.style?.height === 'number' ? node.style.height : null);

  // A distorted React Flow box would expose letterboxing around object-contain media.
  let snapped: { width: number; height: number } | null = null;
  if (aspectRatio && typeof currentWidth === 'number' && typeof currentHeight === 'number') {
    const fitted = resolveSizeInsideTargetBox(aspectRatio, {
      width: currentWidth,
      height: currentHeight,
    });
    if (Math.abs(fitted.width - currentWidth) > 1 || Math.abs(fitted.height - currentHeight) > 1) {
      snapped = fitted;
    }
  }

  if (nodeData.isSizeManuallyAdjusted && !snapped) {
    return node;
  }

  return {
    ...node,
    ...(snapped
      ? {
          width: snapped.width,
          height: snapped.height,
          style: { ...(node.style ?? {}), width: snapped.width, height: snapped.height },
        }
      : {}),
    data: {
      ...node.data,
      isSizeManuallyAdjusted: true,
    } as CanvasNodeData,
  };
}

export function resolveAutoImageNodeDimensions(
  aspectRatio: string,
  options?: {
    minWidth?: number;
    minHeight?: number;
  },
): { width: number; height: number } {
  const minWidth = options?.minWidth ?? EXPORT_RESULT_NODE_MIN_WIDTH;
  const minHeight = options?.minHeight ?? EXPORT_RESULT_NODE_MIN_HEIGHT;
  return resolveMinEdgeFittedSize(aspectRatio, { minWidth, minHeight });
}

export function resolveGeneratedImageNodeDimensions(
  aspectRatio: string,
  options?: {
    minWidth?: number;
    minHeight?: number;
  },
): { width: number; height: number } {
  const size = resolveSizeInsideTargetBox(aspectRatio, {
    width: EXPORT_RESULT_NODE_DEFAULT_WIDTH,
    height: EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  });
  const minWidth = options?.minWidth ?? IMAGE_NODE_VISUAL_MIN_EDGE;
  const minHeight = options?.minHeight ?? IMAGE_NODE_VISUAL_MIN_EDGE;

  return ensureAtLeastOneMinEdge(size, { minWidth, minHeight });
}

export function maybeApplyImageAutoResize(
  node: CanvasNode,
  patch: Partial<CanvasNodeData>,
): CanvasNode {
  if (!isImageAutoResizableType(node.type)) {
    return node;
  }

  const isVideo = node.type === CANVAS_NODE_TYPES.video;
  const nodeData = node.data as CanvasNodeData & {
    imageUrl?: string | null;
    videoUrl?: string | null;
    aspectRatio?: string;
    widthPx?: number;
    heightPx?: number;
    isSizeManuallyAdjusted?: boolean;
  };
  const patchData = patch as Partial<CanvasNodeData> & {
    imageUrl?: string | null;
    videoUrl?: string | null;
    aspectRatio?: string;
    widthPx?: number;
    heightPx?: number;
    isSizeManuallyAdjusted?: boolean;
  };

  // Video waits for metadata fields; a URL alone does not reveal its rendered ratio.
  const hasImageRelatedChange = isVideo
    ? ('aspectRatio' in patchData || 'widthPx' in patchData || 'heightPx' in patchData)
    : ('imageUrl' in patchData || 'previewImageUrl' in patchData || 'aspectRatio' in patchData);
  if (!hasImageRelatedChange) {
    return node;
  }

  const isSizeManuallyAdjusted =
    patchData.isSizeManuallyAdjusted ?? nodeData.isSizeManuallyAdjusted ?? false;
  if (isSizeManuallyAdjusted) {
    return node;
  }

  const nextAssetUrl = isVideo
    ? (patchData.videoUrl ?? nodeData.videoUrl)
    : (patchData.imageUrl ?? nodeData.imageUrl);
  if (typeof nextAssetUrl !== 'string' || nextAssetUrl.trim().length === 0) {
    return node;
  }

  const presetAspectRatio =
    patchData.aspectRatio ?? nodeData.aspectRatio ?? DEFAULT_ASPECT_RATIO;
  // Existing video pixels describe the current asset more accurately than its next-generation preset.
  const videoPixelAspectRatio = isVideo
    ? (() => {
        const width = patchData.widthPx ?? nodeData.widthPx;
        const height = patchData.heightPx ?? nodeData.heightPx;
        return typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0
          ? aspectRatioFromImageDimensions(width, height)
          : null;
      })()
    : null;
  const nextAspectRatio = videoPixelAspectRatio ?? presetAspectRatio;
  // Match each node component's own minimums so React Flow does not clamp the ratio again.
  const resizeMins = (() => {
    if (node.type === CANVAS_NODE_TYPES.exportImage) {
      return { minWidth: EXPORT_RESULT_NODE_MIN_WIDTH, minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT };
    }
    if (node.type === CANVAS_NODE_TYPES.video) {
      return { minWidth: 480, minHeight: 280 };
    }
    if (node.type === CANVAS_NODE_TYPES.imageGen) {
      return { minWidth: 480, minHeight: 260 };
    }
    return undefined;
  })();
  const nextSize = resizeMins
    ? resolveAutoImageNodeDimensions(nextAspectRatio, resizeMins)
    : resolveAutoImageNodeDimensions(nextAspectRatio);

  return {
    ...node,
    width: nextSize.width,
    height: nextSize.height,
    style: {
      ...(node.style ?? {}),
      width: nextSize.width,
      height: nextSize.height,
    },
  };
}
