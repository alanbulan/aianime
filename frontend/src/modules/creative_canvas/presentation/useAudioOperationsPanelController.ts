// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AudioNodeData } from '../domain/canvasNodeData';
import {
  describeAudioVoiceRef,
} from '../application/audioVoiceCatalog';
import {
  deriveAudioText,
} from '../application/generateCanvasAudio';
import {
  filterAudioUpstreamTextContents,
  isAudioSubmitDisabled,
  musicBillingSecondsFromMs,
  resolveAudioMusicSettings,
  resolveAudioVoiceSettings,
} from '../application/audioOperationsPanelModel';
import type { VoicePickResult } from '../application/voiceSelectionModel';
import type { UpstreamContent } from '../application/graphContentResolver';
import type {
  CanvasTextTranslationNodeType,
} from '../application/translateCanvasText';

import {
  useCommercialModelCatalog,
  useGenerationCreditCost,
  audioModelOptionsForMode,
} from '@/modules/model_usage/public';

export interface AudioOperationsPanelStore {
  updateNodeData: (
    id: string,
    patch: Partial<AudioNodeData>,
  ) => void;
}

export type AudioOperationsPanelStoreHook = <TSelected>(
  selector: (state: AudioOperationsPanelStore) => TSelected,
) => TSelected;

export type AudioOperationsPanelUseGeneration = (options: {
  projectId: string;
  nodeId: string;
  data: AudioNodeData;
}) => {
  generate: () => Promise<void>;
  effectivePrompt: string;
  isGenerating: boolean;
};

export type AudioOperationsPanelUpstreamContentsHook = (
  nodeId: string,
) => readonly UpstreamContent[];

export type AudioOperationsPanelDetachUpstreamHook = (
  targetNodeId: string,
) => (sourceNodeId: string) => void;

export type AudioOperationsPanelTranslateText = (params: {
  projectId: string;
  text: string;
  nodeType: CanvasTextTranslationNodeType;
  canvasId: string;
  nodeId: string;
}) => Promise<{ translatedText: string }>;

export interface AudioOperationsPanelControllerOptions {
  projectId: string;
  canvasId: string;
  nodeId: string;
  data: AudioNodeData;
}

export function createUseAudioOperationsPanelController({
  useStore,
  useAudioGeneration,
  useUpstreamContents,
  useDetachUpstream,
  translateCanvasText,
}: {
  useStore: AudioOperationsPanelStoreHook;
  useAudioGeneration: AudioOperationsPanelUseGeneration;
  useUpstreamContents: AudioOperationsPanelUpstreamContentsHook;
  useDetachUpstream: AudioOperationsPanelDetachUpstreamHook;
  translateCanvasText: AudioOperationsPanelTranslateText;
}) {
  return function useAudioOperationsPanelController({
    projectId,
    canvasId,
    nodeId,
    data,
  }: AudioOperationsPanelControllerOptions) {
    const updateNodeData = useStore((state) => state.updateNodeData);
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
    const modelCatalog = useCommercialModelCatalog('AUDIO');
    const audioModels = useMemo(
      () =>
        audioModelOptionsForMode(
          modelCatalog.data?.items ?? [],
          isMusic ? 'music' : 'speech',
        ),
      [isMusic, modelCatalog.data?.items],
    );
    const storedModel = String(data.model ?? '').trim();
    const selectedModel = audioModels.some((model) => model.value === storedModel)
      ? storedModel
      : (audioModels[0]?.value ?? '');

    useEffect(() => {
      if (!selectedModel || selectedModel === storedModel) return;
      updateNodeData(nodeId, { model: selectedModel });
    }, [nodeId, selectedModel, storedModel, updateNodeData]);
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
      selectedModel || null,
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
    } = useAudioGeneration({ projectId, nodeId, data });

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
      setIsTranslating(true);
      try {
        const result = await translateCanvasText({
          projectId,
          text: trimmed,
          nodeType: 'audio',
          canvasId,
          nodeId,
        });
        updateText(result.translatedText);
      } catch (error) {
        console.error('[audio-node] translate failed', error);
      } finally {
        setIsTranslating(false);
      }
    }, [
      canvasId,
      isGenerating,
      isTranslating,
      nodeId,
      projectId,
      text,
      updateText,
    ]);

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
      projectId,
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
      submitDisabled:
        isAudioSubmitDisabled(isGenerating, effectivePrompt) ||
        modelCatalog.isLoading ||
        !selectedModel ||
        storedModel !== selectedModel,
      submit,
      translate,
      audioCostDisplay: audioCost.data?.data.display,
      audioModels,
      selectedModel,
      modelCatalogLoading: modelCatalog.isLoading,
      modelCatalogError:
        modelCatalog.error instanceof Error ? modelCatalog.error.message : '',
      setSelectedModel: (model: string) =>
        updateNodeData(nodeId, { model }),
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
  };
}

export type AudioOperationsPanelController = ReturnType<
  ReturnType<typeof createUseAudioOperationsPanelController>
>;
