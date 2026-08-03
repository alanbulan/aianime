// Copyright (c) 2026 AI anime
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import {
  buildImageEditGenerationPrompt,
  buildImageEditResultNodeTitle,
  collectImageEditInputSlotTarget,
  collectImageEditInputSourceMeta,
  mergeImageEditCandidateSourceMeta,
  mergeImageEditReferenceUrls,
  planImageEditAssetReferences,
  projectImageEditGenerationModeChoices,
  resolveImageEditGenerationMode,
  resolveImageEditNodeSize,
  type ImageEditAspectRatioChoice,
} from '@/features/canvas/application/imageEditNodeModel';
import { resolveErrorContent } from '@/features/canvas/application/errorDialog';
import {
  buildGenerationErrorReport,
  createReferenceImagePlaceholders,
  resolveGenerationErrorDiagnostics,
  type GenerationDebugContext,
} from '@/features/canvas/application/generationErrorReport';
import {
  collectUpstreamReferenceUrls,
  joinUpstreamText,
} from '@/features/canvas/application/graphContentResolver';
import {
  CANVAS_NODE_TYPES,
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  type ImageEditNodeData,
  type ImageSize,
} from '@/features/canvas/domain/canvasNodes';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  CURRENT_RUNTIME_SESSION_ID,
  canvasAiGateway,
  detectAspectRatio,
  getRuntimeDiagnostics,
  showErrorDialog,
} from '@/features/canvas/composition';
import { useDetachUpstream } from '@/features/canvas/hooks/useDetachUpstream';
import { useReferenceMentionSync } from '@/features/canvas/nodes/useReferenceMentionSync';
import {
  useUpstreamContents,
  useUpstreamImages,
} from '@/features/canvas/hooks/useUpstreamGraph';
import {
  imageModelDefinitions,
  resolveImageModelResolution,
  resolveImageModelResolutions,
  selectImageModel,
} from '@/features/canvas/models';
import { resolveModelPriceDisplay } from '@/features/canvas/pricing';
import {
  AUTO_REQUEST_ASPECT_RATIO,
  IMAGE_EDIT_PICKER_FALLBACK_ANCHOR,
  coercePushTarget,
  defaultCapabilityParams,
  findReferenceTokenAtSelection,
  getCapability,
  insertReferenceToken,
  listCapabilities,
  parseAspectRatio,
  removeTextRange,
  replaceReferenceToken,
  resolveImageEditPickerAnchor,
  resolveReferenceAwareDeleteRange,
  useCanvasImageModels,
  type CanvasAssetLibrarySelection,
  type GenerationCapability,
  type ImageEditPickerAnchor,
  pickClosestAspectRatio,
  resolveImageDisplayUrl,
} from '@/modules/creative_canvas/public';
import { backendErrorToastMessage } from '@/shared/api/errors';
import { useSettingsStore } from '@/stores/settingsStore';

export interface ImageEditNodeControllerOptions {
  projectId: string;
  canvasId: string;
  id: string;
  data: ImageEditNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}

