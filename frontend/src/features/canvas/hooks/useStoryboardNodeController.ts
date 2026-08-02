// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore, useUpdateNodeInternals } from '@xyflow/react';

import {
  resolveStoryboardIncomingImages,
  resolveStoryboardNodeProjection,
  type StoryboardIncomingImage,
} from '@/features/canvas/application/storyboardNodeModel';
import {
  resolveImageDisplayUrl,
  shouldUseOriginalImageByZoom,
} from '@/features/canvas/application/imageData';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  CANVAS_NODE_TYPES,
  type StoryboardExportOptions,
  type StoryboardFrameItem,
  type StoryboardSplitNodeData,
} from '@/features/canvas/domain/canvasNodes';
import {
  EXPORT_RESULT_DISPLAY_NAME,
  resolveNodeDisplayName,
} from '@/features/canvas/domain/nodeDisplay';
import {
  exportStoryboardGrid,
  packStoryboardFrames,
  prepareNodeImage,
  uploadLocalImageToBackend,
} from '@/features/canvas/composition';
import { useUpstreamNodes } from '@/features/canvas/hooks/useUpstreamGraph';

export interface StoryboardPickerState {
  frameId: string;
  x: number;
  y: number;
}

export interface StoryboardIncomingImageItem extends StoryboardIncomingImage {
  displayUrl: string;
  viewerUrl: string;
}

export interface StoryboardNodeControllerOptions {
  projectId: string;
  id: string;
  data: StoryboardSplitNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}

