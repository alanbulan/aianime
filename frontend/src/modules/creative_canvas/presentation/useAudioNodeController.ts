// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import type {
  AudioNodeData,
  CanvasNode,
  CanvasNodeData,
} from '../domain/canvasNodeData';
import { isAudioFile } from '../domain/audioFileTypes';
import type { CanvasAudioReference } from '../application/audioVoiceCatalog';
import { resolveImageDisplayUrl } from '../domain/imageData';
import { hasMainlineContexts } from '../domain/mainlineContext';
import { resolveNodeDisplayName } from '../domain/nodeDisplay';
import { useNodeGenerationTaskState } from './useNodeGenerationTaskState';

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 210;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 190;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 360;

// 同一项目的所有音频节点共享进行中的请求；失败后清除，允许下次挂载重试。
const audioReferencesPromiseCache = new Map<
  string,
  Promise<CanvasAudioReference[]>
>();

function getCachedAudioReferences(
  project: string,
  loadCanvasAudioReferences: (projectId: string) => Promise<CanvasAudioReference[]>,
) {
  let request = audioReferencesPromiseCache.get(project);
  if (!request) {
    request = loadCanvasAudioReferences(project).catch((error) => {
      audioReferencesPromiseCache.delete(project);
      throw error;
    });
    audioReferencesPromiseCache.set(project, request);
  }
  return request;
}

function needsDefaultVoice(
  voiceRef: AudioNodeData['voiceRef'],
) {
  return voiceRef == null || (
    voiceRef.scope === 'project_narrator' &&
    !voiceRef.characterName &&
    !voiceRef.identityId &&
    !voiceRef.slot &&
    !voiceRef.voiceId
  );
}

export interface AudioNodeStore {
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  nodes: readonly CanvasNode[];
}

export type AudioNodeStoreHook = {
  <TSelected>(selector: (state: AudioNodeStore) => TSelected): TSelected;
  getState: () => AudioNodeStore;
};

export type AudioNodeIsBoxSelecting = () => boolean;

export type AudioNodeUploadCanvasAsset = (
  projectId: string,
  file: File | Blob,
  filename: string,
) => Promise<{ url: string }>;

export interface AudioNodeEventPort {
  subscribe: (
    event: 'audio-node/external-file',
    handler: (payload: { nodeId: string; file: File }) => void,
  ) => () => void;
}

export type AudioNodeUseGeneration = (options: {
  projectId: string;
  nodeId: string;
  data: AudioNodeData;
}) => { generate: () => Promise<void> };

export type AudioNodeLoadReferences = (
  projectId: string,
) => Promise<CanvasAudioReference[]>;

export interface AudioNodeControllerOptions {
  projectId: string;
  canvasId: string;
  id: string;
  data: AudioNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}