export function useImageEditNodeController({
  projectId,
  canvasId,
  id,
  data,
  selected,
  width,
  height,
}: ImageEditNodeControllerOptions) {
  const { t, i18n } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addNode = useCanvasStore((state) => state.addNode);
  const findNodePosition = useCanvasStore((state) => state.findNodePosition);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const showNodePrice = useSettingsStore((state) => state.showNodePrice);
  const priceDisplayCurrencyMode = useSettingsStore(
    (state) => state.priceDisplayCurrencyMode,
  );
  const usdToCnyRate = useSettingsStore((state) => state.usdToCnyRate);
  const preferDiscountedPrice = useSettingsStore(
    (state) => state.preferDiscountedPrice,
  );
  const grsaiCreditTierId = useSettingsStore(
    (state) => state.grsaiCreditTierId,
  );

  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const promptHighlightRef = useRef<HTMLDivElement>(null);
  const [promptDraft, setPromptDraft] = useState(() => data.prompt ?? '');
  const promptDraftRef = useRef(promptDraft);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [pickerCursor, setPickerCursor] = useState<number | null>(null);
  const [pickerActiveIndex, setPickerActiveIndex] = useState(0);
  const [pickerAnchor, setPickerAnchor] = useState<ImageEditPickerAnchor>(
    IMAGE_EDIT_PICKER_FALLBACK_ANCHOR,
  );
  const [replaceTokenRange, setReplaceTokenRange] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);

  const incomingImages = useUpstreamImages(id);
  const upstreamContents = useUpstreamContents(id);
  const upstreamTextContents = useMemo(
    () =>
      upstreamContents.filter(
        (content) =>
          typeof content.text === 'string' && content.text.trim().length > 0,
      ),
    [upstreamContents],
  );
  const upstreamTextJoined = useMemo(
    () => joinUpstreamText(upstreamContents),
    [upstreamContents],
  );
  const upstreamReferenceUrls = useMemo(
    () => collectUpstreamReferenceUrls(upstreamContents),
    [upstreamContents],
  );
  const imageUrlToNodeId = useMemo(() => {
    const map = new Map<string, string>();
    upstreamContents.forEach((content) => {
      [content.imageUrl, content.videoUrl].forEach((url) => {
        if (typeof url === 'string' && url && !map.has(url)) {
          map.set(url, content.nodeId);
        }
      });
    });
    return map;
  }, [upstreamContents]);
  const detachUpstream = useDetachUpstream(id);
  const incomingImageItems = useMemo(
    () =>
      incomingImages.map((imageUrl, index) => {
        const displayUrl = resolveImageDisplayUrl(imageUrl);
        return {
          imageUrl,
          displayUrl,
          viewerUrl: displayUrl,
          label: `图${index + 1}`,
          sourceNodeId: imageUrlToNodeId.get(imageUrl),
        };
      }),
    [imageUrlToNodeId, incomingImages],
  );
  const incomingImageViewerList = useMemo(
    () => incomingImageItems.map((item) => item.viewerUrl),
    [incomingImageItems],
  );

  const { models: catalogImageModels } = useCanvasImageModels(projectId, 'edit');
  const imageModels = useMemo(
    () => imageModelDefinitions(catalogImageModels, 'edit'),
    [catalogImageModels],
  );
  const selectedModel = useMemo(
    () => selectImageModel(imageModels, data.model),
    [data.model, imageModels],
  );
  const effectiveExtraParams = useMemo(
    () => ({ ...(data.extraParams ?? {}) }),
    [data.extraParams],
  );
  const resolutionOptions = useMemo(
    () => selectedModel
      ? resolveImageModelResolutions(selectedModel, {
          extraParams: effectiveExtraParams,
        })
      : [],
    [effectiveExtraParams, selectedModel],
  );
  const selectedResolution = useMemo(
    () => selectedModel
      ? resolveImageModelResolution(selectedModel, data.size, {
          extraParams: effectiveExtraParams,
        })
      : { value: data.size || '2K', label: data.size || '2K' },
    [data.size, effectiveExtraParams, selectedModel],
  );
  const aspectRatioOptions = useMemo<ImageEditAspectRatioChoice[]>(
    () => [
      {
        value: AUTO_REQUEST_ASPECT_RATIO,
        label: t('modelParams.autoAspectRatio'),
      },
      ...(selectedModel?.aspectRatios ?? []),
    ],
    [selectedModel, t],
  );
  const selectedAspectRatio = useMemo(
    () =>
      aspectRatioOptions.find(
        (item) => item.value === data.requestAspectRatio,
      ) ?? aspectRatioOptions[0],
    [aspectRatioOptions, data.requestAspectRatio],
  );
  const requestResolution = selectedModel?.resolveRequest({
    referenceImageCount: incomingImages.length,
  }) ?? { requestModel: '', modeLabel: '' };
  const resolvedPriceDisplay = useMemo(
    () =>
      showNodePrice && selectedModel
        ? resolveModelPriceDisplay(selectedModel, {
            resolution: selectedResolution.value,
            extraParams: effectiveExtraParams,
            language: i18n.language,
            settings: {
              displayCurrencyMode: priceDisplayCurrencyMode,
              usdToCnyRate,
              preferDiscountedPrice,
              grsaiCreditTierId,
            },
          })
        : null,
    [
      effectiveExtraParams,
      grsaiCreditTierId,
      i18n.language,
      preferDiscountedPrice,
      priceDisplayCurrencyMode,
      selectedModel,
      selectedResolution.value,
      showNodePrice,
      usdToCnyRate,
    ],
  );
  const resolvedPriceTooltip = useMemo(() => {
    if (!resolvedPriceDisplay) return undefined;
    const lines = [resolvedPriceDisplay.label];
    if (resolvedPriceDisplay.nativeLabel) {
      lines.push(
        t('pricing.nativePrice', {
          value: resolvedPriceDisplay.nativeLabel,
        }),
      );
    }
    if (resolvedPriceDisplay.originalLabel) {
      lines.push(
        t('pricing.originalPrice', {
          value: resolvedPriceDisplay.originalLabel,
        }),
      );
    }
    if (resolvedPriceDisplay.pointsCost) {
      lines.push(
        t('pricing.pointsCost', { count: resolvedPriceDisplay.pointsCost }),
      );
    }
    if (resolvedPriceDisplay.grsaiCreditTier) {
      lines.push(
        t('pricing.grsaiTier', {
          price: resolvedPriceDisplay.grsaiCreditTier.priceCny.toFixed(2),
          credits: resolvedPriceDisplay.grsaiCreditTier.credits.toLocaleString(
            i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US',
          ),
        }),
      );
    }
    return lines.join('\n');
  }, [i18n.language, resolvedPriceDisplay, t]);
  const supportedAspectRatioValues = useMemo(
    () => (selectedModel?.aspectRatios ?? []).map((item) => item.value),
    [selectedModel],
  );
  const title = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.imageEdit, data),
    [data],
  );
  const capability = useMemo(
    () => getCapability(data.capabilityId),
    [data.capabilityId],
  );
  const structuredCapabilities = useMemo(() => listCapabilities(), []);
  const generationMode = resolveImageEditGenerationMode(
    data.generationMode,
    incomingImages.length,
  );
  const generationModeChoices = useMemo(
    () => projectImageEditGenerationModeChoices(incomingImages.length),
    [incomingImages.length],
  );
  const size = resolveImageEditNodeSize(width, height);
  const assetLibraryProject = projectId;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, size.height, size.width, updateNodeInternals]);

  useEffect(() => {
    const externalPrompt = data.prompt ?? '';
    if (externalPrompt !== promptDraftRef.current) {
      promptDraftRef.current = externalPrompt;
      setPromptDraft(externalPrompt);
    }
  }, [data.prompt]);

  const commitPromptDraft = useCallback(
    (nextPrompt: string) => {
      promptDraftRef.current = nextPrompt;
      updateNodeData(id, { prompt: nextPrompt });
    },
    [id, updateNodeData],
  );
  const applyPromptRemap = useCallback(
    (nextPrompt: string) => {
      setPromptDraft(nextPrompt);
      commitPromptDraft(nextPrompt);
    },
    [commitPromptDraft],
  );
  useReferenceMentionSync(
    promptDraft,
    [{ prefix: '图', ids: incomingImages }],
    applyPromptRemap,
  );

  useEffect(() => {
    if (!selectedModel) return;
    if (data.model !== selectedModel.id) {
      updateNodeData(id, { model: selectedModel.id });
    }
    if (data.size !== selectedResolution.value) {
      updateNodeData(id, { size: selectedResolution.value as ImageSize });
    }
    if (data.requestAspectRatio !== selectedAspectRatio.value) {
      updateNodeData(id, { requestAspectRatio: selectedAspectRatio.value });
    }
  }, [
    data.model,
    data.requestAspectRatio,
    data.size,
    id,
    selectedAspectRatio.value,
    selectedModel,
    selectedResolution.value,
    updateNodeData,
  ]);

  useEffect(() => {
    if (incomingImages.length === 0) {
      setShowImagePicker(false);
      setPickerCursor(null);
      setPickerActiveIndex(0);
      return;
    }
    setPickerActiveIndex((previous) =>
      Math.min(previous, incomingImages.length - 1),
    );
  }, [incomingImages.length]);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as globalThis.Node)) return;
      setShowImagePicker(false);
      setPickerCursor(null);
      setReplaceTokenRange(null);
    };
    document.addEventListener('mousedown', handleOutside, true);
    return () => document.removeEventListener('mousedown', handleOutside, true);
  }, []);

  const generate = useCallback(async () => {
    if (!selectedModel || !requestResolution.requestModel) {
      const errorMessage = t('modelPicker.empty');
      setError(errorMessage);
      void showErrorDialog(errorMessage, t('common.error'));
      return;
    }
    const prompt = buildImageEditGenerationPrompt(
      promptDraft,
      upstreamTextJoined,
    );
    if (!prompt && !capability) {
      const errorMessage = t('node.imageEdit.promptRequired');
      setError(errorMessage);
      void showErrorDialog(errorMessage, t('common.error'));
      return;
    }

    const generationDurationMs = selectedModel.expectedDurationMs ?? 60000;
    const generationStartedAt = Date.now();
    const resultNodeTitle = capability
      ? `${capability.shortName} · 候选`
      : buildImageEditResultNodeTitle(
          prompt,
          t('node.imageEdit.resultTitle'),
        );
    const runtimeDiagnostics = await getRuntimeDiagnostics();
    const { nodes: currentNodes, edges: currentEdges } =
      useCanvasStore.getState();
    const originSource = collectImageEditInputSourceMeta(
      id,
      currentNodes,
      currentEdges,
    );
    const originSlotTarget = collectImageEditInputSlotTarget(
      id,
      currentNodes,
      currentEdges,
    );
    const candidateSource = mergeImageEditCandidateSourceMeta(
      originSource,
      capability,
      data.capabilityDefaultPushTarget,
      data.capabilityOutputKind,
    );
    const candidateSlotTarget =
      coercePushTarget(data.capabilityDefaultPushTarget) ?? originSlotTarget;
    setError(null);

    const newNodePosition = findNodePosition(
      id,
      EXPORT_RESULT_NODE_DEFAULT_WIDTH,
      EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
    );
    const newNodeId = addNode(
      CANVAS_NODE_TYPES.exportImage,
      newNodePosition,
      {
        isGenerating: true,
        generationStartedAt,
        generationDurationMs,
        resultKind: 'generic',
        displayName: resultNodeTitle,
        __freezone_source: candidateSource,
        ...(candidateSlotTarget ? { slot_target: candidateSlotTarget } : {}),
      },
    );
    addEdge(id, newNodeId);

    const mergedReferenceImages = mergeImageEditReferenceUrls(
      incomingImages,
      upstreamReferenceUrls,
    );
    let resolvedRequestAspectRatio = selectedAspectRatio.value;
    if (resolvedRequestAspectRatio === AUTO_REQUEST_ASPECT_RATIO) {
      if (incomingImages.length > 0) {
        try {
          const sourceAspectRatio = await detectAspectRatio(incomingImages[0]);
          resolvedRequestAspectRatio = pickClosestAspectRatio(
            parseAspectRatio(sourceAspectRatio),
            supportedAspectRatioValues,
          );
        } catch {
          resolvedRequestAspectRatio = pickClosestAspectRatio(
            1,
            supportedAspectRatioValues,
          );
        }
      } else {
        resolvedRequestAspectRatio = pickClosestAspectRatio(
          1,
          supportedAspectRatioValues,
        );
      }
    }

    const regenerationPayload = {
      prompt,
      model: requestResolution.requestModel,
      modelId: selectedModel.id,
      generationMode: data.generationMode,
      size: selectedResolution.value,
      aspectRatio: resolvedRequestAspectRatio,
      referenceImages: mergedReferenceImages,
      extraParams: effectiveExtraParams,
      capabilityId: data.capabilityId,
      nodeId: id,
      capabilityParams: data.capabilityParams,
      capabilityInputs: data.capabilityInputs,
    };

    try {
      const jobId = await canvasAiGateway.submitGenerateImageJob(
        { projectId, canvasId },
        regenerationPayload,
      );
      const generationDebugContext: GenerationDebugContext = {
        sourceType: 'imageEdit',
        requestModel: requestResolution.requestModel,
        requestSize: selectedResolution.value,
        requestAspectRatio: resolvedRequestAspectRatio,
        prompt,
        extraParams: effectiveExtraParams,
        referenceImageCount: mergedReferenceImages.length,
        referenceImagePlaceholders: createReferenceImagePlaceholders(
          mergedReferenceImages.length,
        ),
        appVersion: runtimeDiagnostics.appVersion,
        osName: runtimeDiagnostics.osName,
        osVersion: runtimeDiagnostics.osVersion,
        osBuild: runtimeDiagnostics.osBuild,
        userAgent: runtimeDiagnostics.userAgent,
      };
      updateNodeData(newNodeId, {
        generationJobId: jobId,
        generationSourceType: 'imageEdit',
        generationClientSessionId: CURRENT_RUNTIME_SESSION_ID,
        generationDebugContext,
        generationRequestPayload: regenerationPayload,
      });
    } catch (generationError) {
      const resolvedError = resolveErrorContent(generationError, t('ai.error'));
      const displayErrorMessage = backendErrorToastMessage(generationError, t);
      const diagnostics = resolveGenerationErrorDiagnostics(
        generationError,
        resolvedError.details,
      );
      const generationDebugContext: GenerationDebugContext = {
        sourceType: 'imageEdit',
        requestModel: requestResolution.requestModel,
        requestSize: selectedResolution.value,
        requestAspectRatio: selectedAspectRatio.value,
        prompt,
        extraParams: effectiveExtraParams,
        referenceImageCount: mergedReferenceImages.length,
        referenceImagePlaceholders: createReferenceImagePlaceholders(
          mergedReferenceImages.length,
        ),
        appVersion: runtimeDiagnostics.appVersion,
        osName: runtimeDiagnostics.osName,
        osVersion: runtimeDiagnostics.osVersion,
        osBuild: runtimeDiagnostics.osBuild,
        userAgent: runtimeDiagnostics.userAgent,
      };
      const reportText = buildGenerationErrorReport({
        errorMessage: displayErrorMessage,
        errorDetails: diagnostics.details ?? undefined,
        context: generationDebugContext,
      });
      setError(displayErrorMessage);
      void showErrorDialog(
        displayErrorMessage,
        t('common.error'),
        diagnostics.details ?? undefined,
        reportText,
      );
      updateNodeData(newNodeId, {
        isGenerating: false,
        generationStartedAt: null,
        generationJobId: null,
        generationClientSessionId: null,
        generationRequestPayload: regenerationPayload,
        generationError: displayErrorMessage,
        generationErrorDetails: diagnostics.details,
        generationErrorRequestId: diagnostics.requestId,
        generationDebugContext,
      });
    }
  }, [
    addEdge,
    addNode,
    capability,
    data.capabilityDefaultPushTarget,
    data.capabilityId,
    data.capabilityInputs,
    data.capabilityOutputKind,
    data.capabilityParams,
    data.generationMode,
    effectiveExtraParams,
    findNodePosition,
    id,
    incomingImages,
    promptDraft,
    canvasId,
    projectId,
    requestResolution.requestModel,
    selectedAspectRatio.value,
    selectedModel,
    selectedResolution.value,
    supportedAspectRatioValues,
    t,
    updateNodeData,
    upstreamReferenceUrls,
    upstreamTextJoined,
  ]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (detail?.nodeId === id) void generate();
    };
    window.addEventListener('freezone:run-node', handler);
    return () => window.removeEventListener('freezone:run-node', handler);
  }, [generate, id]);

  const syncPromptHighlightScroll = useCallback(() => {
    if (!promptRef.current || !promptHighlightRef.current) return;
    promptHighlightRef.current.scrollTop = promptRef.current.scrollTop;
    promptHighlightRef.current.scrollLeft = promptRef.current.scrollLeft;
  }, []);

  const insertImageReference = useCallback(
    (imageIndex: number) => {
      const marker = `@图${imageIndex + 1}`;
      const currentPrompt = promptDraftRef.current;
      const result = replaceTokenRange
        ? replaceReferenceToken(currentPrompt, replaceTokenRange, marker)
        : insertReferenceToken(
            currentPrompt,
            pickerCursor ?? currentPrompt.length,
            marker,
          );
      setPromptDraft(result.nextText);
      commitPromptDraft(result.nextText);
      setShowImagePicker(false);
      setPickerCursor(null);
      setReplaceTokenRange(null);
      setPickerActiveIndex(0);
      requestAnimationFrame(() => {
        promptRef.current?.focus();
        promptRef.current?.setSelectionRange(
          result.nextCursor,
          result.nextCursor,
        );
        syncPromptHighlightScroll();
      });
    },
    [
      commitPromptDraft,
      pickerCursor,
      replaceTokenRange,
      syncPromptHighlightScroll,
    ],
  );

  const handlePromptDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLTextAreaElement>) => {
      if (incomingImages.length === 0) return;
      const textarea = event.currentTarget;
      const selectionStart = textarea.selectionStart ?? 0;
      const selectionEnd = textarea.selectionEnd ?? selectionStart;
      const hit = findReferenceTokenAtSelection(
        promptDraftRef.current,
        selectionStart,
        selectionEnd,
        incomingImages.length,
      );
      if (!hit) return;
      event.preventDefault();
      setPickerAnchor(
        resolveImageEditPickerAnchor(rootRef.current, textarea, hit.start),
      );
      setPickerCursor(hit.start);
      setReplaceTokenRange({ start: hit.start, end: hit.end });
      setShowImagePicker(true);
      setPickerActiveIndex(0);
    },
    [incomingImages.length],
  );

  const applyPromptSuggestion = useCallback(
    (nextPrompt: string) => {
      setPromptDraft(nextPrompt);
      commitPromptDraft(nextPrompt);
      requestAnimationFrame(() => {
        promptRef.current?.focus();
        promptRef.current?.setSelectionRange(
          nextPrompt.length,
          nextPrompt.length,
        );
        syncPromptHighlightScroll();
      });
    },
    [commitPromptDraft, syncPromptHighlightScroll],
  );

  const confirmAssetLibrarySelections = useCallback(
    (selections: ReadonlyArray<CanvasAssetLibrarySelection>) => {
      const state = useCanvasStore.getState();
      const self = state.nodes.find((node) => node.id === id);
      if (!self) return;
      const plans = planImageEditAssetReferences({
        selections,
        nodePosition: self.position,
        nodeHeight: self.height,
      });
      if (plans.length === 0) return;
      const newIds = plans.map(({ selection, position }) => {
        const newId = addNode(CANVAS_NODE_TYPES.upload, position, {
          imageUrl: selection.url,
          previewImageUrl: selection.url,
          displayName: selection.name || undefined,
        });
        addEdge(newId, id);
        return newId;
      });
      state.autoGroupSpawn(id, newIds, { label: '资产参考组' });
    },
    [addEdge, addNode, id],
  );

  const handlePromptKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        const currentPrompt = promptDraftRef.current;
        const selectionStart =
          event.currentTarget.selectionStart ?? currentPrompt.length;
        const selectionEnd =
          event.currentTarget.selectionEnd ?? selectionStart;
        const deleteRange = resolveReferenceAwareDeleteRange(
          currentPrompt,
          selectionStart,
          selectionEnd,
          event.key === 'Backspace' ? 'backward' : 'forward',
          incomingImages.length,
        );
        if (deleteRange) {
          event.preventDefault();
          const result = removeTextRange(currentPrompt, deleteRange);
          setPromptDraft(result.nextText);
          commitPromptDraft(result.nextText);
          requestAnimationFrame(() => {
            promptRef.current?.focus();
            promptRef.current?.setSelectionRange(
              result.nextCursor,
              result.nextCursor,
            );
            syncPromptHighlightScroll();
          });
          return;
        }
      }

      if (showImagePicker && incomingImages.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setPickerActiveIndex(
            (previous) => (previous + 1) % incomingImages.length,
          );
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setPickerActiveIndex((previous) =>
            previous === 0 ? incomingImages.length - 1 : previous - 1,
          );
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          insertImageReference(pickerActiveIndex);
          return;
        }
      }

      if (event.key === '@' && incomingImages.length > 0) {
        event.preventDefault();
        const cursor =
          event.currentTarget.selectionStart ?? promptDraftRef.current.length;
        setPickerAnchor(
          resolveImageEditPickerAnchor(
            rootRef.current,
            event.currentTarget,
            cursor,
          ),
        );
        setPickerCursor(cursor);
        setReplaceTokenRange(null);
        setShowImagePicker(true);
        setPickerActiveIndex(0);
        return;
      }
      if (event.key === 'Escape' && showImagePicker) {
        event.preventDefault();
        setShowImagePicker(false);
        setPickerCursor(null);
        setReplaceTokenRange(null);
        setPickerActiveIndex(0);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void generate();
      }
    },
    [
      commitPromptDraft,
      generate,
      incomingImages.length,
      insertImageReference,
      pickerActiveIndex,
      showImagePicker,
      syncPromptHighlightScroll,
    ],
  );

  const changePrompt = useCallback(
    (nextPrompt: string) => {
      if (replaceTokenRange) {
        setReplaceTokenRange(null);
        setShowImagePicker(false);
        setPickerCursor(null);
      }
      setPromptDraft(nextPrompt);
      commitPromptDraft(nextPrompt);
    },
    [commitPromptDraft, replaceTokenRange],
  );
  const selectGenerationMode = useCallback(
    (mode: string) => {
      updateNodeData(id, {
        generationMode: mode as ImageEditNodeData['generationMode'],
        capabilityId: undefined,
        capabilityParams: undefined,
        capabilityInputs: undefined,
        capabilityOutputKind: undefined,
        capabilityDefaultPushTarget: undefined,
        compiledPromptPreview: undefined,
      });
    },
    [id, updateNodeData],
  );
  const selectCapability = useCallback(
    (nextCapability: GenerationCapability) => {
      updateNodeData(id, {
        displayName: nextCapability.name,
        generationMode: 'image_reference',
        size: nextCapability.imageSize as ImageEditNodeData['size'],
        aspectRatio: nextCapability.aspectRatio,
        requestAspectRatio: nextCapability.aspectRatio,
        capabilityId: nextCapability.id,
        capabilityParams: defaultCapabilityParams(nextCapability),
        capabilityOutputKind: nextCapability.outputKind,
      });
    },
    [id, updateNodeData],
  );
  const clearCapability = useCallback(() => {
    updateNodeData(id, {
      capabilityId: undefined,
      capabilityParams: undefined,
      capabilityInputs: undefined,
      capabilityOutputKind: undefined,
      capabilityDefaultPushTarget: undefined,
      compiledPromptPreview: undefined,
    });
  }, [id, updateNodeData]);
  const updateCapabilityParam = useCallback(
    (key: string, value: unknown) => {
      updateNodeData(id, {
        capabilityParams: {
          ...(data.capabilityParams ?? {}),
          [key]: value,
        },
      });
    },
    [data.capabilityParams, id, updateNodeData],
  );

  return {
    data,
    selected,
    title,
    size,
    rootRef,
    promptRef,
    promptHighlightRef,
    promptDraft,
    incomingImages,
    upstreamTextContents,
    incomingImageItems,
    incomingImageViewerList,
    detachUpstream,
    generationMode,
    generationModeChoices,
    capability,
    structuredCapabilities,
    imageModels,
    selectedModel,
    resolutionOptions,
    selectedResolution,
    aspectRatioOptions,
    selectedAspectRatio,
    resolvedPriceDisplay,
    resolvedPriceTooltip,
    showWebSearchToggle: false,
    webSearchEnabled: false,
    showImagePicker,
    pickerActiveIndex,
    pickerAnchor,
    isAssetLibraryOpen,
    assetLibraryProject,
    error,
    copy: {
      promptPlaceholder: t('node.imageEdit.promptPlaceholder'),
      generate: t('canvas.generate'),
    },
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    focusPrompt: () => promptRef.current?.focus(),
    applyPromptSuggestion,
    selectGenerationMode,
    selectCapability,
    clearCapability,
    updateCapabilityParam,
    changePrompt,
    handlePromptKeyDown,
    handlePromptDoubleClick,
    syncPromptHighlightScroll,
    insertImageReference,
    activatePickerItem: setPickerActiveIndex,
    openAssetLibrary: () => setIsAssetLibraryOpen(true),
    closeAssetLibrary: () => setIsAssetLibraryOpen(false),
    confirmAssetLibrarySelections,
    changeModel: (model: string) => updateNodeData(id, { model }),
    changeResolution: (sizeValue: string) =>
      updateNodeData(id, { size: sizeValue as ImageSize }),
    changeAspectRatio: (requestAspectRatio: string) =>
      updateNodeData(id, { requestAspectRatio }),
    changeExtraParam: (key: string, value: unknown) =>
      updateNodeData(id, {
        extraParams: { ...(data.extraParams ?? {}), [key]: value },
      }),
    toggleWebSearch: (enabled: boolean) =>
      updateNodeData(id, {
        extraParams: {
          ...(data.extraParams ?? {}),
          enable_web_search: enabled,
        },
      }),
    generate,
  };
}

export type ImageEditNodeController = ReturnType<
  typeof useImageEditNodeController
>;
