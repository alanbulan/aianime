// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import { canvasEventBus } from '@/features/canvas/application/canvasServices';
import type { CanvasAudioReference } from '@/features/canvas/application/audioVoiceCatalog';
import { loadCanvasAudioReferences } from '@/features/canvas/audioComposition';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import { uploadCanvasAsset } from '@/features/canvas/composition';
import { isAudioFile } from '@/features/canvas/domain/audioFileTypes';
import {
  CANVAS_NODE_TYPES,
  type AudioNodeData,
  type AudioVoiceRef,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { useIsBoxSelecting } from '@/features/canvas/hooks/useIsBoxSelecting';
import { useNodeGenerationTaskState } from '@/features/canvas/hooks/useNodeGenerationTaskState';
import { useAudioGeneration } from '@/features/canvas/nodes/useAudioGeneration';
import { hasMainlineContexts } from '@/features/freezone/public';
import { readUrl } from '@/lib/url-params';

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

function getCachedAudioReferences(project: string) {
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

function needsDefaultVoice(voiceRef: AudioVoiceRef | null | undefined) {
  return voiceRef == null || (
    voiceRef.scope === 'project_narrator' &&
    !voiceRef.characterName &&
    !voiceRef.identityId &&
    !voiceRef.slot &&
    !voiceRef.voiceId
  );
}

export interface AudioNodeControllerOptions {
  id: string;
  data: AudioNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}

export function useAudioNodeController({
  id,
  data,
  selected,
  width,
  height,
}: AudioNodeControllerOptions) {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const isBoxSelecting = useIsBoxSelecting();
  const { isGenerating, task } = useNodeGenerationTaskState(data);
  const { generate } = useAudioGeneration(id, data);

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
    const projectId = readUrl().project;
    if (!projectId) {
      console.error('[audio-node] no project in URL — cannot upload');
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
  }, [id, t, updateNodeData]);

  useEffect(() => canvasEventBus.subscribe(
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
    const project = readUrl().project;
    if (!project) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const references = await getCachedAudioReferences(project);
        if (cancelled) {
          return;
        }
        const first = references[0];
        if (!first) {
          return;
        }
        const fresh = useCanvasStore.getState().nodes.find(
          (node) => node.id === id,
        );
        if (!fresh) {
          return;
        }
        const freshData = fresh.data as AudioNodeData;
        if (!needsDefaultVoice(freshData.voiceRef)) {
          return;
        }
        const voiceRef: AudioVoiceRef = { ...first.ref };
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
  }, [data.voiceRef, id, updateNodeData]);

  return {
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
}

export type AudioNodeController = ReturnType<typeof useAudioNodeController>;