export function createUseAudioNodeController({
  useStore,
  useIsBoxSelecting,
  uploadCanvasAsset,
  eventPort,
  useAudioGeneration,
  loadCanvasAudioReferences,
}: {
  useStore: AudioNodeStoreHook;
  useIsBoxSelecting: AudioNodeIsBoxSelecting;
  uploadCanvasAsset: AudioNodeUploadCanvasAsset;
  eventPort: AudioNodeEventPort;
  useAudioGeneration: AudioNodeUseGeneration;
  loadCanvasAudioReferences: AudioNodeLoadReferences;
}) {
  return function useAudioNodeController({
    projectId,
    canvasId,
    id,
    data,
    selected,
    width,
    height,
  }: AudioNodeControllerOptions) {
    const { t } = useTranslation();
    const updateNodeInternals = useUpdateNodeInternals();
    const setSelectedNode = useStore((state) => state.setSelectedNode);
    const updateNodeData = useStore((state) => state.updateNodeData);
    const isBoxSelecting = useIsBoxSelecting();
    const {
      isGenerating,
      progress: generationProgress,
      task,
    } = useNodeGenerationTaskState(data);
    const { generate } = useAudioGeneration({ projectId, nodeId: id, data });

    // 即使原页面已销毁，也把任务中心收到的失败状态持久化回节点。
    useEffect(() => {
      if (
        task?.status === 'failed' &&
        task.error &&
        (data.generationError !== task.error || data.isGenerating)
      ) {
        updateNodeData(id, {
          generationError: task.error,
          isGenerating: false,
        });
      }
    }, [task, data.generationError, data.isGenerating, id, updateNodeData]);

    const generationError =
      typeof data.generationError === 'string' ? data.generationError.trim() : '';
    const hasGenerationError =
      !isGenerating && !data.audioUrl && generationError.length > 0;
    const title = useMemo(
      () => resolveNodeDisplayName(CANVAS_NODE_TYPES.audio, data),
      [data],
    );
    const resolvedWidth = Math.max(
      MIN_WIDTH,
      Math.round(width ?? DEFAULT_WIDTH),
    );
    const resolvedHeight = Math.max(
      MIN_HEIGHT,
      Math.round(height ?? DEFAULT_HEIGHT),
    );
    const audioSource = useMemo(
      () => data.audioUrl ? resolveImageDisplayUrl(data.audioUrl) : null,
      [data.audioUrl],
    );
    const contexts = (data as { mainline_context?: unknown }).mainline_context;
    const hasMainlineContext = hasMainlineContexts(contexts);

    const processFile = useCallback(async (file: File) => {
      if (!isAudioFile(file)) {
        toast.error(t('node.audio.uploadTypeError'));
        return;
      }
      updateNodeData(id, { isUploading: true });
      try {
        const uploaded = await uploadCanvasAsset(projectId, file, file.name);
        updateNodeData(id, {
          audioUrl: uploaded.url,
          sourceFileName: file.name,
          durationMs: null,
          isUploading: false,
        });
      } catch (error) {
        console.error('[audio-node] upload failed', error);
        updateNodeData(id, { isUploading: false });
      }
    }, [id, projectId, t, updateNodeData]);

    useEffect(() => eventPort.subscribe(
      'audio-node/external-file',
      ({ nodeId, file }) => {
        if (nodeId === id) {
          void processFile(file);
        }
      },
    ), [id, processFile]);

    useEffect(() => {
      updateNodeInternals(id);
    }, [id, resolvedHeight, resolvedWidth, updateNodeInternals]);

    useEffect(() => {
      if (!needsDefaultVoice(data.voiceRef)) {
        return;
      }
      let cancelled = false;
      void (async () => {
        try {
          const references = await getCachedAudioReferences(
            projectId,
            loadCanvasAudioReferences,
          );
          if (cancelled) {
            return;
          }
          const first = references[0];
          if (!first) {
            return;
          }
          const fresh = useStore.getState().nodes.find(
            (node) => node.id === id,
          );
          if (!fresh) {
            return;
          }
          const freshData = fresh.data as AudioNodeData;
          if (!needsDefaultVoice(freshData.voiceRef)) {
            return;
          }
          const voiceRef = { ...first.ref };
          const voiceLabel = first.label ?? '';
          const voiceLanguage = first.language ?? '';
          const current = freshData.voiceRef;
          // 首条本身是裸 narrator 时避免重复写入新对象造成渲染循环。
          if (
            current != null &&
            current.scope === voiceRef.scope &&
            current.characterName === voiceRef.characterName &&
            current.identityId === voiceRef.identityId &&
            current.slot === voiceRef.slot &&
            current.voiceId === voiceRef.voiceId &&
            freshData.voiceLabel === voiceLabel &&
            freshData.voiceLanguage === voiceLanguage
          ) {
            return;
          }
          updateNodeData(id, {
            voiceRef,
            voiceLabel,
            voiceLanguage,
          });
        } catch (error) {
          console.warn('[audio-node] init default voice failed', error);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [data.voiceRef, id, projectId, updateNodeData]);

    return {
      projectId,
      canvasId,
      id,
      data,
      selected,
      title,
      size: {
        width: resolvedWidth,
        height: resolvedHeight,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        maxWidth: MAX_WIDTH,
        maxHeight: MAX_HEIGHT,
      },
      contexts,
      hasMainlineContext,
      audioSource,
      isGenerating,
      generationProgress,
      generationError,
      hasGenerationError,
      showOperationsPanel:
        Boolean(selected) && !isBoxSelecting && !data.audioUrl,
      select: () => setSelectedNode(id),
      rename: (displayName: string) => updateNodeData(id, { displayName }),
      retry: generate,
      updateDuration: (durationMs: number) => {
        if (data.durationMs !== durationMs) {
          updateNodeData(id, { durationMs });
        }
      },
    };
  };
}

export type AudioNodeController = ReturnType<
  ReturnType<typeof createUseAudioNodeController>
>;
