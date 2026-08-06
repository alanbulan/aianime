// Copyright (c) 2026 AI anime
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useUpdateNodeInternals, useViewport } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

import type {
  CanvasNodeData,
  CanvasNodeType,
  StoryboardGenNodeData,
} from '../domain/canvasNodeData';
import type { ImageSize } from '../domain/imageNodeSizing';
import { CANVAS_NODE_TYPES } from '../domain/canvasConnection';
import { EXPORT_RESULT_DISPLAY_NAME, resolveNodeDisplayName } from '../domain/nodeDisplay';
import { AUTO_REQUEST_ASPECT_RATIO, parseAspectRatio } from '../domain/aspectRatio';
import {
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
} from '../domain/imageNodeLayout';
import {
  STORYBOARD_GEN_AUTO_ASPECT_RATIO_OPTION,
  areStoryboardFrameDraftsEqual,
  buildStoryboardFrameDescriptionDrafts,
  buildStoryboardGenerationPrompt,
  resizeStoryboardGenFrames,
  resolveAutoStoryboardRequestAspectRatio,
  resolveStoryboardGenAspectRatios,
  resolveStoryboardGenControlAspectRatio,
  resolveStoryboardGenLayout,
  resolveStoryboardGenRatioControlMode,
  resolveStoryboardGenerationFrameNotes,
  resolveStoryboardGridCount,
  updateStoryboardGenFrameDescription,
  type StoryboardAspectRatioChoice,
  type StoryboardRatioControlMode,
} from '../domain/storyboardGenNodeModel';
import {
  insertReferenceToken,
  removeTextRange,
  resolveReferenceAwareDeleteRange,
} from '../domain/referenceTokenEditing';
import {
  pickClosestAspectRatio,
  resolveImageDisplayUrl,
} from '../domain/imageData';
import {
  imageModelDefinitions,
  resolveImageModelResolution,
  resolveImageModelResolutions,
  selectImageModel,
} from '../application/imageModelCatalogProjection';
import { resolveModelPriceDisplay } from '../application/modelPriceDisplay';
import {
  buildGenerationErrorReport,
  createReferenceImagePlaceholders,
  resolveGenerationErrorDiagnostics,
  type GenerationDebugContext,
} from '../application/generationErrorReport';
import { resolveErrorContent } from '../application/errorDialog';
import type { CanvasImageJobGateway } from '../application/canvasImageJob';
import type {
  GrsaiCreditTierId,
  PriceDisplayCurrencyMode,
} from '../domain/modelPricing';
import {
  STORYBOARD_PICKER_FALLBACK_ANCHOR,
  generateStoryboardGridImageDataUrl,
  resolveStoryboardPickerAnchor,
  resolveStoryboardPointerAnchor,
  type StoryboardPickerAnchor,
} from '../infrastructure/browserStoryboardGenRuntime';
import { backendErrorToastMessage } from '@/shared/api/errors';

export interface StoryboardGenNodeStore {
  setSelectedNode: (id: string | null) => void;
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  addNode: (
    type: CanvasNodeType,
    position: { x: number; y: number },
    data?: Partial<CanvasNodeData>,
  ) => string;
  addEdge: (source: string, target: string) => void;
  findNodePosition: (
    sourceNodeId: string,
    width: number,
    height: number,
  ) => { x: number; y: number };
}

export type StoryboardGenNodeStoreHook = <TSelected>(
  selector: (state: StoryboardGenNodeStore) => TSelected,
) => TSelected;

export interface StoryboardGenNodeSettingsStore {
  storyboardGenKeepStyleConsistent: boolean;
  storyboardGenDisableTextInImage: boolean;
  storyboardGenAutoInferEmptyFrame: boolean;
  ignoreAtTagWhenCopyingAndGenerating: boolean;
  enableStoryboardGenGridPreviewShortcut: boolean;
  showStoryboardGenAdvancedRatioControls: boolean;
  showNodePrice: boolean;
  priceDisplayCurrencyMode: PriceDisplayCurrencyMode;
  usdToCnyRate: number;
  preferDiscountedPrice: boolean;
  grsaiCreditTierId: GrsaiCreditTierId;
}

