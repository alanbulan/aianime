// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { describeAudioVoiceRef } from '@/features/canvas/application/audioVoiceCatalog';
import {
  filterAudioUpstreamTextContents,
  isAudioSubmitDisabled,
  musicBillingSecondsFromMs,
  resolveAudioMusicSettings,
  resolveAudioVoiceSettings,
} from '@/features/canvas/application/audioOperationsPanelModel';
import { deriveAudioText } from '@/features/canvas/application/generateCanvasAudio';
import type { VoicePickResult } from '@/features/canvas/application/voiceSelectionModel';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import { translateCanvasText } from '@/features/canvas/composition';
import type { AudioNodeData } from '@/features/canvas/domain/canvasNodes';
import { useDetachUpstream } from '@/features/canvas/hooks/useDetachUpstream';
import { useUpstreamContents } from '@/features/canvas/hooks/useUpstreamGraph';
import { useAudioGeneration } from '@/features/canvas/nodes/useAudioGeneration';
import { readUrl } from '@/lib/url-params';
import { useGenerationCreditCost } from '@/modules/model_usage/public';

export interface AudioOperationsPanelControllerOptions {
  nodeId: string;
  data: AudioNodeData;
}

export function useAudioOperationsPanelController({
  nodeId,
  data,
}: AudioOperationsPanelControllerOptions) {
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const [isTranslating, setIsTranslating] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showMusicSettings, setShowMusicSettings] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>(
    'idle',
  );
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMusic = data.audioKind === 'music';
  const musicSettings = useMemo(
    () => resolveAudioMusicSettings(data),
    [
      data.forceInstrumental,
      data.musicLengthMs,
      data.respectSectionsDurations,
    ],
  );
  const voiceSettings = useMemo(
    () => resolveAudioVoiceSettings(data),
    [data.voiceLabel, data.voiceLanguage, data.voiceRef],
  );
  const audioCost = useGenerationCreditCost(
    isMusic ? 'freezone_audio_music' : 'beat_tts',
    null,
    isMusic
      ? {
          surface: 'canvas',
          quantity: musicBillingSecondsFromMs(musicSettings.musicLengthMs),
        }
      : {},
  );
  const {
    generate: submit,
    effectivePrompt,
    isGenerating,
  } = useAudioGeneration(nodeId, data);

  const text = useMemo(() => deriveAudioText(data), [data]);
  const emotionPrompt = data.emotionPrompt ?? '';
  const [textDraft, setTextDraft] = useState(text);
  const isComposingTextRef = useRef(false);
  const [emotionDraft, setEmotionDraft] = useState(emotionPrompt);
  const isComposingEmotionRef = useRef(false);

  useEffect(() => {
    if (!isComposingTextRef.current) setTextDraft(text);
  }, [text]);

  useEffect(() => {
    if (!isComposingEmotionRef.current) setEmotionDraft(emotionPrompt);
  }, [emotionPrompt]);

  const upstreamContents = useUpstreamContents(nodeId);
  const upstreamTextContents = useMemo(
    () => filterAudioUpstreamTextContents(upstreamContents),
    [upstreamContents],
  );
  const detachUpstream = useDetachUpstream(nodeId);

  const updateText = useCallback(
    (next: string) => updateNodeData(nodeId, { text: next }),
    [nodeId, updateNodeData],
  );
  const updateEmotion = useCallback(
    (next: string) => updateNodeData(nodeId, { emotionPrompt: next }),
    [nodeId, updateNodeData],
  );

  const changeTextDraft = useCallback(
    (next: string) => {
      setTextDraft(next);
      if (!isComposingTextRef.current) updateText(next);
    },
    [updateText],
  );
  const startTextComposition = useCallback(() => {
    isComposingTextRef.current = true;
  }, []);
  const finishTextComposition = useCallback(
    (next: string) => {
      isComposingTextRef.current = false;
      setTextDraft(next);
      updateText(next);
    },
    [updateText],
  );

  const changeEmotionDraft = useCallback(
    (next: string) => {
      setEmotionDraft(next);
      if (!isComposingEmotionRef.current) updateEmotion(next);
    },
    [updateEmotion],
  );
  const startEmotionComposition = useCallback(() => {
    isComposingEmotionRef.current = true;
  }, []);
  const finishEmotionComposition = useCallback(
    (next: string) => {
      isComposingEmotionRef.current = false;
      setEmotionDraft(next);
      updateEmotion(next);
    },
    [updateEmotion],
  );

  const translate = useCallback(async () => {
    if (isGenerating || isTranslating) return;
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const url = readUrl();
    if (!url.project) {
      console.error('[audio-node] translate: no project in URL');
      return;
    }
    setIsTranslating(true);
    try {
      const result = await translateCanvasText({
        projectId: url.project,
        text: trimmed,
        nodeType: 'audio',
        canvasId: url.canvas ?? 'default',
        nodeId,
      });
      updateText(result.translatedText);
    } catch (error) {
      console.error('[audio-node] translate failed', error);
    } finally {
      setIsTranslating(false);
    }
  }, [isGenerating, isTranslating, nodeId, text, updateText]);

  const clearCopyResetTimer = useCallback(() => {
    if (!copyResetTimerRef.current) return;
    clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = null;
  }, []);

  useEffect(() => clearCopyResetTimer, [clearCopyResetTimer]);

  useEffect(() => {
    if (showVoiceSettings && !isMusic) return;
    setVoiceModalOpen(false);
    setCopyState('idle');
    clearCopyResetTimer();
  }, [clearCopyResetTimer, isMusic, showVoiceSettings]);

  const scheduleCopyStateReset = useCallback(() => {
    clearCopyResetTimer();
    copyResetTimerRef.current = setTimeout(() => {
      setCopyState('idle');
      copyResetTimerRef.current = null;
    }, 1200);
  }, [clearCopyResetTimer]);

  const copyVoiceReference = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setCopyState('error');
      scheduleCopyStateReset();
      return;
    }
    try {
      await navigator.clipboard.writeText(
        describeAudioVoiceRef(voiceSettings.currentRef),
      );
      setCopyState('success');
    } catch {
      setCopyState('error');
    }
    scheduleCopyStateReset();
  }, [scheduleCopyStateReset, voiceSettings.currentRef]);

  const pickVoice = useCallback(
    ({ ref, label, language }: VoicePickResult) => {
      updateNodeData(nodeId, {
        voiceRef: ref,
        voiceLabel: label,
        voiceLanguage: language ?? '',
      });
      setVoiceModalOpen(false);
    },
    [nodeId, updateNodeData],
  );

  const toggleVoiceSettings = useCallback(() => {
    setShowVoiceSettings((current) => !current);
  }, []);
  const toggleMusicSettings = useCallback(() => {
    setShowMusicSettings((current) => !current);
  }, []);

  return {
    nodeId,
    isMusic,
    panelExpanded,
    collapsePanel: () => setPanelExpanded(false),
    togglePanelExpanded: () => setPanelExpanded((current) => !current),
    showVoiceSettings,
    toggleVoiceSettings,
    showMusicSettings,
    toggleMusicSettings,
    isGenerating,
    isTranslating,
    submitDisabled: isAudioSubmitDisabled(isGenerating, effectivePrompt),
    submit,
    translate,
    audioCostDisplay: audioCost.data?.data.display,
    text,
    textDraft,
    changeTextDraft,
    startTextComposition,
    finishTextComposition,
    emotionDraft,
    changeEmotionDraft,
    startEmotionComposition,
    finishEmotionComposition,
    upstreamTextContents,
    detachUpstream,
    musicSettings,
    setMusicLengthMs: (musicLengthMs: number) =>
      updateNodeData(nodeId, { musicLengthMs }),
    setForceInstrumental: (forceInstrumental: boolean) =>
      updateNodeData(nodeId, { forceInstrumental }),
    setRespectSectionsDurations: (respectSectionsDurations: boolean) =>
      updateNodeData(nodeId, { respectSectionsDurations }),
    voiceSettings,
    voiceModalOpen,
    openVoiceModal: () => setVoiceModalOpen(true),
    closeVoiceModal: () => setVoiceModalOpen(false),
    pickVoice,
    copyState,
    copyVoiceReference,
  };
}

export type AudioOperationsPanelController = ReturnType<
  typeof useAudioOperationsPanelController
>;
