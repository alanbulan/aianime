// Copyright (c) 2026 AI anime
import {
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from 'react';
import { useStore, useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { useCanvasStore } from '@/features/canvas/canvasStore';
import { regenerateExportImageNode } from '@/features/canvas/composition';
import {
  CANVAS_NODE_TYPES,
  type CanvasNodeType,
  type ExportImageNodeData,
  type ImageEditNodeData,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/modules/creative_canvas/public';
import {
  DEFAULT_ASPECT_RATIO,
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  EXPORT_RESULT_NODE_RESIZE_MIN_EDGE,
  aspectRatioFromImageDimensions,
  canRegenerateExportImageNode,
  collectCandidateBindingsForNode,
  hasMainlineContexts,
  resolveImageNodeDimension,
  resolveMinEdgeFittedSize,
  resolveResizeMinConstraintsByAspect,
  shouldForceNaturalImageSize,
  resolveImageDisplayUrl,
  shouldUseOriginalImageByZoom,
  useNodeGenerationTaskState,
} from '@/modules/creative_canvas/public';
import { withImageCacheBust } from '@/shared/media/image-cache';

export interface ImageNodeControllerOptions {
  projectId: string;
  canvasId: string;
  id: string;
  data: ImageEditNodeData | ExportImageNodeData;
  selected?: boolean;
  type?: string;
  width?: number;
  height?: number;
}

export function useImageNodeController({
  projectId,
  canvasId,
  id,
  data,
  selected,
  type,
  width,
  height,
}: ImageNodeControllerOptions) {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const updateNodeSize = useCanvasStore((state) => state.updateNodeSize);
  const connectedEdges = useCanvasStore(
    useShallow((state) => state.edges.filter(
      (edge) => edge.source === id || edge.target === id,
    )),
  );
  const preferOriginalImage = useStore((state) =>
    shouldUseOriginalImageByZoom(state.transform[2]),
  );
  const [now, setNow] = useState(() => Date.now());
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(() => {
    const naturalWidth = (data as { imageNaturalWidth?: unknown })
      .imageNaturalWidth;
    const naturalHeight = (data as { imageNaturalHeight?: unknown })
      .imageNaturalHeight;
    return (
      typeof naturalWidth === 'number' &&
      typeof naturalHeight === 'number' &&
      naturalWidth > 0 &&
      naturalHeight > 0
    ) ? { width: naturalWidth, height: naturalHeight } : null;
  });
  const isExportResultNode = type === CANVAS_NODE_TYPES.exportImage;
  const { isGenerating } = useNodeGenerationTaskState(data);
  const generationError =
    typeof (data as { generationError?: unknown }).generationError === 'string'
      ? ((data as { generationError?: string }).generationError ?? '').trim()
      : '';
  const generationErrorRequestId =
    typeof (data as { generationErrorRequestId?: unknown })
      .generationErrorRequestId === 'string' &&
    (data as { generationErrorRequestId?: string }).generationErrorRequestId
      ? (data as { generationErrorRequestId?: string })
          .generationErrorRequestId ?? ''
      : '';
  const hasGenerationError =
    isExportResultNode &&
    !isGenerating &&
    !data.imageUrl &&
    generationError.length > 0;
  const generationStartedAt =
    typeof data.generationStartedAt === 'number'
      ? data.generationStartedAt
      : null;
  const generationDurationMs =
    typeof data.generationDurationMs === 'number'
      ? data.generationDurationMs
      : 60000;
  const resolvedAspectRatio = data.aspectRatio || DEFAULT_ASPECT_RATIO;
  const compactSize = resolveMinEdgeFittedSize(resolvedAspectRatio, {
    minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
    minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
  });
  const resizeConstraints = resolveResizeMinConstraintsByAspect(
    resolvedAspectRatio,
    {
      minWidth: EXPORT_RESULT_NODE_RESIZE_MIN_EDGE,
      minHeight: EXPORT_RESULT_NODE_RESIZE_MIN_EDGE,
    },
  );
  const resolvedWidth = resolveImageNodeDimension(width, compactSize.width);
  const resolvedHeight = resolveImageNodeDimension(height, compactSize.height);
  const title = useMemo(
    () => resolveNodeDisplayName(type as CanvasNodeType, data),
    [data, type],
  );
  const contexts = (data as { mainline_context?: unknown }).mainline_context;
  const hasMainlineContext = hasMainlineContexts(contexts);
  const candidateBindingRoles = useMemo(
    () => collectCandidateBindingsForNode(connectedEdges, id).map(
      (binding) => binding.role,
    ),
    [connectedEdges, id],
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, resolvedHeight, resolvedWidth, updateNodeInternals]);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 120);
    return () => {
      window.clearInterval(timer);
    };
  }, [isGenerating]);

  const waitedMinutes = useMemo(() => {
    if (!isGenerating || generationStartedAt === null) {
      return 0;
    }
    return Math.floor(Math.max(0, now - generationStartedAt) / 60000);
  }, [generationStartedAt, isGenerating, now]);
  const waitingResultText = useMemo(() => {
    if (!isExportResultNode) {
      return t('node.imageNode.selectToEdit');
    }
    if (!isGenerating || waitedMinutes < 2) {
      return t('node.imageNode.waitingResult');
    }
    return t('node.imageNode.waitingResultDelayed', {
      minutes: waitedMinutes,
    });
  }, [isExportResultNode, isGenerating, t, waitedMinutes]);
  const imageSource = useMemo(() => {
    const picked = preferOriginalImage
      ? data.imageUrl || data.previewImageUrl
      : data.previewImageUrl || data.imageUrl;
    if (!picked) {
      return null;
    }
    return resolveImageDisplayUrl(withImageCacheBust(
      picked,
      (data as { committed_at?: unknown }).committed_at as
        | string
        | undefined,
    ));
  }, [data, data.imageUrl, data.previewImageUrl, preferOriginalImage]);
  const originalImageUrl = useMemo(
    () => data.imageUrl ? resolveImageDisplayUrl(data.imageUrl) : null,
    [data.imageUrl],
  );

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const naturalWidth = event.currentTarget.naturalWidth;
    const naturalHeight = event.currentTarget.naturalHeight;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setNaturalSize((previous) => (
        previous?.width === naturalWidth && previous.height === naturalHeight
          ? previous
          : { width: naturalWidth, height: naturalHeight }
      ));
    }
    const forceNaturalSize = shouldForceNaturalImageSize(
      data as Record<string, unknown>,
    );
    if (data.isSizeManuallyAdjusted === true && !forceNaturalSize) {
      return;
    }
    const nextAspectRatio = aspectRatioFromImageDimensions(
      naturalWidth,
      naturalHeight,
    );
    if (!nextAspectRatio) {
      return;
    }
    const nextSize = resolveMinEdgeFittedSize(nextAspectRatio, {
      minWidth: EXPORT_RESULT_NODE_MIN_WIDTH,
      minHeight: EXPORT_RESULT_NODE_MIN_HEIGHT,
    });
    const displaySizeMismatch =
      Math.abs(resolvedWidth - nextSize.width) > 1 ||
      Math.abs(resolvedHeight - nextSize.height) > 1;
    if (nextAspectRatio !== data.aspectRatio || displaySizeMismatch) {
      updateNodeSize(id, nextSize, {
        lockManualSize: forceNaturalSize ? false : undefined,
        data: {
          aspectRatio: nextAspectRatio,
          imageNaturalWidth: naturalWidth,
          imageNaturalHeight: naturalHeight,
          imageAspectRatioUpdatedAt: Date.now(),
        },
      });
    }
  };

  return {
    id,
    data,
    selected,
    isExportResultNode,
    title,
    size: {
      width: resolvedWidth,
      height: resolvedHeight,
      resizeMinWidth: resizeConstraints.minWidth,
      resizeMinHeight: resizeConstraints.minHeight,
      maxWidth: 1600,
      maxHeight: 1600,
    },
    hasMainlineContext,
    candidateBindingRoles,
    naturalSize,
    imageSource,
    originalImageUrl,
    isGenerating,
    generationError,
    generationErrorRequestId,
    hasGenerationError,
    generationStartedAt,
    generationDurationMs,
    waitingResultText,
    resolutionLabel: t('node.imageNode.resolution'),
    imageAlt: isExportResultNode
      ? t('node.imageNode.resultAlt')
      : t('node.imageNode.generatedAlt'),
    generationFailedLabel: t('node.imageNode.generationFailed'),
    canRetry: canRegenerateExportImageNode(data as Record<string, unknown>),
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    handleImageLoad,
    retry: () => regenerateExportImageNode({
      projectId,
      canvasId,
      nodeData: data as Record<string, unknown>,
      nodeId: id,
      updateNodeData,
    }),
  };
}

export type ImageNodeController = ReturnType<typeof useImageNodeController>;
