// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  buildLocalThreeDWorldDirectorManifest,
  buildThreeDWorldClearScenePatch,
  buildThreeDWorldSaveScenePatch,
  directorSourcesForNode,
  pickThreeDWorldPlyUrl,
  projectThreeDWorldPanoSources,
  projectThreeDWorldPreview,
  projectThreeDWorldReferences,
  resolveThreeDWorldBeatContext,
  resolveThreeDWorldImageSourceKind,
  resolveThreeDWorldNodeSize,
  resolveThreeDWorldTitle,
  usableDirectorWorldPreviewUrl,
} from '@/features/canvas/application/threeDWorldNodeModel';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  getCanvasBeatDirectorManifest,
  getCanvasDirectorStagePalette,
  uploadAndAutoCommitSelectedBackgroundCandidate,
  uploadCanvasAsset,
  uploadLocalImageToBackend,
} from '@/features/canvas/composition';
import {
  imageUrlFromCanvasNode,
  isPanoImageCanvasNode,
  mergeDirectorStageManifestSources,
  mergeDirectorSavedSceneMaps,
  mergeDirectorWorldSources,
} from '@/features/canvas/domain/directorWorldSources';
import type { ThreeDWorldNodeData } from '@/features/canvas/domain/canvasNodes';
import { useDetachUpstream } from '@/features/canvas/hooks/useDetachUpstream';
import { useUpstreamNodes } from '@/features/canvas/hooks/useUpstreamGraph';
import {
  generateCanvasImageTo3d,
  generationTaskDescriptor,
  directorCaptureBlobToDataUrl,
  readDirectorCaptureImageSize,
  resolveCanvasImageTo3dSourceKind,
  setDirectorWorldSceneSaveHandler,
  uploadDirectorCaptureBundle,
  useNodeGenerationHistory,
  useNodeGenerationTaskState,
  validMainlineContexts,
  type CanvasGenerationHistoryRecord,
  type DirectorCaptureAssetUploader,
} from '@/modules/creative_canvas/public';
import { withImageCacheBust } from '@/shared/media/image-cache';
import type { ThreeDDirectorCaptureMeta } from '@/features/viewer-kit/three-d/ThreeDDirectorDialog';
import type {
  DirectorStageManifest,
  DirectorWorldSource,
} from '@/features/viewer-kit/three-d/directorManifest';
import type { ThreeDSceneSnapshot } from '@/features/viewer-kit/three-d/engine/viewerApp';

export interface ThreeDWorldNodeControllerOptions {
  id: string;
  data: ThreeDWorldNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
  projectId: string;
  canvasId: string;
}

const uploadDirectorCaptureAsset: DirectorCaptureAssetUploader = (
  projectId,
  blob,
  filename,
  options,
) => uploadCanvasAsset(projectId, blob, filename, options);