export type StoryboardGenNodeSettingsStoreHook = <TSelected>(
  selector: (state: StoryboardGenNodeSettingsStore) => TSelected,
) => TSelected;

export type StoryboardGenCanvasAiGateway = CanvasImageJobGateway;

export type StoryboardGenDetectAspectRatio = (
  imageUrl: string,
) => Promise<string>;

export type StoryboardGenRuntimeDiagnostics = {
  appVersion?: string;
  osName?: string;
  osVersion?: string;
  osBuild?: string;
  userAgent?: string;
};

export type StoryboardGenGetRuntimeDiagnostics = () => Promise<StoryboardGenRuntimeDiagnostics>;

export type StoryboardGenShowErrorDialog = (
  text: string,
  title: string,
  details?: string,
  copyText?: string,
) => Promise<void>;

export type StoryboardGenUploadLocalImage = (
  projectId: string,
  dataUrl: string,
  filename: string,
) => Promise<string>;

export type StoryboardGenUseUpstreamImages = (nodeId: string) => string[];

export type StoryboardGenUseImageModels = (
  projectId: string,
  purpose: 'edit',
) => { models: Array<{ id: string; apiModel: string; label: string }> };
export interface StoryboardGenNodeControllerOptions {
  id: string;
  projectId: string;
  canvasId: string;
  data: StoryboardGenNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
}

interface PointerAnchorState {
  frameIndex: number;
  anchor: StoryboardPickerAnchor;
}

