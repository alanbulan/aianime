// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type SyntheticEvent,
} from 'react';
import {
  useStore as useReactFlowStore,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import type {
  DirectorStageManifest,
  ThreeDDirectorCaptureMeta,
} from '@/features/viewer-kit/public';
import { withImageCacheBust } from '@/shared/media/image-cache';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type {
  CanvasEdge,
  CanvasNodeData,
  CanvasNodeType,
  UploadImageNodeData,
} from '../domain/canvasNodeData';
import {
  resolveImageDisplayUrl,
  shouldUseOriginalImageByZoom,
} from '../domain/imageData';
import {
  collectCandidateBindingsForNode,
  hasMainlineContexts,
} from '../domain/mainlineContext';
import {
  directorControlBundleFromData,
  resolveDirectorControlBundleSourceId,
  resolveDroppedMediaFile,
  resolveUploadMediaKind,
  resolveUploadNodeDirectorSource,
  resolveUploadNodeLayout,
  resolveUploadNodeTitle,
  sceneSnapshotFromDirectorControlBundle,
} from '../application/uploadNodeModel';
import { uploadDirectorCaptureBundle } from '../application/directorCaptureBundle';
import type { GetCanvasBeatDirectorManifestParams } from '../application/beatDirectorManifest';

export interface UploadNodeStore {
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  convertNodeType: (
    nodeId: string,
    type: CanvasNodeType,
    dataOverrides?: Partial<CanvasNodeData>,
  ) => boolean;
  addPanoCaptureGroup: (
    sourceNodeId: string,
    captures: Array<{
      dataUrl: string;
      uploadedUrl: string;
      width: number;
      height: number;
      label: string;
      metadata: Record<string, unknown>;
    }>,
    options?: { cols?: number; groupName?: string },
  ) => string | null;
  edges: readonly CanvasEdge[];
}

export type UploadNodeStoreHook = <TSelected>(
  selector: (state: UploadNodeStore) => TSelected,
) => TSelected;

export interface UploadNodeSettingsStore {
  useUploadFilenameAsNodeTitle: boolean;
}

export type UploadNodeSettingsStoreHook = <TSelected>(
  selector: (state: UploadNodeSettingsStore) => TSelected,
) => TSelected;

export interface UploadNodeEventPort {
  publish: (
    event: 'video-node/external-file' | 'audio-node/external-file',
    payload: { nodeId: string; file: File },
  ) => void;
  subscribe: (
    event:
      | 'upload-node/reupload'
      | 'upload-node/paste-image'
      | 'upload-node/external-file',
    handler: (payload: { nodeId: string; file?: File }) => void,
  ) => () => void;
}

export type UploadNodeUploadCanvasAsset = (
  projectId: string,
  file: File | Blob,
  filename: string,
) => Promise<{ filename: string; url: string }>;

export type UploadNodePrepareFile = (
  file: File,
  maxPreviewDimension?: number,
) => Promise<{ aspectRatio: string }>;

export type UploadNodeUploadLocalImage = (
  projectId: string,
  dataUrl: string,
  filename: string,
) => Promise<string>;

export type UploadNodeGetBeatManifest = (
  params: GetCanvasBeatDirectorManifestParams,
) => Promise<DirectorStageManifest>;

export type UploadNodeCaptureBlobToDataUrl = (blob: Blob) => Promise<string>;

export type UploadNodeReadCaptureSize = (
  dataUrl: string,
) => Promise<{ width: number; height: number }>;

export interface UploadNodeControllerOptions {
  id: string;
  data: UploadImageNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
  projectId: string;
}

export function createUseUploadNodeController({
  useStore,
  useSettingsStore,
  eventPort,
  uploadCanvasAsset,
  prepareNodeImageFromFile,
  uploadLocalImageToBackend,
  getCanvasBeatDirectorManifest,
  directorCaptureBlobToDataUrl,
  readDirectorCaptureImageSize,
}: {
  useStore: UploadNodeStoreHook;
  useSettingsStore: UploadNodeSettingsStoreHook;
  eventPort: UploadNodeEventPort;
  uploadCanvasAsset: UploadNodeUploadCanvasAsset;
  prepareNodeImageFromFile: UploadNodePrepareFile;
  uploadLocalImageToBackend: UploadNodeUploadLocalImage;
  getCanvasBeatDirectorManifest: UploadNodeGetBeatManifest;
  directorCaptureBlobToDataUrl: UploadNodeCaptureBlobToDataUrl;
  readDirectorCaptureImageSize: UploadNodeReadCaptureSize;
}) {
  return function useUploadNodeController({
    id,
    data,
    selected,
    width,
    height,
    projectId,
  }: UploadNodeControllerOptions) {
    const { t } = useTranslation();
    const updateNodeInternals = useUpdateNodeInternals();
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const updateNodeData = useStore((state) => state.updateNodeData);
    const convertNodeType = useStore((state) => state.convertNodeType);
    const addPanoCaptureGroup = useStore(
      (state) => state.addPanoCaptureGroup,
    );
    const connectedEdges = useStore(
      useShallow((state) =>
        state.edges.filter((edge) => edge.source === id || edge.target === id),
      ),
    );
    const useUploadFilenameAsNodeTitle = useSettingsStore(
      (state) => state.useUploadFilenameAsNodeTitle,
    );
    const preferOriginalImage = useReactFlowStore((state) =>
      shouldUseOriginalImageByZoom(state.transform[2]),
    );
    const inputRef = useRef<HTMLInputElement>(null);
    const uploadSequenceRef = useRef(0);
    const captureCanvasNodeBusyRef = useRef(false);
    const uploadPerfRef = useRef<{
      sequence: number;
      name: string;
      size: number;
      startedAt: number;
      transientLoaded: boolean;
      stableLoaded: boolean;
    } | null>(null);
    const [transientPreviewUrl, setTransientPreviewUrl] = useState<string | null>(
      null,
    );
    const [directorStageBusy, setDirectorStageBusy] = useState(false);
    const [directorStageOpen, setDirectorStageOpen] = useState(false);
    const [directorStageManifest, setDirectorStageManifest] =
      useState<DirectorStageManifest | null>(null);

    const imageOnly = Boolean(data.imageOnly);
    const size = useMemo(
      () => resolveUploadNodeLayout(data.aspectRatio, width, height),
      [data.aspectRatio, height, width],
    );
    const title = useMemo(
      () => resolveUploadNodeTitle(data, useUploadFilenameAsNodeTitle),
      [data, useUploadFilenameAsNodeTitle],
    );
    const hasMainlineContext = hasMainlineContexts(
      (data as { mainline_context?: unknown }).mainline_context,
    );
    const candidateBindingRoles = useMemo(
      () =>
        collectCandidateBindingsForNode(connectedEdges, id).map(
          (binding) => binding.role,
        ),
      [connectedEdges, id],
    );
    const directorSource = useMemo(
      () => resolveUploadNodeDirectorSource(data),
      [data],
    );
    const directorControlBundle = useMemo(
      () => directorControlBundleFromData(data.director_control_bundle),
      [data.director_control_bundle],
    );
    const directorInitialScene = useMemo(
      () => sceneSnapshotFromDirectorControlBundle(directorControlBundle),
      [directorControlBundle],
    );
    const directorInitialSourceId = directorInitialScene?.world?.activeSourceId;

    const clearTransientPreview = useCallback(() => {
      setTransientPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
    }, []);

    const processFile = useCallback(
      async (file: File) => {
        if (!projectId) {
          console.error('[upload-node] missing project context');
          return;
        }

        const sequence = uploadSequenceRef.current + 1;
        uploadSequenceRef.current = sequence;
        const started = performance.now();
        clearTransientPreview();
        const optimisticPreviewUrl = URL.createObjectURL(file);
        setTransientPreviewUrl(optimisticPreviewUrl);
        uploadPerfRef.current = {
          sequence,
          name: file.name,
          size: file.size,
          startedAt: started,
          transientLoaded: false,
          stableLoaded: false,
        };
        requestAnimationFrame(() => {
          const perf = uploadPerfRef.current;
          if (!perf || perf.sequence !== sequence) {
            return;
          }
          console.info(
            `[upload-perf][e2e] preview-state-committed nodeId=${id} name="${file.name}" elapsed=${Math.round(performance.now() - started)}ms`,
          );
        });

        updateNodeData(id, { isUploading: true, uploadError: null });

        try {
          const [preparedSettled, uploaded] = await Promise.all([
            prepareNodeImageFromFile(file).catch((error: unknown) => {
              console.warn(
                '[upload-node] local prepare failed, continuing with backend URL only',
                error,
              );
              return null;
            }),
            uploadCanvasAsset(projectId, file, file.name),
          ]);

          if (uploadSequenceRef.current !== sequence) {
            return;
          }

          const nextData: Partial<UploadImageNodeData> = {
            imageUrl: uploaded.url,
            previewImageUrl: uploaded.url,
            aspectRatio: preparedSettled?.aspectRatio || '1:1',
            sourceFileName: file.name,
            isUploading: false,
            uploadError: null,
          };
          if (useUploadFilenameAsNodeTitle) {
            nextData.displayName = file.name;
          }
          updateNodeData(id, nextData);

          console.info(
            `[upload-perf][node] processFile success nodeId=${id} name="${file.name}" size=${file.size}B backendUrl=${uploaded.url} elapsed=${Math.round(performance.now() - started)}ms`,
          );
        } catch (error) {
          if (uploadSequenceRef.current === sequence) {
            clearTransientPreview();
            const message = error instanceof Error ? error.message : String(error);
            updateNodeData(id, { isUploading: false, uploadError: message });
          }
          console.error(
            `[upload-perf][node] processFile failed nodeId=${id} name="${file.name}" size=${file.size}B elapsed=${Math.round(performance.now() - started)}ms`,
            error,
          );
        }
      },
      [
        clearTransientPreview,
        id,
        projectId,
        updateNodeData,
        useUploadFilenameAsNodeTitle,
      ],
    );

    const imageLoad = useCallback(
      (event: SyntheticEvent<HTMLImageElement>) => {
        const perf = uploadPerfRef.current;
        if (!perf) {
          return;
        }

        const displayedSrc =
          event.currentTarget.currentSrc || event.currentTarget.src || '';
        const isTransient = displayedSrc.startsWith('blob:');
        const now = performance.now();

        if (isTransient && !perf.transientLoaded) {
          perf.transientLoaded = true;
          console.info(
            `[upload-perf][e2e] first-visible transient nodeId=${id} name="${perf.name}" size=${perf.size}B elapsed=${Math.round(now - perf.startedAt)}ms`,
          );
          requestAnimationFrame(() => {
            const nextPerf = uploadPerfRef.current;
            if (!nextPerf || nextPerf.sequence !== perf.sequence) {
              return;
            }
            console.info(
              `[upload-perf][e2e] first-painted transient nodeId=${id} name="${nextPerf.name}" elapsed=${Math.round(performance.now() - nextPerf.startedAt)}ms`,
            );
          });
          return;
        }

        if (!isTransient && !perf.stableLoaded) {
          perf.stableLoaded = true;
          console.info(
            `[upload-perf][e2e] stable-visible nodeId=${id} name="${perf.name}" size=${perf.size}B elapsed=${Math.round(now - perf.startedAt)}ms`,
          );
          if (uploadSequenceRef.current === perf.sequence) {
            clearTransientPreview();
          }
          requestAnimationFrame(() => {
            const nextPerf = uploadPerfRef.current;
            if (!nextPerf || nextPerf.sequence !== perf.sequence) {
              return;
            }
            console.info(
              `[upload-perf][e2e] stable-painted nodeId=${id} name="${nextPerf.name}" elapsed=${Math.round(performance.now() - nextPerf.startedAt)}ms`,
            );
          });
        }
      },
      [clearTransientPreview, id],
    );

    const morphToVideoWithFile = useCallback(
      (file: File) => {
        const converted = convertNodeType(id, CANVAS_NODE_TYPES.video, {
          referenceOnly: true,
          sourceFileName: file.name,
        });
        if (!converted) return;
        requestAnimationFrame(() => {
          eventPort.publish('video-node/external-file', {
            nodeId: id,
            file,
          });
        });
      },
      [convertNodeType, id],
    );

    const morphToAudioWithFile = useCallback(
      (file: File) => {
        const converted = convertNodeType(id, CANVAS_NODE_TYPES.audio, {
          sourceFileName: file.name,
        });
        if (!converted) return;
        requestAnimationFrame(() => {
          eventPort.publish('audio-node/external-file', {
            nodeId: id,
            file,
          });
        });
      },
      [convertNodeType, id],
    );

    const handleMediaFile = useCallback(
      async (file: File) => {
        const mediaKind = resolveUploadMediaKind(file);
        if (mediaKind === 'video') {
          if (imageOnly) {
            console.warn('[upload-node] image-only node: dropped video ignored');
            return;
          }
          morphToVideoWithFile(file);
          return;
        }
        if (mediaKind === 'audio') {
          if (imageOnly) {
            console.warn('[upload-node] image-only node: dropped audio ignored');
            return;
          }
          morphToAudioWithFile(file);
          return;
        }
        if (mediaKind === 'image') {
          await processFile(file);
        }
      },
      [imageOnly, morphToAudioWithFile, morphToVideoWithFile, processFile],
    );

    const drop = useCallback(
      async (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const file = resolveDroppedMediaFile(event.dataTransfer);
        if (!file) return;
        await handleMediaFile(file);
      },
      [handleMediaFile],
    );

    const dragOver = useCallback((event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
    }, []);

    const changeFile = useCallback(
      async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await handleMediaFile(file);
        event.target.value = '';
      },
      [handleMediaFile],
    );

    useEffect(() =>
      eventPort.subscribe('upload-node/reupload', ({ nodeId }) => {
        if (nodeId === id) {
          inputRef.current?.click();
        }
      }),
    [id]);

    useEffect(() =>
      eventPort.subscribe('upload-node/paste-image', ({ nodeId, file }) => {
        if (nodeId === id && file && file.type.startsWith('image/')) {
          void processFile(file);
        }
      }),
    [id, processFile]);

    useEffect(() =>
      eventPort.subscribe('upload-node/external-file', ({ nodeId, file }) => {
        if (nodeId === id && file) {
          void handleMediaFile(file);
        }
      }),
    [handleMediaFile, id]);

    const select = useCallback(() => {
      setSelectedNode(id);
    }, [id, setSelectedNode]);

    const rename = useCallback(
      (displayName: string) => {
        updateNodeData(id, { displayName });
      },
      [id, updateNodeData],
    );

    const pickFile = useCallback(() => {
      inputRef.current?.click();
    }, []);

    const openDirectorStage = useCallback(async () => {
      if (!directorSource.canOpenDirectorStage) return;
      if (
        !projectId ||
        directorSource.episode === null ||
        directorSource.beat === null
      ) {
        return;
      }
      setDirectorStageBusy(true);
      try {
        const manifest = await getCanvasBeatDirectorManifest({
          projectId,
          episode: directorSource.episode,
          beat: directorSource.beat,
        });
        const directorControlBundleSourceId =
          resolveDirectorControlBundleSourceId(directorControlBundle);
        const allowedDestinations = manifest.allowed_destinations.includes(
          'canvas_screenshot_node',
        )
          ? manifest.allowed_destinations
          : [
              ...manifest.allowed_destinations,
              'canvas_screenshot_node' as const,
            ];
        setDirectorStageManifest(
          directorControlBundleSourceId
            ? {
                ...manifest,
                allowed_destinations: allowedDestinations,
                active_source_id: directorControlBundleSourceId,
              }
            : { ...manifest, allowed_destinations: allowedDestinations },
        );
        setDirectorStageOpen(true);
      } catch (error) {
        console.error('[upload-node] director world manifest failed', error);
      } finally {
        setDirectorStageBusy(false);
      }
    }, [directorControlBundle, directorSource, projectId]);

    const submitDirectorCombined = useCallback(
      async (_blob: Blob, meta: ThreeDDirectorCaptureMeta) => {
        if (!meta.captureBundle) {
          throw new Error('导演合成图缺少 combined/env_only/frame_meta');
        }
        if (!projectId) {
          throw new Error('缺少项目，无法保存画布导演合成图');
        }
        const bundle = await uploadDirectorCaptureBundle(
          projectId,
          id,
          meta.captureBundle,
          uploadCanvasAsset,
        );
        const imageUrl = bundle.urls?.combined ?? '';
        if (!imageUrl) throw new Error('画布导演合成图缺少图片地址');
        updateNodeData(id, {
          imageUrl,
          previewImageUrl: withImageCacheBust(imageUrl, Date.now()),
          director_control_bundle: bundle,
          slot_target: {
            kind: 'director_render',
            episode: directorSource.episode,
            beat: directorSource.beat,
          },
          uploadError: null,
        });
      },
      [
        directorSource.beat,
        directorSource.episode,
        id,
        projectId,
        updateNodeData,
      ],
    );

    const captureDirectorCanvasNode = useCallback(
      async (blob: Blob, meta: ThreeDDirectorCaptureMeta) => {
        if (captureCanvasNodeBusyRef.current) return;
        captureCanvasNodeBusyRef.current = true;
        try {
          if (projectId && meta.captureBundle) {
            const bundle = await uploadDirectorCaptureBundle(
              projectId,
              id,
              meta.captureBundle,
              uploadCanvasAsset,
            );
            const [combinedDataUrl, envOnlyDataUrl] = await Promise.all([
              directorCaptureBlobToDataUrl(meta.captureBundle.combined),
              directorCaptureBlobToDataUrl(meta.captureBundle.env_only),
            ]);
            const [combinedSize, envOnlySize] = await Promise.all([
              readDirectorCaptureImageSize(combinedDataUrl),
              readDirectorCaptureImageSize(envOnlyDataUrl),
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
                  metadata: {
                    ...baseMetadata,
                    render_mode: 'combined',
                  },
                },
                {
                  dataUrl: envOnlyDataUrl,
                  uploadedUrl: bundle.urls?.env_only ?? '',
                  width: envOnlySize.width,
                  height: envOnlySize.height,
                  label: '纯背景图',
                  metadata: {
                    ...baseMetadata,
                    render_mode: 'env_only',
                  },
                },
              ],
              { cols: 2, groupName: '导演世界输出' },
            );
            updateNodeData(id, {
              uploadError: groupId ? null : '导演世界截图输出到画布失败',
            });
            if (groupId) {
              toast.success(t('viewer.threeD.outputToCanvasNodeSuccess'));
            }
            return;
          }
          const dataUrl = await directorCaptureBlobToDataUrl(blob);
          const size = await readDirectorCaptureImageSize(dataUrl);
          const uploadedUrl = await uploadLocalImageToBackend(
            projectId,
            dataUrl,
            `director-world-${id}-combined-${Date.now()}.png`,
          );
          const groupId = addPanoCaptureGroup(id, [
            {
              dataUrl,
              uploadedUrl,
              width: size.width,
              height: size.height,
              label: '导演世界导出',
              metadata: {
                viewer: 'director_world',
                render_mode: meta.kind,
                source_kind: meta.source.source_kind,
                snapshot: meta.snapshot,
              },
            },
          ]);
          updateNodeData(id, {
            uploadError: groupId ? null : '导演世界截图输出到画布失败',
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

    useEffect(
      () => () => {
        uploadPerfRef.current = null;
        clearTransientPreview();
      },
      [clearTransientPreview],
    );

    const imageSource = useMemo(() => {
      if (transientPreviewUrl) {
        return transientPreviewUrl;
      }
      const picked = preferOriginalImage
        ? data.imageUrl || data.previewImageUrl
        : data.previewImageUrl || data.imageUrl;
      return picked
        ? resolveImageDisplayUrl(withImageCacheBust(picked, data.committed_at))
        : null;
    }, [
      data.committed_at,
      data.imageUrl,
      data.previewImageUrl,
      preferOriginalImage,
      transientPreviewUrl,
    ]);

    const viewerSourceUrl = data.imageUrl
      ? resolveImageDisplayUrl(data.imageUrl)
      : null;

    useEffect(() => {
      updateNodeInternals(id);
    }, [id, size.height, size.width, updateNodeInternals]);

    return {
      id,
      data,
      selected,
      imageOnly,
      size,
      title,
      hasMainlineContext,
      candidateBindingRoles,
      transientPreviewUrl,
      imageSource,
      viewerSourceUrl,
      hasMediaContent: Boolean(data.imageUrl || transientPreviewUrl),
      directorStageBusy,
      directorStageOpen,
      directorStageManifest,
      canOpenDirectorStage: directorSource.canOpenDirectorStage,
      directorInitialScene,
      directorInitialScenesBySourceId:
        directorInitialScene && directorInitialSourceId
          ? { [directorInitialSourceId]: directorInitialScene }
          : null,
      inputRef,
      select,
      rename,
      pickFile,
      drop,
      dragOver,
      changeFile,
      imageLoad,
      openDirectorStage,
      changeDirectorStageOpen: setDirectorStageOpen,
      submitDirectorCombined,
      captureDirectorCanvasNode,
    };
  };
}

export type UploadNodeController = ReturnType<
  ReturnType<typeof createUseUploadNodeController>
>;