export function useStoryboardNodeController({
  projectId,
  id,
  data,
  selected,
  width,
  height,
}: StoryboardNodeControllerOptions) {
  const updateNodeInternals = useUpdateNodeInternals();
  const rootRef = useRef<HTMLDivElement>(null);
  const pickerMenuRef = useRef<HTMLDivElement>(null);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const reorderStoryboardFrame = useCanvasStore(
    (state) => state.reorderStoryboardFrame,
  );
  const addDerivedExportNode = useCanvasStore(
    (state) => state.addDerivedExportNode,
  );
  const addEdge = useCanvasStore((state) => state.addEdge);
  const updateStoryboardFrame = useCanvasStore(
    (state) => state.updateStoryboardFrame,
  );
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const upstreamNodes = useUpstreamNodes(id);
  const preferOriginalImage = useStore((state) =>
    shouldUseOriginalImageByZoom(state.transform[2]),
  );

  const [draggedFrameId, setDraggedFrameId] = useState<string | null>(null);
  const [dropTargetFrameId, setDropTargetFrameId] = useState<string | null>(
    null,
  );
  const [pickerState, setPickerState] =
    useState<StoryboardPickerState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPackingSingleImages, setIsPackingSingleImages] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportPanelOpen, setIsExportPanelOpen] = useState(false);

  const projection = useMemo(
    () => resolveStoryboardNodeProjection(data, width, height),
    [data, height, width],
  );
  const title = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.storyboardSplit, data),
    [data],
  );
  const incomingImageItems = useMemo<StoryboardIncomingImageItem[]>(
    () =>
      resolveStoryboardIncomingImages(upstreamNodes).map((item) => ({
        ...item,
        displayUrl: resolveImageDisplayUrl(
          item.previewImageUrl || item.imageUrl,
        ),
        viewerUrl: resolveImageDisplayUrl(item.imageUrl),
      })),
    [upstreamNodes],
  );
  const frameViewerImageList = useMemo(
    () =>
      projection.orderedFrames
        .map((frame) => frame.imageUrl || frame.previewImageUrl)
        .filter((source): source is string => Boolean(source))
        .map(resolveImageDisplayUrl),
    [projection.orderedFrames],
  );
  const incomingImageViewerList = useMemo(
    () => incomingImageItems.map((item) => item.viewerUrl),
    [incomingImageItems],
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, projection.size.height, projection.size.width, updateNodeInternals]);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const target = event.target as Node;
      const insideRoot = root.contains(target);
      const insidePicker = pickerMenuRef.current?.contains(target) ?? false;
      if (!insideRoot && !insidePicker) setPickerState(null);
      if (!insideRoot) setIsExportPanelOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener(
        'pointerdown',
        handleOutsidePointerDown,
        true,
      );
    };
  }, []);

  const patchExportOptions = useCallback(
    (patch: Partial<StoryboardExportOptions>) => {
      updateNodeData(id, {
        exportOptions: { ...projection.exportOptions, ...patch },
      });
    },
    [id, projection.exportOptions, updateNodeData],
  );

  const startSort = useCallback((frameId: string) => {
    setDraggedFrameId(frameId);
    setDropTargetFrameId(frameId);
    setPickerState(null);
  }, []);

  const hoverSortTarget = useCallback(
    (frameId: string) => {
      if (draggedFrameId) setDropTargetFrameId(frameId);
    },
    [draggedFrameId],
  );

  const finalizeSort = useCallback(() => {
    if (!draggedFrameId) return;
    if (dropTargetFrameId && dropTargetFrameId !== draggedFrameId) {
      reorderStoryboardFrame(id, draggedFrameId, dropTargetFrameId);
    }
    setDraggedFrameId(null);
    setDropTargetFrameId(null);
  }, [draggedFrameId, dropTargetFrameId, id, reorderStoryboardFrame]);

  useEffect(() => {
    if (!draggedFrameId) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointerup', finalizeSort);
    window.addEventListener('pointercancel', finalizeSort);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointerup', finalizeSort);
      window.removeEventListener('pointercancel', finalizeSort);
    };
  }, [draggedFrameId, finalizeSort]);

  const editFrame = useCallback(
    async (frame: StoryboardFrameItem) => {
      try {
        const sourceImage = frame.imageUrl ?? frame.previewImageUrl;
        if (!sourceImage) {
          setExportError('该格没有可编辑图片');
          return;
        }
        const frameIndex = projection.orderedFrames.findIndex(
          (item) => item.id === frame.id,
        );
        const frameTitle =
          frameIndex >= 0
            ? `格 ${frameIndex + 1}`
            : EXPORT_RESULT_DISPLAY_NAME.storyboardFrameEdit;
        const prepared = await prepareNodeImage(sourceImage);
        const uploadedUrl = await uploadLocalImageToBackend(
          projectId,
          prepared.imageUrl,
          `storyboard-frame-${id}-${Date.now()}.png`,
        );
        const createdNodeId = addDerivedExportNode(
          id,
          uploadedUrl,
          prepared.aspectRatio,
          uploadedUrl,
          {
            defaultTitle: frameTitle,
            resultKind: 'storyboardFrameEdit',
          },
        );
        if (createdNodeId) addEdge(id, createdNodeId);
      } catch (error) {
        setExportError(
          error instanceof Error ? error.message : '创建编辑节点失败',
        );
      }
    },
    [
      addDerivedExportNode,
      addEdge,
      id,
      projectId,
      projection.orderedFrames,
    ],
  );

  const exportGrid = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const result = await exportStoryboardGrid(projectId, {
        nodeId: id,
        frames: projection.orderedFrames,
        rows: projection.gridRows,
        cols: projection.gridCols,
        options: projection.exportOptions,
      });
      const createdNodeId = addDerivedExportNode(
        id,
        result.imageUrl,
        result.aspectRatio,
        result.imageUrl,
        {
          defaultTitle: EXPORT_RESULT_DISPLAY_NAME.storyboardSplitExport,
          resultKind: 'storyboardSplitExport',
        },
      );
      if (createdNodeId) addEdge(id, createdNodeId);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  }, [
    addDerivedExportNode,
    addEdge,
    id,
    isExporting,
    projectId,
    projection.exportOptions,
    projection.gridCols,
    projection.gridRows,
    projection.orderedFrames,
  ]);

  const packSingleImages = useCallback(async () => {
    if (isExporting || isPackingSingleImages) return;
    setExportError(null);
    setIsPackingSingleImages(true);
    try {
      await packStoryboardFrames(projectId, projection.orderedFrames);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : '打包下载失败',
      );
    } finally {
      setIsPackingSingleImages(false);
    }
  }, [
    isExporting,
    isPackingSingleImages,
    projectId,
    projection.orderedFrames,
  ]);

  const togglePicker = useCallback(
    (frameId: string, x: number, y: number) => {
      setPickerState((previous) =>
        previous?.frameId === frameId ? null : { frameId, x, y },
      );
    },
    [],
  );

  const replaceFromInput = useCallback(
    (frameId: string, imageUrl: string) => {
      setExportError(null);
      const matched = incomingImageItems.find(
        (item) => item.imageUrl === imageUrl,
      );
      updateStoryboardFrame(id, frameId, {
        imageUrl: matched?.imageUrl ?? imageUrl,
        previewImageUrl:
          matched?.previewImageUrl ?? matched?.imageUrl ?? imageUrl,
      });
      setPickerState(null);
    },
    [id, incomingImageItems, updateStoryboardFrame],
  );

  return {
    id,
    data,
    selected,
    title,
    projection,
    preferOriginalImage,
    incomingImageItems,
    frameViewerImageList,
    incomingImageViewerList,
    rootRef,
    pickerMenuRef,
    draggedFrameId,
    dropTargetFrameId,
    pickerState,
    isExporting,
    isPackingSingleImages,
    isAnyExporting: isExporting || isPackingSingleImages,
    exportError,
    isExportPanelOpen,
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    updateFrameNote: (frameId: string, note: string) =>
      updateStoryboardFrame(id, frameId, { note }),
    patchExportOptions,
    startSort,
    hoverSortTarget,
    editFrame,
    exportGrid,
    packSingleImages,
    togglePicker,
    replaceFromInput,
    toggleExportPanel: () => setIsExportPanelOpen((open) => !open),
  };
}

export type StoryboardNodeController = ReturnType<
  typeof useStoryboardNodeController
>;
