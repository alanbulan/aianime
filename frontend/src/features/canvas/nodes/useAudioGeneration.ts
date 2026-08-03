// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from 'react';

import type { AudioNodeData } from '@/features/canvas/domain/canvasNodes';
import { joinUpstreamText } from '@/features/canvas/application/graphContentResolver';
import { generationTaskDescriptor } from '@/features/canvas/application/resumeGeneration';
import { useUpstreamContents } from '@/features/canvas/hooks/useUpstreamGraph';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  buildCanvasAudioPrompt,
  generateCanvasAudio,
  useNodeGenerationTaskState,
} from '@/modules/creative_canvas/public';

export interface AudioGenerationOptions {
  projectId: string;
  nodeId: string;
  data: AudioNodeData;
}

/**
 * 音频节点的生成逻辑——提交按钮（面板）和失败重试（节点本体）共用。
 * 把生成放进 hook 而非面板组件，是因为面板只在节点被选中时渲染；节点本体需要
 * 在未选中时也能触发重试，且失败信息持久化在节点数据里跨虚拟化重挂存活。
 */
export function useAudioGeneration({
  projectId,
  nodeId,
  data,
}: AudioGenerationOptions) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const { isGenerating } = useNodeGenerationTaskState(data);
  const upstreamContents = useUpstreamContents(nodeId);
  const upstreamTextJoined = useMemo(
    () => joinUpstreamText(upstreamContents),
    [upstreamContents],
  );
  const isMusic = data.audioKind === 'music';
  // 有效 prompt：上游引用的文本不回显进输入框，仅在提交时与本地输入「拼接」成最终
  // prompt（上游在前、本地在后，与 joinUpstreamText 一致用空行分隔，过滤空段）。
  const effectivePrompt = buildCanvasAudioPrompt(data, upstreamTextJoined);

  const generate = useCallback(async () => {
    if (isGenerating) return;
    const trimmed = effectivePrompt;
    if (trimmed.length === 0) return;
    const model = String(data.model ?? '').trim();
    if (!model) {
      updateNodeData(nodeId, { generationError: '请选择可用的音频模型' });
      return;
    }
    updateNodeData(nodeId, {
      isGenerating: true,
      generationStartedAt: Date.now(),
      generationError: null,
    });
    try {
      const result = await generateCanvasAudio(
        isMusic
          ? {
              kind: 'music',
              model,
              projectId,
              prompt: trimmed,
              musicLengthMs: data.musicLengthMs,
              forceInstrumental: data.forceInstrumental,
              respectSectionsDurations: data.respectSectionsDurations,
            }
          : {
              kind: 'speech',
              model,
              projectId,
              prompt: trimmed,
              emotionPrompt: data.emotionPrompt,
              voiceRef: data.voiceRef,
            },
        (task) => {
          // Persist the task handle so a page refresh can resume this job.
          updateNodeData(nodeId, generationTaskDescriptor(task));
        },
      );
      updateNodeData(nodeId, {
        isGenerating: false,
        audioUrl: result.audioUrl,
        durationMs: null,
        generationError: null,
      });
    } catch (error) {
      console.error(
        `[audio-node] ${isMusic ? 'music' : 'speech'} generation failed`,
        error,
      );
      updateNodeData(nodeId, {
        isGenerating: false,
        generationError: error instanceof Error ? error.message : '生成失败',
      });
    }
  }, [
    isGenerating,
    isMusic,
    data.musicLengthMs,
    data.forceInstrumental,
    data.respectSectionsDurations,
    data.voiceRef,
    data.emotionPrompt,
    data.model,
    effectivePrompt,
    nodeId,
    projectId,
    updateNodeData,
  ]);

  return { generate, isGenerating, effectivePrompt, isMusic };
}
