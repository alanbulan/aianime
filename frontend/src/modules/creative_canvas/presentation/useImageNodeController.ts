// Copyright (c) 2026 AI anime
import {
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from 'react';
import {
  useStore as useReactFlowStore,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type {
  CanvasEdge,
  CanvasNodeData,
  CanvasNodeType,
  ExportImageNodeData,
  ImageEditNodeData,
} from '../domain/canvasNodeData';
import { DEFAULT_ASPECT_RATIO } from '../domain/aspectRatio';
import {
  EXPORT_RESULT_NODE_MIN_HEIGHT,
  EXPORT_RESULT_NODE_MIN_WIDTH,
  EXPORT_RESULT_NODE_RESIZE_MIN_EDGE,
} from '../domain/imageNodeLayout';
import {
  aspectRatioFromImageDimensions,
  resolveImageNodeDimension,
  resolveMinEdgeFittedSize,
  resolveResizeMinConstraintsByAspect,
  shouldForceNaturalImageSize,
} from '../domain/imageNodeSizing';
import {
  nodeBodyImageMeasurement,
  nodeBodyImageSrc,
  nodeBodyRecordDescribesImage,
  planNaturalSizeRecordWrite,
  readNodeNaturalSize,
  resolveImageDisplayUrl,
  shouldUseOriginalImageByZoom,
} from '../domain/imageData';
import {
  collectCandidateBindingsForNode,
  hasMainlineContexts,
} from '../domain/mainlineContext';
import { resolveNodeDisplayName } from '../domain/nodeDisplay';
import { canRegenerateExportImageNode } from '../application/regenerateExportNode';
import type { RegenerateExportImageNodeParams } from '../application/regenerateExportNode';
import { useNodeGenerationTaskState } from './useNodeGenerationTaskState';
import { useNaturalSizeRecordTrust } from './useNaturalSizeRecordTrust';
import { useNodeBodyVariantBudget } from './useNodeBodyVariantBudget';

import { withImageCacheBust } from '@/shared/media/image-cache';

export interface ImageNodeStore {
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (
    id: string,
    patch: Partial<CanvasNodeData>,
    options?: { recordHistory?: boolean },
  ) => void;
  updateNodeSize: (
    id: string,
    size: { width: number; height: number },
    options?: {
      lockManualSize?: boolean;
      recordHistory?: boolean;
      data?: Partial<CanvasNodeData>;
    },
  ) => void;
  edges: readonly CanvasEdge[];
}

export type ImageNodeStoreHook = <TSelected>(
  selector: (state: ImageNodeStore) => TSelected,
) => TSelected;

export type ImageNodeRegenerateExport = (
  params: Omit<RegenerateExportImageNodeParams, 'runtimeSessionId'>,
) => Promise<void> | void;

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

export function createUseImageNodeController({
  useStore,
  regenerateExportImageNode,
}: {
  useStore: ImageNodeStoreHook;
  regenerateExportImageNode: ImageNodeRegenerateExport;
}) {
  return function useImageNodeController({
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
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const updateNodeData = useStore((state) => state.updateNodeData);
    const updateNodeSize = useStore((state) => state.updateNodeSize);
    const connectedEdges = useStore(
      useShallow((state) => state.edges.filter(
        (edge) => edge.source === id || edge.target === id,
      )),
    );
    const preferOriginalImage = useReactFlowStore((state) =>
      shouldUseOriginalImageByZoom(state.transform[2]),
    );
    const [now, setNow] = useState(() => Date.now());
    const [naturalSize, setNaturalSize] = useState<{
      width: number;
      height: number;
    } | null>(() => readNodeNaturalSize(data));
    const isExportResultNode = type === CANVAS_NODE_TYPES.exportImage;
    const { isGenerating, progress: generationProgress } =
      useNodeGenerationTaskState(data);
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
    const bodyVariantBudget = useNodeBodyVariantBudget({
      width: resolvedWidth,
      height: resolvedHeight,
    });
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
    const recordedNaturalSize = useMemo(() => readNodeNaturalSize(data), [data]);
    const recordSubject = useMemo(() => {
      const picked = data.previewImageUrl || data.imageUrl;
      if (!picked) return null;
      const committedAt = (data as { committed_at?: unknown }).committed_at;
      return `${picked}\u0000${typeof committedAt === 'string' ? committedAt : ''}`;
    }, [data]);
    const { distrusted, distrustRecord, trustAgain } =
      useNaturalSizeRecordTrust(recordSubject);
    const bodyImage = useMemo(() => {
      const picked = preferOriginalImage
        ? data.imageUrl || data.previewImageUrl
        : data.previewImageUrl || data.imageUrl;
      if (!picked) {
        return null;
      }
      const resolved = resolveImageDisplayUrl(withImageCacheBust(
        picked,
        (data as { committed_at?: unknown }).committed_at as
          | string
          | undefined,
      ));
      return nodeBodyImageSrc(resolved, recordedNaturalSize, {
        preferOriginal: preferOriginalImage || distrusted,
        requiredEdge: bodyVariantBudget,
      });
    }, [
      bodyVariantBudget,
      data,
      data.imageUrl,
      data.previewImageUrl,
      distrusted,
      preferOriginalImage,
      recordedNaturalSize,
    ]);
    const imageSource = bodyImage?.src ?? null;
    const originalImageUrl = useMemo(
      () => data.imageUrl ? resolveImageDisplayUrl(data.imageUrl) : null,
      [data.imageUrl],
    );

    const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
      if (
        bodyImage?.downscaled &&
        !nodeBodyRecordDescribesImage(
          event.currentTarget,
          recordedNaturalSize,
          bodyImage.maxEdge ?? 0,
        )
      ) {
        distrustRecord();
        return;
      }
      const measuringRecordSubject = !preferOriginalImage;
      if (measuringRecordSubject) {
        trustAgain();
      }
      const measured = bodyImage
        ? nodeBodyImageMeasurement(
            event.currentTarget,
            bodyImage,
            recordedNaturalSize,
          )
        : {
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          };
      if (measured.width > 0 && measured.height > 0) {
        setNaturalSize((previous) => (
          previous?.width === measured.width && previous.height === measured.height
            ? previous
            : measured
        ));
      }
      const forceNaturalSize = shouldForceNaturalImageSize(
        data as Record<string, unknown>,
      );
      const sizeLockedByUser =
        data.isSizeManuallyAdjusted === true && !forceNaturalSize;
      const nextAspectRatio = aspectRatioFromImageDimensions(
        measured.width,
        measured.height,
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
      const recordWrite = planNaturalSizeRecordWrite({
        aspectRatioChanged: nextAspectRatio !== data.aspectRatio,
        displaySizeMismatch,
        record: recordedNaturalSize,
        measured,
        measuringRecordSubject,
        sizeLockedByUser,
      });
      if (!recordWrite.persist) return;
      if (!recordWrite.applySize) {
        updateNodeData(
          id,
          {
            imageNaturalWidth: measured.width,
            imageNaturalHeight: measured.height,
          },
          { recordHistory: false },
        );
        return;
      }
      updateNodeSize(id, nextSize, {
        lockManualSize: forceNaturalSize ? false : undefined,
        recordHistory: recordWrite.recordHistory,
        data: {
          aspectRatio: nextAspectRatio,
          imageNaturalWidth: measured.width,
          imageNaturalHeight: measured.height,
          imageAspectRatioUpdatedAt: Date.now(),
        },
      });
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
      generationProgress,
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
  };
}

export type ImageNodeController = ReturnType<
  ReturnType<typeof createUseImageNodeController>
>;