function createFrameId(): string {
  return `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createUseStoryboardGenNodeController({
  useStore,
  useSettingsStore,
  canvasAiGateway,
  CURRENT_RUNTIME_SESSION_ID,
  detectAspectRatio,
  getRuntimeDiagnostics,
  showErrorDialog,
  uploadLocalImageToBackend,
  useUpstreamImages,
  useCanvasImageModels,
}: {
  useStore: StoryboardGenNodeStoreHook;
  useSettingsStore: StoryboardGenNodeSettingsStoreHook;
  canvasAiGateway: StoryboardGenCanvasAiGateway;
  CURRENT_RUNTIME_SESSION_ID: string;
  detectAspectRatio: StoryboardGenDetectAspectRatio;
  getRuntimeDiagnostics: StoryboardGenGetRuntimeDiagnostics;
  showErrorDialog: StoryboardGenShowErrorDialog;
  uploadLocalImageToBackend: StoryboardGenUploadLocalImage;
  useUpstreamImages: StoryboardGenUseUpstreamImages;
  useCanvasImageModels: StoryboardGenUseImageModels;
}) {
  return function useStoryboardGenNodeController({
    id,
    projectId,
    canvasId,
    data,
    selected,
    width,
    height,
  }: StoryboardGenNodeControllerOptions) {
  const { t, i18n } = useTranslation();
  const { zoom } = useViewport();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useStore((state) => state.setSelectedNode);
  const updateNodeData = useStore((state) => state.updateNodeData);
  const addNode = useStore((state) => state.addNode);
  const addEdge = useStore((state) => state.addEdge);
  const findNodePosition = useStore((state) => state.findNodePosition);
  const keepStyleConsistent = useSettingsStore(
    (state) => state.storyboardGenKeepStyleConsistent,
  );
  const disableTextInImage = useSettingsStore(
    (state) => state.storyboardGenDisableTextInImage,
  );
  const autoInferEmptyFrame = useSettingsStore(
    (state) => state.storyboardGenAutoInferEmptyFrame,
  );
  const ignoreAtTag = useSettingsStore(
    (state) => state.ignoreAtTagWhenCopyingAndGenerating,
  );
  const enableGridPreviewShortcut = useSettingsStore(
    (state) => state.enableStoryboardGenGridPreviewShortcut,
  );
  const showAdvancedRatioControls = useSettingsStore(
    (state) => state.showStoryboardGenAdvancedRatioControls,
  );
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
  const activeFrameTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const frameTextareaRefs = useRef<
    Record<string, HTMLTextAreaElement | null>
  >({});
  const frameHighlightRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastPointerAnchorRef = useRef<PointerAnchorState | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [pickerFrameIndex, setPickerFrameIndex] = useState<number | null>(null);
  const [pickerCursor, setPickerCursor] = useState<number | null>(null);
  const [pickerActiveIndex, setPickerActiveIndex] = useState(0);
  const [pickerAnchor, setPickerAnchor] = useState<StoryboardPickerAnchor>(
    STORYBOARD_PICKER_FALLBACK_ANCHOR,
  );
  const [frameDescriptionDrafts, setFrameDescriptionDrafts] = useState<
    Record<string, string>
  >(() => buildStoryboardFrameDescriptionDrafts(data.frames));
  const frameDescriptionDraftsRef = useRef(frameDescriptionDrafts);

  const title = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.storyboardGen, data),
    [data],
  );
  const incomingImages = useUpstreamImages(id);
  const incomingImageItems = useMemo(
    () =>
      incomingImages.map((imageUrl, index) => ({
        imageUrl,
        displayUrl: resolveImageDisplayUrl(imageUrl),
        viewerUrl: resolveImageDisplayUrl(imageUrl),
        label: `图${index + 1}`,
      })),
    [incomingImages],
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
  const aspectRatioOptions = useMemo<StoryboardAspectRatioChoice[]>(
    () => [
      STORYBOARD_GEN_AUTO_ASPECT_RATIO_OPTION,
      ...(selectedModel?.aspectRatios ?? []),
    ],
    [selectedModel],
  );
  const selectedAspectRatio = useMemo<StoryboardAspectRatioChoice>(() => {
    const found = data.requestAspectRatio
      ? aspectRatioOptions.find(
          (item) => item.value === data.requestAspectRatio,
        )
      : undefined;
    return found ?? STORYBOARD_GEN_AUTO_ASPECT_RATIO_OPTION;
  }, [aspectRatioOptions, data.requestAspectRatio]);
  const ratioControlMode = resolveStoryboardGenRatioControlMode(
    data.ratioControlMode,
    showAdvancedRatioControls,
  );
  const controlAspectRatio = resolveStoryboardGenControlAspectRatio(
    selectedAspectRatio.value,
    data.aspectRatio,
  );
  const resolvedAspectRatios = useMemo(
    () =>
      resolveStoryboardGenAspectRatios(
        ratioControlMode,
        parseAspectRatio(controlAspectRatio),
        data.gridRows,
        data.gridCols,
      ),
    [controlAspectRatio, data.gridCols, data.gridRows, ratioControlMode],
  );
  const layout = useMemo(
    () =>
      resolveStoryboardGenLayout({
        rows: data.gridRows,
        cols: data.gridCols,
        frameAspectRatio: resolvedAspectRatios.cellAspectRatio,
        showAdvancedControls: showAdvancedRatioControls,
        width,
        height,
      }),
    [
      data.gridCols,
      data.gridRows,
      height,
      resolvedAspectRatios.cellAspectRatio,
      showAdvancedRatioControls,
      width,
    ],
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
          credits:
            resolvedPriceDisplay.grsaiCreditTier.credits.toLocaleString(
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
  const mappedOverallRequestAspectRatio = useMemo(
    () =>
      pickClosestAspectRatio(
        resolvedAspectRatios.overallRatioValue,
        supportedAspectRatioValues,
      ),
    [resolvedAspectRatios.overallRatioValue, supportedAspectRatioValues],
  );
  const totalFrames = (data.gridRows ?? 1) * (data.gridCols ?? 1);
  const copy = useMemo(
    () => ({
      rowsShort: t('node.storyboardGen.rowsShort'),
      colsShort: t('node.storyboardGen.colsShort'),
      ratioModeOverall: t('node.storyboardGen.ratioModeOverall'),
      ratioModeCell: t('node.storyboardGen.ratioModeCell'),
      frameCount: t('node.storyboardGen.frameCount', { count: totalFrames }),
      cellAspectRatio: t('node.storyboardGen.cellAspectRatio'),
      overallAspectRatio: t('node.storyboardGen.overallAspectRatio'),
      framePlaceholders: data.frames.map((_, index) =>
        t('node.storyboardGen.framePlaceholder', {
          index: String(index + 1).padStart(2, '0'),
        }),
      ),
      generate: t('canvas.generate'),
    }),
    [data.frames, t, totalFrames],
  );

  useEffect(() => {
    frameDescriptionDraftsRef.current = frameDescriptionDrafts;
  }, [frameDescriptionDrafts]);

  useEffect(() => {
    const nextDrafts = buildStoryboardFrameDescriptionDrafts(data.frames);
    setFrameDescriptionDrafts((previous) =>
      areStoryboardFrameDraftsEqual(previous, nextDrafts)
        ? previous
        : nextDrafts,
    );
  }, [data.frames]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, layout.size.height, layout.size.width, updateNodeInternals]);

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
    data,
    id,
    selectedAspectRatio.value,
    selectedModel,
    selectedResolution.value,
    updateNodeData,
  ]);

  useEffect(() => {
    if (incomingImages.length === 0) {
      setShowImagePicker(false);
      setPickerFrameIndex(null);
      setPickerCursor(null);
      setPickerActiveIndex(0);
      return;
    }
    setPickerActiveIndex((previous) =>
      Math.min(previous, incomingImages.length - 1),
    );
  }, [incomingImages.length]);

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setShowImagePicker(false);
      setPickerFrameIndex(null);
      setPickerCursor(null);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    };
  }, []);

  useEffect(() => {
    if (data.frames.length === totalFrames) return;
    updateNodeData(id, {
      frames: resizeStoryboardGenFrames(
        data.frames,
        totalFrames,
        createFrameId,
      ),
    });
  }, [data.frames, id, totalFrames, updateNodeData]);

  const buildPrompt = useCallback(
    () =>
      buildStoryboardGenerationPrompt({
        rows: data.gridRows,
        cols: data.gridCols,
        frames: data.frames,
        drafts: frameDescriptionDraftsRef.current,
        keepStyleConsistent,
        disableTextInImage,
        autoInferEmptyFrame,
      }),
    [
      autoInferEmptyFrame,
      data.frames,
      data.gridCols,
      data.gridRows,
      disableTextInImage,
      keepStyleConsistent,
    ],
  );

  const resolveEffectiveRequestAspectRatio = useCallback(async () => {
    if (selectedAspectRatio.value !== AUTO_REQUEST_ASPECT_RATIO) {
      return mappedOverallRequestAspectRatio;
    }
    let detectedControlRatio = 1;
    if (incomingImages.length > 0) {
      try {
        detectedControlRatio = Math.max(
          0.1,
          parseAspectRatio(await detectAspectRatio(incomingImages[0])),
        );
      } catch {
        detectedControlRatio = 1;
      }
    }
    return resolveAutoStoryboardRequestAspectRatio({
      mode: ratioControlMode,
      detectedControlRatio,
      rows: Math.max(1, data.gridRows),
      cols: Math.max(1, data.gridCols),
      supportedAspectRatios: supportedAspectRatioValues,
    });
  }, [
    data.gridCols,
    data.gridRows,
    incomingImages,
    mappedOverallRequestAspectRatio,
    ratioControlMode,
    selectedAspectRatio.value,
    supportedAspectRatioValues,
  ]);

  const generate = useCallback(
    async (previewGridOnly = false) => {
      const safeRows = Math.max(1, data.gridRows);
      const safeCols = Math.max(1, data.gridCols);
      const resolvedRequestAspectRatio =
        await resolveEffectiveRequestAspectRatio();
      if (previewGridOnly) {
        const gridImageDataUrl = generateStoryboardGridImageDataUrl(
          resolvedRequestAspectRatio,
          safeRows,
          safeCols,
          selectedResolution.value,
        );
        const gridImageUrl = await uploadLocalImageToBackend(
          projectId,
          gridImageDataUrl,
          `storyboard-grid-preview-${id}-${Date.now()}.png`,
        );
        const previewNodeId = addNode(
          CANVAS_NODE_TYPES.exportImage,
          findNodePosition(
            id,
            EXPORT_RESULT_NODE_DEFAULT_WIDTH,
            EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
          ),
          {
            displayName: t('node.storyboardGen.gridPreviewTitle'),
            resultKind: 'storyboardGenOutput',
            imageUrl: gridImageUrl,
            previewImageUrl: gridImageUrl,
            aspectRatio: resolvedRequestAspectRatio,
            isGenerating: false,
            generationStartedAt: null,
            requestAspectRatio: resolvedRequestAspectRatio,
          },
        );
        addEdge(id, previewNodeId);
        setSelectedNode(null);
        setError(null);
        return;
      }

      if (!selectedModel || !requestResolution.requestModel) {
        const errorMessage = t('modelPicker.empty');
        setError(errorMessage);
        void showErrorDialog(errorMessage, t('common.error'));
        return;
      }

      const prompt = buildPrompt();
      if (!prompt) {
        const errorMessage = '请填写至少一个宫格候选描述';
        setError(errorMessage);
        void showErrorDialog(errorMessage, '错误');
        return;
      }
      const generationDurationMs = selectedModel.expectedDurationMs ?? 60000;
      const generationStartedAt = Date.now();
      const runtimeDiagnostics = await getRuntimeDiagnostics();
      const newNodeId = addNode(
        CANVAS_NODE_TYPES.exportImage,
        findNodePosition(
          id,
          EXPORT_RESULT_NODE_DEFAULT_WIDTH,
          EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
        ),
        {
          isGenerating: true,
          generationStartedAt,
          generationDurationMs,
          displayName: EXPORT_RESULT_DISPLAY_NAME.storyboardGenOutput,
          resultKind: 'storyboardGenOutput',
          prompt: '',
          model: selectedModel.id,
          size: selectedResolution.value as ImageSize,
          requestAspectRatio: mappedOverallRequestAspectRatio,
        },
      );
      addEdge(id, newNodeId);
      setSelectedNode(null);
      setError(null);

      const gridImageDataUrl = generateStoryboardGridImageDataUrl(
        resolvedRequestAspectRatio,
        safeRows,
        safeCols,
        selectedResolution.value,
      );
      const gridImageUrl = await uploadLocalImageToBackend(
        projectId,
        gridImageDataUrl,
        `storyboard-grid-${id}-${Date.now()}.png`,
      );
      const allReferenceImages = [...incomingImages, gridImageUrl];
      const metadataFrameNotes = resolveStoryboardGenerationFrameNotes({
        frames: data.frames,
        drafts: frameDescriptionDraftsRef.current,
        frameCount: safeRows * safeCols,
        ignoreAtTag,
      });
      const regenerationPayload = {
        prompt,
        model: requestResolution.requestModel,
        size: selectedResolution.value,
        aspectRatio: resolvedRequestAspectRatio,
        referenceImages: allReferenceImages,
        extraParams: effectiveExtraParams,
        nodeId: id,
      };
      const storyboardMetadata = {
        gridRows: safeRows,
        gridCols: safeCols,
        frameNotes: metadataFrameNotes,
      };
      const generationDebugContext: GenerationDebugContext = {
        sourceType: 'storyboardGen',
        requestModel: requestResolution.requestModel,
        requestSize: selectedResolution.value,
        requestAspectRatio: resolvedRequestAspectRatio,
        prompt,
        extraParams: effectiveExtraParams,
        referenceImageCount: allReferenceImages.length,
        referenceImagePlaceholders: createReferenceImagePlaceholders(
          allReferenceImages.length,
        ),
        appVersion: runtimeDiagnostics.appVersion,
        osName: runtimeDiagnostics.osName,
        osVersion: runtimeDiagnostics.osVersion,
        osBuild: runtimeDiagnostics.osBuild,
        userAgent: runtimeDiagnostics.userAgent,
      };

      try {
        const jobId =
          await canvasAiGateway.submitGenerateImageJob(
            { projectId, canvasId },
            regenerationPayload,
          );
        updateNodeData(newNodeId, {
          generationJobId: jobId,
          generationSourceType: 'storyboardGen',
          generationClientSessionId: CURRENT_RUNTIME_SESSION_ID,
          generationDebugContext,
          generationRequestPayload: regenerationPayload,
          generationStoryboardMetadata: storyboardMetadata,
        });
      } catch (generationError) {
        const resolvedError = resolveErrorContent(
          generationError,
          '生成失败',
        );
        const displayErrorMessage = backendErrorToastMessage(
          generationError,
          t,
        );
        const diagnostics = resolveGenerationErrorDiagnostics(
          generationError,
          resolvedError.details,
        );
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
          generationStoryboardMetadata: storyboardMetadata,
          generationError: displayErrorMessage,
          generationErrorDetails: diagnostics.details,
          generationErrorRequestId: diagnostics.requestId,
          generationDebugContext,
        });
      }
    },
    [
      addEdge,
      addNode,
      buildPrompt,
      data.frames,
      data.gridCols,
      data.gridRows,
      effectiveExtraParams,
      findNodePosition,
      id,
      ignoreAtTag,
      incomingImages,
      mappedOverallRequestAspectRatio,
      canvasId,
      projectId,
      requestResolution.requestModel,
      resolveEffectiveRequestAspectRatio,
      selectedModel,
      selectedResolution.value,
      setSelectedNode,
      t,
      updateNodeData,
    ],
  );

  const changeFrameDescription = useCallback(
    (index: number, description: string) => {
      const frame = data.frames[index];
      if (!frame) return;
      setFrameDescriptionDrafts((previous) =>
        previous[frame.id] === description
          ? previous
          : { ...previous, [frame.id]: description },
      );
      const nextFrames = updateStoryboardGenFrameDescription(
        data.frames,
        index,
        description,
        incomingImages.length,
      );
      if (nextFrames !== data.frames) {
        updateNodeData(id, { frames: nextFrames });
      }
    },
    [data.frames, id, incomingImages.length, updateNodeData],
  );

  const closeImagePicker = useCallback(() => {
    setShowImagePicker(false);
    setPickerFrameIndex(null);
    setPickerCursor(null);
    setPickerActiveIndex(0);
  }, []);

  const syncFrameHighlightScroll = useCallback((frameId: string) => {
    const textarea = frameTextareaRefs.current[frameId];
    const highlight = frameHighlightRefs.current[frameId];
    if (!textarea || !highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }, []);

  const insertImageReference = useCallback(
    (imageIndex: number) => {
      if (pickerFrameIndex === null) return;
      const frame = data.frames[pickerFrameIndex];
      if (!frame) {
        closeImagePicker();
        return;
      }
      const currentDescription =
        frameDescriptionDraftsRef.current[frame.id] ?? frame.description;
      const { nextText, nextCursor } = insertReferenceToken(
        currentDescription,
        pickerCursor ?? currentDescription.length,
        `@图${imageIndex + 1}`,
      );
      changeFrameDescription(pickerFrameIndex, nextText);
      closeImagePicker();
      requestAnimationFrame(() => {
        activeFrameTextareaRef.current?.focus();
        activeFrameTextareaRef.current?.setSelectionRange(
          nextCursor,
          nextCursor,
        );
      });
    },
    [
      changeFrameDescription,
      closeImagePicker,
      data.frames,
      pickerCursor,
      pickerFrameIndex,
    ],
  );

  const handleFrameKeyDown = useCallback(
    (index: number, event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (
        showImagePicker &&
        incomingImages.length > 0 &&
        pickerFrameIndex === index
      ) {
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

      if (event.key === 'Backspace' || event.key === 'Delete') {
        const frame = data.frames[index];
        if (!frame) return;
        const currentDescription =
          frameDescriptionDraftsRef.current[frame.id] ?? frame.description;
        const selectionStart =
          event.currentTarget.selectionStart ?? currentDescription.length;
        const selectionEnd =
          event.currentTarget.selectionEnd ?? selectionStart;
        const deleteRange = resolveReferenceAwareDeleteRange(
          currentDescription,
          selectionStart,
          selectionEnd,
          event.key === 'Backspace' ? 'backward' : 'forward',
          incomingImages.length,
        );
        if (deleteRange) {
          event.preventDefault();
          const { nextText, nextCursor } = removeTextRange(
            currentDescription,
            deleteRange,
          );
          changeFrameDescription(index, nextText);
          requestAnimationFrame(() => {
            activeFrameTextareaRef.current?.focus();
            activeFrameTextareaRef.current?.setSelectionRange(
              nextCursor,
              nextCursor,
            );
            syncFrameHighlightScroll(frame.id);
          });
          return;
        }
      }

      if (event.key === '@' && incomingImages.length > 0) {
        event.preventDefault();
        const cursor =
          event.currentTarget.selectionStart ?? event.currentTarget.value.length;
        const pointerAnchor = lastPointerAnchorRef.current;
        setPickerAnchor(
          pointerAnchor?.frameIndex === index
            ? pointerAnchor.anchor
            : resolveStoryboardPickerAnchor(
                rootRef.current,
                event.currentTarget,
                cursor,
                zoom,
              ),
        );
        setPickerFrameIndex(index);
        setPickerCursor(cursor);
        setPickerActiveIndex(0);
        setShowImagePicker(true);
        activeFrameTextareaRef.current = event.currentTarget;
        return;
      }
      if (event.key === 'Escape' && showImagePicker) {
        event.preventDefault();
        closeImagePicker();
      }
    },
    [
      changeFrameDescription,
      closeImagePicker,
      data.frames,
      incomingImages.length,
      insertImageReference,
      pickerActiveIndex,
      pickerFrameIndex,
      showImagePicker,
      syncFrameHighlightScroll,
      zoom,
    ],
  );

  return {
    id,
    data,
    selected,
    title,
    copy,
    layout,
    totalFrames,
    showAdvancedRatioControls,
    ratioControlMode,
    resolvedAspectRatios,
    frameDescriptionDrafts,
    incomingImages,
    incomingImageItems,
    incomingImageViewerList,
    showImagePicker,
    pickerActiveIndex,
    pickerAnchor,
    error,
    rootRef,
    imageModels,
    selectedModel,
    resolutionOptions,
    selectedResolution,
    selectedAspectRatio,
    aspectRatioOptions,
    resolvedPriceDisplay,
    resolvedPriceTooltip,
    effectiveExtraParams,
    showWebSearchToggle: false,
    webSearchEnabled: false,
    select: () => setSelectedNode(id),
    rename: (displayName: string) => updateNodeData(id, { displayName }),
    adjustRows: (delta: number) =>
      updateNodeData(id, {
        gridRows: resolveStoryboardGridCount(data.gridRows, delta),
      }),
    adjustCols: (delta: number) =>
      updateNodeData(id, {
        gridCols: resolveStoryboardGridCount(data.gridCols, delta),
      }),
    setRatioControlMode: (mode: StoryboardRatioControlMode) =>
      updateNodeData(id, { ratioControlMode: mode }),
    changeFrameDescription,
    setFrameTextareaRef: (
      frameId: string,
      element: HTMLTextAreaElement | null,
    ) => {
      frameTextareaRefs.current[frameId] = element;
    },
    setFrameHighlightRef: (
      frameId: string,
      element: HTMLDivElement | null,
    ) => {
      frameHighlightRefs.current[frameId] = element;
    },
    syncFrameHighlightScroll,
    captureFramePointer: (frameIndex: number, clientX: number, clientY: number) => {
      lastPointerAnchorRef.current = {
        frameIndex,
        anchor: resolveStoryboardPointerAnchor(
          rootRef.current,
          clientX,
          clientY,
          zoom,
        ),
      };
    },
    focusFrame: (frameId: string, textarea: HTMLTextAreaElement) => {
      activeFrameTextareaRef.current = textarea;
      syncFrameHighlightScroll(frameId);
    },
    handleFrameKeyDown,
    insertImageReference,
    activatePickerItem: setPickerActiveIndex,
    changeModel: (model: string) => updateNodeData(id, { model }),
    changeResolution: (size: string) =>
      updateNodeData(id, { size: size as ImageSize }),
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
    generateFromModifiers: (modifiers: {
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
    }) =>
      generate(
        enableGridPreviewShortcut &&
          modifiers.ctrlKey &&
          modifiers.altKey &&
          modifiers.shiftKey,
      ),
  };
  };
}

export type StoryboardGenNodeController = ReturnType<
  ReturnType<typeof createUseStoryboardGenNodeController>
>;