export function useThreeDWorldNodeController({
  id,
  data,
  selected,
  width,
  height,
  projectId,
  canvasId,
}: ThreeDWorldNodeControllerOptions) {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addPanoCaptureGroup = useCanvasStore(
    (state) => state.addPanoCaptureGroup,
  );
  const upstreamNodes = useUpstreamNodes(id);
  const detachUpstream = useDetachUpstream(id);
  const captureCanvasNodeBusyRef = useRef(false);
  const size = resolveThreeDWorldNodeSize(width, height);
  const {
    records: historyRecords,
    isLoading: historyLoading,
    refresh: refreshHistory,
  } = useNodeGenerationHistory({
    projectId,
    canvasId,
    nodeId: id,
    enabled: Boolean(selected),
  });

  const restoreHistory = useCallback(
    (record: CanvasGenerationHistoryRecord) => {
      const plyUrl = pickThreeDWorldPlyUrl(record.result);
      if (!plyUrl) return;
      updateNodeData(id, {
        plyUrl,
        isGenerating: false,
        taskKey: null,
        errorMessage: null,
      });
    },
    [id, updateNodeData],
  );

  const resolvedTitle = useMemo(() => resolveThreeDWorldTitle(data), [data]);
  const title =
    resolvedTitle === '3D 世界'
      ? t('viewer.threeD.directorWorld')
      : resolvedTitle;
  const references = useMemo(
    () => projectThreeDWorldReferences(upstreamNodes, data.sourceNodeId),
    [data.sourceNodeId, upstreamNodes],
  );
  const upstreamPanoSources = useMemo(
    () => projectThreeDWorldPanoSources(upstreamNodes),
    [upstreamNodes],
  );
  const { isGenerating } = useNodeGenerationTaskState(data);
  const contexts = useMemo(
    () =>
      validMainlineContexts(
        (data as { mainline_context?: unknown }).mainline_context,
      ),
    [data],
  );
  const beatContext = useMemo(
    () => resolveThreeDWorldBeatContext(data, contexts),
    [contexts, data],
  );
  const [directorBusy, setDirectorBusy] = useState(false);
  const [directorDialogOpen, setDirectorDialogOpen] = useState(false);
  const [directorManifest, setDirectorManifest] =
    useState<DirectorStageManifest | null>(null);

  const openDirector = useCallback(async () => {
    if (!projectId) return;
    setDirectorBusy(true);
    try {
      let manifest: DirectorStageManifest | null = null;
      if (beatContext) {
        try {
          manifest = await getCanvasBeatDirectorManifest({
            projectId,
            episode: beatContext.episode,
            beat: beatContext.beat,
          });
          manifest = mergeDirectorStageManifestSources(
            manifest,
            directorSourcesForNode(data, upstreamPanoSources),
          );
        } catch (error) {
          console.warn(
            '[3d-world] beat director manifest unavailable, falling back to node PLY',
            error,
          );
        }
      }
      let defaultPalette: DirectorStageManifest['palette'] | null = null;
      if (!manifest) {
        try {
          defaultPalette = await getCanvasDirectorStagePalette({ projectId });
        } catch (error) {
          console.warn(
            '[3d-world] default director palette unavailable',
            error,
          );
        }
      }
      manifest ??= buildLocalThreeDWorldDirectorManifest({
        project: projectId,
        data,
        contexts,
        beatContext,
        upstreamPanoSources,
        defaultPalette,
      });
      setDirectorManifest(manifest);
      setDirectorDialogOpen(true);
    } catch (error) {
      console.error('[3d-world] director dialog open failed', error);
    } finally {
      setDirectorBusy(false);
    }
  }, [beatContext, contexts, data, projectId, upstreamPanoSources]);

  const sourceNodeForGeneration = useMemo(() => {
    if (references.activeRef?.kind !== 'image') return null;
    return (
      upstreamNodes.find(
        (node) => node.id === references.activeRef?.nodeId,
      ) ?? null
    );
  }, [references.activeRef, upstreamNodes]);
  const selectedImageSourceKind = resolveThreeDWorldImageSourceKind(
    sourceNodeForGeneration,
    data.plyKind,
  );

  const submitGeneration = useCallback(async () => {
    const sourceNode = sourceNodeForGeneration;
    if (!projectId) {
      updateNodeData(id, { errorMessage: '无法识别当前项目' });
      return;
    }
    if (!references.activeRef || isGenerating) return;
    if (references.activeRef.kind === 'text') {
      updateNodeData(id, {
        errorMessage: '文生 3D 模型尚未对接，请连接图片节点',
      });
      return;
    }
    if (!sourceNode) return;
    const sourceUrl = imageUrlFromCanvasNode(sourceNode);
    if (!sourceUrl) return;
    const sourceKind = resolveCanvasImageTo3dSourceKind(
      sourceNode,
      selectedImageSourceKind,
    );
    const rawPanoSource =
      sourceKind === 'pano'
        ? projectThreeDWorldPanoSources([sourceNode])[0] ?? {
            id: `upstream-pano:${sourceNode.id}`,
            source_type: 'pano360' as const,
            source_kind: 'pano' as const,
            label: '360 图',
            url: sourceUrl,
            pano_url: sourceUrl,
            slot_kind: 'scene_director_pano_360' as const,
          }
        : null;
    updateNodeData(id, {
      isGenerating: true,
      generationStartedAt: Date.now(),
      errorMessage: null,
      sourceNodeId: sourceNode.id,
      sourceKind: 'image',
      plyKind: sourceKind,
      previewImageUrl: sourceUrl,
      ...(rawPanoSource
        ? {
            sources: mergeDirectorWorldSources(
              data.sources ?? [],
              rawPanoSource,
            ),
            activeSourceId: rawPanoSource.id ?? null,
            panoUrl: rawPanoSource.pano_url ?? rawPanoSource.url ?? null,
          }
        : {}),
    });
    try {
      const { source: generatedSource } = await generateCanvasImageTo3d(
        {
          projectId,
          sourceUrl,
          sourceKind,
          canvasId,
          nodeId: id,
        },
        (task) => {
          updateNodeData(id, {
            taskKey: task.task_key,
            ...generationTaskDescriptor(task),
          });
        },
      );
      const currentWorld = useCanvasStore
        .getState()
        .nodes.find((node) => node.id === id);
      const currentSources =
        (currentWorld?.data as
          | { sources?: DirectorWorldSource[] }
          | undefined)?.sources ?? [];
      updateNodeData(id, {
        sources: mergeDirectorWorldSources(
          currentSources,
          rawPanoSource,
          generatedSource,
        ),
        activeSourceId: generatedSource.id ?? null,
        plyUrl: generatedSource.ply_url ?? generatedSource.url ?? null,
        panoUrl: rawPanoSource?.pano_url ?? rawPanoSource?.url ?? null,
        isGenerating: false,
        taskKey: null,
        errorMessage: null,
      });
    } catch (error) {
      updateNodeData(id, {
        isGenerating: false,
        taskKey: null,
        errorMessage: `生成失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      void refreshHistory();
    }
  }, [
    canvasId,
    data.sources,
    id,
    isGenerating,
    projectId,
    references.activeRef,
    refreshHistory,
    selectedImageSourceKind,
    sourceNodeForGeneration,
    updateNodeData,
  ]);

  const captureSelectedBackground = useCallback(
    async (blob: Blob) => {
      if (!beatContext) {
        throw new Error('当前不在镜头上下文中，不能设置当前背景');
      }
      await uploadAndAutoCommitSelectedBackgroundCandidate(
        projectId,
        { episode: beatContext.episode, beat: beatContext.beat },
        blob,
        `background_3gs_${Date.now()}.png`,
        {
          sourceNodeId: id,
          label: t('viewer.threeD.selectedBackgroundOutputLabel'),
          successMessage: t(
            'viewer.threeD.selectedBackgroundCommitSuccess',
            {
              episode: beatContext.episode,
              beat: beatContext.beat,
            },
          ),
        },
      );
      updateNodeData(id, { errorMessage: null });
    },
    [beatContext, id, projectId, t, updateNodeData],
  );

  const submitDirectorCombined = useCallback(
    async (_blob: Blob, meta: ThreeDDirectorCaptureMeta) => {
      if (!beatContext) return;
      if (!projectId) {
        throw new Error('缺少项目，无法保存画布导演合成图');
      }
      if (!meta.captureBundle) {
        throw new Error('导演合成图缺少 combined/env_only/frame_meta');
      }
      const bundle = await uploadDirectorCaptureBundle(
        projectId,
        id,
        meta.captureBundle,
        uploadDirectorCaptureAsset,
      );
      const imageUrl = bundle.urls?.combined ?? '';
      if (!imageUrl) throw new Error('画布导演合成图缺少图片地址');
      updateNodeData(id, {
        previewImageUrl: withImageCacheBust(imageUrl, Date.now()),
        director_control_bundle: bundle,
        slot_target: {
          kind: 'director_render',
          episode: beatContext.episode,
          beat: beatContext.beat,
        },
        scene: meta.snapshot,
        errorMessage: null,
      });
    },
    [beatContext, id, projectId, updateNodeData],
  );

  const captureCanvasNode = useCallback(
    async (blob: Blob, meta: ThreeDDirectorCaptureMeta) => {
      if (captureCanvasNodeBusyRef.current) return;
      captureCanvasNodeBusyRef.current = true;
      try {
        if (projectId && meta.captureBundle) {
          const bundle = await uploadDirectorCaptureBundle(
            projectId,
            id,
            meta.captureBundle,
            uploadDirectorCaptureAsset,
          );
          const [combinedDataUrl, envOnlyDataUrl] = await Promise.all([
            directorCaptureBlobToDataUrl(
              meta.captureBundle.combined,
              '无法读取 3GS 截图',
            ),
            directorCaptureBlobToDataUrl(
              meta.captureBundle.env_only,
              '无法读取 3GS 截图',
            ),
          ]);
          const [combinedSize, envOnlySize] = await Promise.all([
            readDirectorCaptureImageSize(
              combinedDataUrl,
              '无法解析 3GS 截图尺寸',
            ),
            readDirectorCaptureImageSize(
              envOnlyDataUrl,
              '无法解析 3GS 截图尺寸',
            ),
          ]);
          const baseMetadata = {
            viewer: 'director_world',
            source_kind: meta.source.source_kind,
            snapshot: meta.snapshot,
            director_control_bundle: bundle,
          };
          const groupId = addPanoCaptureGroup(
            id,
            [
              {
                dataUrl: combinedDataUrl,
                uploadedUrl: bundle.urls?.combined ?? '',
                width: combinedSize.width,
                height: combinedSize.height,
                label: '导演合成图',
                metadata: { ...baseMetadata, render_mode: 'combined' },
              },
              {
                dataUrl: envOnlyDataUrl,
                uploadedUrl: bundle.urls?.env_only ?? '',
                width: envOnlySize.width,
                height: envOnlySize.height,
                label: '纯背景图',
                metadata: { ...baseMetadata, render_mode: 'env_only' },
              },
            ],
            { cols: 2, groupName: '导演世界输出' },
          );
          updateNodeData(id, {
            scene: meta.snapshot,
            errorMessage: groupId ? null : '导演世界截图输出到画布失败',
          });
          if (groupId) {
            toast.success(t('viewer.threeD.outputToCanvasNodeSuccess'));
          }
          return;
        }
        const dataUrl = await directorCaptureBlobToDataUrl(
          blob,
          '无法读取 3GS 截图',
        );
        const size = await readDirectorCaptureImageSize(
          dataUrl,
          '无法解析 3GS 截图尺寸',
        );
        const uploadedUrl = await uploadLocalImageToBackend(
          projectId,
          dataUrl,
          `3gs-${id}-${meta.kind}-${Date.now()}.png`,
        );
        const groupId = addPanoCaptureGroup(id, [
          {
            dataUrl,
            uploadedUrl,
            width: size.width,
            height: size.height,
            label: `导演世界 ${meta.kind}`,
            metadata: {
              viewer: '3gs',
              render_mode: meta.kind,
              source_kind: meta.source.source_kind,
              snapshot: meta.snapshot,
            },
          },
        ]);
        updateNodeData(id, {
          scene: meta.snapshot,
          errorMessage: groupId ? null : '导演世界截图输出到画布失败',
        });
        if (groupId) {
          toast.success(t('viewer.threeD.outputToCanvasNodeSuccess'));
        }
      } finally {
        captureCanvasNodeBusyRef.current = false;
      }
    },
    [addPanoCaptureGroup, id, projectId, t, updateNodeData],
  );

  const saveScene = useCallback(
    async (snapshot: ThreeDSceneSnapshot, activeSourceId?: string) => {
      updateNodeData(
        id,
        buildThreeDWorldSaveScenePatch(
          data,
          upstreamPanoSources,
          snapshot,
          activeSourceId,
        ),
      );
    },
    [data, id, updateNodeData, upstreamPanoSources],
  );
  const registerSaveSceneHandler = useCallback(
    (handler: (() => Promise<void>) | null) => {
      setDirectorWorldSceneSaveHandler(id, handler);
    },
    [id],
  );
  const clearScene = useCallback(
    async (activeSourceId?: string) => {
      updateNodeData(id, buildThreeDWorldClearScenePatch(data, activeSourceId));
    },
    [data, id, updateNodeData],
  );

  useEffect(
    () => () => setDirectorWorldSceneSaveHandler(id, null),
    [id],
  );
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, size.height, size.width, updateNodeInternals]);

  const preview = useMemo(
    () =>
      projectThreeDWorldPreview({
        data,
        activeRef: references.activeRef,
        upstreamPanoSources,
      }),
    [data, references.activeRef, upstreamPanoSources],
  );
  const referenceImage =
    references.activeRef?.kind === 'image' &&
    references.activeRef.imageUrl
      ? {
          nodeId: references.activeRef.nodeId,
          url: references.activeRef.imageUrl,
          displayName: references.activeRef.displayName,
        }
      : null;
  const referenceText =
    references.activeRef?.kind === 'text' &&
    references.activeRef.textContent
      ? {
          nodeId: references.activeRef.nodeId,
          text: references.activeRef.textContent,
          displayName: references.activeRef.displayName,
        }
      : null;
  const initialScene =
    (data.scene as ThreeDSceneSnapshot | null) ??
    (directorManifest?.scene as ThreeDSceneSnapshot | null | undefined) ??
    null;
  const initialScenesBySourceId = mergeDirectorSavedSceneMaps(
    data.scenesBySourceId as
      | Record<string, ThreeDSceneSnapshot>
      | null
      | undefined,
    directorManifest?.scenes_by_source_id as
      | Record<string, ThreeDSceneSnapshot>
      | null
      | undefined,
  );

  return {
    data,
    selected,
    size,
    title,
    nodeContexts: (data as { mainline_context?: unknown }).mainline_context,
    isGenerating,
    hasUpstream: Boolean(references.activeRef),
    referenceImages: references.referenceImages,
    selectedReferenceNodeId: references.selectedImageRef?.nodeId ?? null,
    referenceImage,
    referenceText,
    selectedImageSourceKind,
    historyRecords,
    historyLoading,
    preview,
    directorBusy,
    directorDialogOpen,
    directorManifest,
    beatContext,
    initialScene,
    initialScenesBySourceId,
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    openDirector,
    changeDirectorDialogOpen: setDirectorDialogOpen,
    changeReferenceImage: (nodeId: string) => {
      const node = upstreamNodes.find((item) => item.id === nodeId) ?? null;
      updateNodeData(id, {
        sourceNodeId: nodeId,
        plyKind: node && isPanoImageCanvasNode(node) ? 'pano' : 'master',
      });
    },
    changeSourceKind: (plyKind: 'master' | 'pano') =>
      updateNodeData(id, { plyKind }),
    submitGeneration,
    focusUpstream: setSelectedNode,
    detachUpstream,
    restoreHistory,
    refreshHistory: () => void refreshHistory(),
    captureSelectedBackground,
    submitDirectorCombined,
    captureCanvasNode,
    saveScene,
    registerSaveSceneHandler,
    clearScene,
    currentPlyUrl: data.plyUrl ?? null,
    previewThumbnailUrl: usableDirectorWorldPreviewUrl(data.previewImageUrl),
  };
}

export type ThreeDWorldNodeController = ReturnType<
  typeof useThreeDWorldNodeController
>;
