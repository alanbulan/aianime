// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from 'react';

import type { AudioNodeData } from '../domain/canvasNodeData';
import { buildCanvasAudioPrompt } from '../application/generateCanvasAudio';
import {
  joinUpstreamText,
  type UpstreamContent,
} from '../application/graphContentResolver';
import {
  clearGenerationTaskDescriptor,
  generationTaskDescriptor,
} from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import { useNodeGenerationTaskState } from './useNodeGenerationTaskState';

export interface AudioGenerationStore {
  updateNodeData: (
    id: string,
    patch: Partial<AudioNodeData>,
  ) => void;
}

export type AudioGenerationStoreHook = <TSelected>(
  selector: (state: AudioGenerationStore) => TSelected,
) => TSelected;

export type AudioGenerationUpstreamContentsHook = (
  nodeId: string,
) => UpstreamContent[];

export type AudioGenerationGenerate = (
  params:
    | {
        kind: 'music';
        projectId: string;
        prompt: string;
        musicLengthMs?: number;
        forceInstrumental?: boolean;
        respectSectionsDurations?: boolean;
      }
    | {
        kind: 'speech';
        projectId: string;
        prompt: string;
        emotionPrompt?: string;
        voiceRef?: AudioNodeData['voiceRef'];
      },
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<{ audioUrl: string }>;

export interface AudioGenerationOptions {
  projectId: string;
  nodeId: string;
  data: AudioNodeData;
}

export function createUseAudioGeneration({
  useStore,
  useUpstreamContents,
  generateCanvasAudio,
}: {
  useStore: AudioGenerationStoreHook;
  useUpstreamContents: AudioGenerationUpstreamContentsHook;
  generateCanvasAudio: AudioGenerationGenerate;
}) {
  return function useAudioGeneration({
    projectId,
    nodeId,
    data,
  }: AudioGenerationOptions) {
    const updateNodeData = useStore((state) => state.updateNodeData);
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
      updateNodeData(nodeId, {
        isGenerating: true,
        generationStartedAt: Date.now(),
        generationError: null,
      });
      let taskKey: string | null = null;
      try {
        const result = await generateCanvasAudio(
          isMusic
            ? {
                kind: 'music',
                projectId,
                prompt: trimmed,
                musicLengthMs: data.musicLengthMs,
                forceInstrumental: data.forceInstrumental,
                respectSectionsDurations: data.respectSectionsDurations,
              }
            : {
                kind: 'speech',
                projectId,
                prompt: trimmed,
                emotionPrompt: data.emotionPrompt,
                voiceRef: data.voiceRef,
              },
          (task) => {
            taskKey = task.task_key;
            // Persist the task handle so a page refresh can resume this job.
            updateNodeData(nodeId, generationTaskDescriptor(task));
          },
        );
        updateNodeData(nodeId, {
          ...clearGenerationTaskDescriptor(taskKey),
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
          ...clearGenerationTaskDescriptor(taskKey),
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
      effectivePrompt,
      nodeId,
      projectId,
      updateNodeData,
    ]);

    return { generate, isGenerating, effectivePrompt, isMusic };
  };
}
