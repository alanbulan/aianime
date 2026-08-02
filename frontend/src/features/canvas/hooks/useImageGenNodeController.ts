// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import {
  hasEffectiveImageGenPrompt,
  hasImageGenCameraSelection,
  imageGenAlbumUrls,
  IMAGE_GEN_DEFAULT_QUALITY,
  IMAGE_GEN_NODE_DEFAULT_HEIGHT,
  IMAGE_GEN_NODE_DEFAULT_WIDTH,
  IMAGE_GEN_NODE_MIN_HEIGHT,
  IMAGE_GEN_NODE_MIN_WIDTH,
  IMAGE_GEN_OPERATIONS_PANEL_HEIGHT,
  IMAGE_GEN_OPERATIONS_PANEL_MIN_WIDTH,
  isImage2Model,
  resolveImageGenEffectivePrompt,
  resolveImageGenModel,
  resolveImageGenNaturalSize,
  resolveImageGenNodeDimensions,
  resolveImageGenPreviewUrl,
  resolveImageGenReferencePreviewPosition,
  snapImageGenAspectRatio,
} from '@/features/canvas/application/imageGenNodeModel';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import {
  aspectRatioFromImageDimensions,
  resolveMinEdgeFittedSize,
  shouldForceNaturalImageSize,
} from '@/features/canvas/application/imageNodeSizing';
import {
  buildImageGenerationSuccessPatch,
  isStaleGenerationTask,
  shouldWriteGenerationError,
} from '@/features/canvas/application/generationTaskArbitration';
import { extractRequestId } from '@/features/canvas/application/generationErrorReport';
import type { CanvasGenerationHistoryRecord } from '@/features/canvas/application/generationHistory';
import { joinUpstreamText } from '@/features/canvas/application/graphContentResolver';
import { generationTaskDescriptor } from '@/features/canvas/application/resumeGeneration';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  CANVAS_NODE_TYPES,
  type ImageGenCameraSelection,
  type ImageGenCount,
  type ImageGenNodeData,
  type ImageQuality,
  type ImageSize,
} from '@/features/canvas/domain/canvasNodes';
import {
  collectCandidateBindingsForNode,
  filterCanvasImageModels,
  generateCanvasImage,
  getFreezoneCanvasMetadata,
  historyRecordOutputUrl,
  publishCanvasAssetsUpdated,
  publishCanvasCommitRequested,
  translateCanvasText,
  useCanvasCameraOptions,
  useCanvasImageModels,
  useCanvasStyleTemplates,
  type CanvasImageMode,
} from '@/modules/creative_canvas/public';
import { withImageCacheBust } from '@/shared/media/image-cache';
import {
  isSystemManagedNodeData,
  mainlineNodeVisualState,
  nodeMainlineFlags,
} from '@/features/canvas/domain/mainlineNodeFlags';
import { resolveNodeDisplayName } from '@/features/canvas/domain/nodeDisplay';
import type { CanvasAssetLibrarySelection } from '@/features/canvas/domain/assetLibrary';
import {
  getCanvasBeatDirectorManifest,
  uploadAndAutoCommitSelectedBackgroundCandidate,
  uploadCanvasAsset,
} from '@/features/canvas/composition';
import { useIsBoxSelecting } from '@/features/canvas/hooks/useIsBoxSelecting';
import { useNodeGenerationHistory } from '@/features/canvas/hooks/useNodeGenerationHistory';
import { useNodeGenerationTaskState } from '@/features/canvas/hooks/useNodeGenerationTaskState';
import { useUpstreamContents } from '@/features/canvas/hooks/useUpstreamGraph';
import {
  setAlbumPendingTotal,
  useAlbumPendingTotal,
} from '@/features/canvas/nodes/shared/albumPendingTotals';
import {
  describeCameraSelection,
} from '@/features/canvas/nodes/CameraPickerPopover';
import {
  type ContextPromptPaletteEntry,
  contextPromptPaletteInsertionText,
} from '@/features/canvas/nodes/contextPromptPalette';
import type {
  MentionCandidate,
  PromptMentionEditorHandle,
} from '@/features/canvas/nodes/PromptMentionEditor';
import { orderedReferenceUrlsWithOwnFirst } from '@/features/canvas/nodes/referenceOrdering';
import { describeStyleSelection } from '@/features/canvas/nodes/StylePickerPopover';
import { useReferenceMentionSync } from '@/features/canvas/nodes/useReferenceMentionSync';
import { canvasNodeFrameClass } from '@/features/canvas/ui/nodeFrameStyles';
import type {
  DirectorControlFrameBundle,
  DirectorStageManifest,
} from '@/features/viewer-kit/three-d/directorManifest';
import { useGenerationCreditCost } from '@/modules/model_usage/public';
import { formatCreditCost } from '@/components/credits/credit-visual';
import { downloadUrlAsFile } from '@/lib/browserDownload';
import { backendErrorToastMessage } from '@/shared/api/errors';

export interface ImageGenNodeControllerOptions {
  id: string;
  data: ImageGenNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
  projectId: string;
  canvasId: string;
}

interface ImageGenDirectorCaptureMeta {
  controlFrameUrl?: string;
  controlFrameBundle?: DirectorControlFrameBundle;
}

export function useImageGenNodeController({
  id,
  data,
  selected,
  width,
  height,
  projectId,
  canvasId,
}: ImageGenNodeControllerOptions) {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const isBoxSelecting = useIsBoxSelecting();
  // 顶部工具栏打开了二级功能浮层（全景 / 多角度 / 打光 等）时，浮层会在节点下方
  // 展开自己的操作区。此时隐藏本节点底部的生成/历史面板，让位给浮层，避免两块
  // 操作区重叠。
  const hasActiveOverlay = useCanvasStore((state) => state.activeOverlayNodeId === id);
  const setActiveOverlayNodeId = useCanvasStore((state) => state.setActiveOverlayNodeId);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const updateNodeSize = useCanvasStore((state) => state.updateNodeSize);
  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const addNodeAction = useCanvasStore((state) => state.addNode);
  const addEdgeAction = useCanvasStore((state) => state.addEdge);

  // Local prompt buffer keeps the textarea's React `value` in lockstep with
  // user input even during IME composition (中文输入法). Committing to the
  // Zustand store on every keystroke triggers a global re-render that can
  // clobber the in-flight composition; the buffer absorbs that race.
  const externalPrompt = typeof data.prompt === 'string' ? data.prompt : '';
  const [promptDraft, setPromptDraft] = useState(externalPrompt);
  const isComposingRef = useRef(false);
  const hasUserEditedPromptRef = useRef(false);
  const submittingRef = useRef(false);
  useEffect(() => {
    if (isComposingRef.current) return;
    setPromptDraft(externalPrompt);
  }, [externalPrompt]);
  const prompt = promptDraft;
  const promptEditorRef = useRef<PromptMentionEditorHandle>(null);
  const aspectRatio = typeof data.aspectRatio === 'string' && data.aspectRatio
    ? data.aspectRatio
    : '16:9';
  const size = (data.size ?? '2K') as ImageSize;
  const quality = (data.quality ?? IMAGE_GEN_DEFAULT_QUALITY) as ImageQuality;
  const count = (data.count ?? 1) as ImageGenCount;
  const autoCommitOnGenerate = data.autoCommitOnGenerate === true;
  const canAutoCommitOnGenerate =
    autoCommitOnGenerate &&
    isSystemManagedNodeData(data);
  const effectiveCount = canAutoCommitOnGenerate ? 1 : count;
  const { isGenerating } = useNodeGenerationTaskState(data);
  const generationError =
    typeof data.generationError === 'string' && data.generationError.length > 0
      ? data.generationError
      : null;
  const generationErrorDetails =
    typeof data.generationErrorDetails === 'string' && data.generationErrorDetails.length > 0
      ? data.generationErrorDetails
      : null;
  const generationErrorRequestId =
    typeof data.generationErrorRequestId === 'string' && data.generationErrorRequestId.length > 0
      ? data.generationErrorRequestId
      : null;
  const cameraSelection = (data.cameraSelection ?? null) as ImageGenCameraSelection | null;
  const styleTemplateId =
    typeof data.styleTemplateId === 'string' && data.styleTemplateId.length > 0
      ? data.styleTemplateId
      : null;
  const referenceImageUrl =
    typeof data.referenceImageUrl === 'string' && data.referenceImageUrl.length > 0
      ? data.referenceImageUrl
      : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isTranslatingPrompt, setIsTranslatingPrompt] = useState(false);
  const [errorDetailsCopied, setErrorDetailsCopied] = useState(false);

  const handleCopyErrorDetails = useCallback(async () => {
    // New failures keep the complete task/provider response in details. For
    // older persisted nodes, generationError itself may still be the raw blob.
    const copyText = generationErrorDetails || generationError || generationErrorRequestId;
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setErrorDetailsCopied(true);
      window.setTimeout(() => setErrorDetailsCopied(false), 1200);
    } catch (error) {
      console.error('[image-gen] copy error details failed', error);
    }
  }, [generationError, generationErrorDetails, generationErrorRequestId]);

  const {
    models: catalogImageModels,
    isLoading: imageModelsLoading,
  } = useCanvasImageModels(projectId);
  // Per-node generation history. Only fetch while the node is selected so an
  // unselected canvas full of nodes doesn't fan out a request each. `refresh`
  // is called after a generation settles to pull in the new record.
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

  // 生成进行中时，点击历史记录走「非破坏性预览」：不覆写 imageUrl、不打断在途
  // 任务，仅把这张历史图临时显示在主体上（见 isGenerating 渲染分支）。新图生成
  // 完成后由下方 effect 自动清空，回到最新结果。非生成态恢复历史时也清掉它。
  const [historyPreviewUrl, setHistoryPreviewUrl] = useState<string | null>(null);

  const handleRestoreHistory = useCallback(
    (record: CanvasGenerationHistoryRecord) => {
      const url = historyRecordOutputUrl(record);
      if (!url) return;
      // 生成进行中：仅做非破坏性预览，绝不动 imageUrl，也不打断在途任务。
      if (isGenerating) {
        setHistoryPreviewUrl(url);
        return;
      }
      setHistoryPreviewUrl(null);
      updateNodeData(id, {
        imageUrl: url,
        previewImageUrl: url,
        isGenerating: false,
        generationStartedAt: null,
        // 恢复的是单张历史结果，旧批次画册已与主图脱钩（没有任何一张会命中
        // 「主图」标记，点画册格还会静默丢掉刚恢复的图）——一并清掉。
        generationBatch: null,
      });
    },
    [id, isGenerating, updateNodeData],
  );

  // 生成结束（成功/失败）后清掉临时历史预览，让主体回到最新结果。
  useEffect(() => {
    if (!isGenerating) setHistoryPreviewUrl(null);
  }, [isGenerating]);
  const { options: cameraOptions } = useCanvasCameraOptions(projectId);
  const cameraSummary = describeCameraSelection(cameraSelection, cameraOptions);
  const { templates: styleTemplates } = useCanvasStyleTemplates(projectId);
  const selectedStyle = describeStyleSelection(styleTemplateId, styleTemplates);

  const upstreamContents = useUpstreamContents(id);
  // ImageGen 上游只消费「文本 + 图片」，视频/音频内容被丢弃 ——
  // 即便 upload 节点带了视频 URL，也不进 OpsPanel 也不进 reference_urls。
  const upstreamImageContents = useMemo(() => {
    const seen = new Set<string>();
    const out: typeof upstreamContents = [];
    for (const content of upstreamContents) {
      const url = typeof content.imageUrl === 'string' ? content.imageUrl : '';
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(content);
    }
    return out;
  }, [upstreamContents]);
  const upstreamTextContents = useMemo(
    () =>
      upstreamContents.filter(
        (content) => typeof content.text === 'string' && content.text.trim().length > 0,
      ),
    [upstreamContents],
  );
  const upstreamTextJoined = useMemo(
    () => joinUpstreamText(upstreamContents),
    [upstreamContents],
  );
  const freezoneSource = (data.__freezone_source as
    | { role?: string; meta?: Record<string, unknown> }
    | undefined) ?? undefined;
  const sourceRole = typeof freezoneSource?.role === "string"
    ? freezoneSource.role
    : "";
  const shouldInlineUpstreamTextAsPrompt =
    sourceRole === "scene_master" || sourceRole === "scene_reverse_master";
  const upstreamReferenceUrls = useMemo(
    () =>
      Array.from(
        new Set(
          upstreamImageContents
            .map((c) => (typeof c.imageUrl === 'string' ? c.imageUrl : ''))
            .filter((url) => url.length > 0),
        ),
      ),
    [upstreamImageContents],
  );
  // 提交给后端的参考图有序列表：自身参考图排第 1、上游图接在后面（URL 去重）。
  // @图片N 编号、mention 重排基线、提交三处共用这一份 —— 后端按位置解释 图片N，
  // 曾经编号只数上游图、提交却把自身参考图前置，节点自带参考图时所有 @图片N
  // 到后端整体偏移 1（@图片1 实际指向自身参考图）。
  const orderedReferenceUrls = useMemo(
    () => orderedReferenceUrlsWithOwnFirst(referenceImageUrl, upstreamReferenceUrls),
    [referenceImageUrl, upstreamReferenceUrls],
  );
  const imageModelMode: CanvasImageMode =
    orderedReferenceUrls.length > 0 ? 'edit' : 'generation';
  const availableModels = useMemo(
    () => filterCanvasImageModels(catalogImageModels, imageModelMode),
    [catalogImageModels, imageModelMode],
  );
  // Reconcile persisted ids against the authorized list for the active request
  // role so the picker and submitted SKU cannot diverge after references change.
  const selectedModel = useMemo(
    () => resolveImageGenModel(availableModels, data.model),
    [availableModels, data.model],
  );
  const modelId = selectedModel?.id ?? "";
  const isImage2 = isImage2Model(selectedModel?.apiModel);
  const imageSelectionForCost =
    imageModelsLoading ? null : selectedModel?.apiModel ?? null;
  const imageCreditCost = useGenerationCreditCost('image_selection', imageSelectionForCost, {
    surface: 'canvas',
    params: isImage2 ? { size, quality } : { size },
    quantity: Math.min(Math.max(effectiveCount, 1), 4),
  });
  const totalCreditCostDisplay = useMemo(() => {
    const total = imageCreditCost.data?.data.cost;
    if (typeof total !== 'number') return null;
    return formatCreditCost(total);
  }, [imageCreditCost.data?.data.cost]);
  // collectCandidateBindingsForNode 只关心连到 this node 的边。用 useShallow 只订阅
  // 本节点相连的边(逐元素比较),拖动无关节点时边引用稳定,本节点不再重渲染。
  const connectedEdges = useCanvasStore(
    useShallow((state) => state.edges.filter((edge) => edge.source === id || edge.target === id)),
  );
  const candidateBindingRoles = useMemo(
    () => collectCandidateBindingsForNode(connectedEdges, id).map((binding) => binding.role),
    [connectedEdges, id],
  );
  // 节点被连线（存在入边）后：隐藏「试试」CTA，只在节点中间显示一个图标（对齐 libtv）。
  const isConnected = useMemo(
    () => connectedEdges.some((edge) => edge.target === id),
    [connectedEdges, id],
  );

  // 候选按 orderedReferenceUrls 编号（自身参考图在场时就是图片1），保证 @ 出来的
  // 缩略图与后端解析到的 图片N 是同一张。key 优先用上游 nodeId；自身参考图没有
  // 上游节点，用 URL 兜底（key 只需在候选内稳定唯一）。
  const mentionCandidates = useMemo<MentionCandidate[]>(
    () =>
      orderedReferenceUrls.map((url, index) => ({
        key:
          upstreamImageContents.find((content) => content.imageUrl === url)
            ?.nodeId ?? `self:${url}`,
        name: `图片${index + 1}`,
        imageUrl: resolveImageDisplayUrl(url),
        index: index + 1,
      })),
    [orderedReferenceUrls, upstreamImageContents],
  );

  // 让 prompt 里的 @图片N 始终跟随参考图引用编号：删除 / 重排 / 新增引用连线、
  // 上传或移除自身参考图后，mentionCandidates 会重新编号，这里把 prompt 里的数字
  // 一并重写、被删引用的 mention 移除。有序基线 = orderedReferenceUrls（自身参考图
  // 在前、去重 URL、连接顺序，与编号和提交口径一致；用 URL 而非 nodeId 作身份，
  // 避免「两个上游节点图同一 URL」时删其一被误判为引用消失）。
  const applyPromptRemap = useCallback(
    (next: string) => {
      setPromptDraft(next);
      updateNodeData(id, { prompt: next });
    },
    [id, updateNodeData],
  );
  useReferenceMentionSync(
    prompt,
    [{ prefix: "图片", ids: orderedReferenceUrls }],
    applyPromptRemap,
  );

  // 弹层与编辑器同在面板里、编辑器恒已挂载，故插入直接走命令式 API，回调保持稳定引用
  // （无需依赖 prompt，避免每次按键重建回调、连带调色盘按钮重渲染）。
  const insertContextPaletteEntry = useCallback(
    (entry: ContextPromptPaletteEntry) => {
      promptEditorRef.current?.insertTextAtCursor(
        contextPromptPaletteInsertionText(entry),
      );
    },
    [],
  );

  // 取消关联某个上游素材：直接删掉「该上游节点 → 本节点」的连线，无需用户
  // 去画布上找那根线。collectInputContents 只走一跳，所以 content.nodeId 就是
  // 直接相连的上游节点，可精确定位到要删的边。
  const handleDetachUpstream = useCallback(
    (sourceNodeId: string) => {
      useCanvasStore
        .getState()
        .edges.filter((edge) => edge.source === sourceNodeId && edge.target === id)
        .forEach((edge) => deleteEdge(edge.id));
    },
    [id, deleteEdge],
  );

  const [isAssetLibraryOpen, setIsAssetLibraryOpen] = useState(false);

  // Spawn upload reference nodes from selected asset-library images — one per
  // selection, stacked to the left of this node, then wired as upstream refs so
  // they feed the multi-reference generation. Image-only here (the modal is
  // opened with allowedMedia=['image']), but we still guard on media.
  const spawnAssetLibraryReferences = useCallback(
    (selections: ReadonlyArray<CanvasAssetLibrarySelection>) => {
      const imageSelections = selections.filter((sel) => sel.media === 'image');
      if (imageSelections.length === 0) return;
      const state = useCanvasStore.getState();
      const self = state.nodes.find((n) => n.id === id);
      if (!self) return;
      const UPLOAD_WIDTH = 320;
      const UPLOAD_HEIGHT = 240;
      const GAP_X = 40;
      const GAP_Y = 24;
      const baseX = self.position.x - UPLOAD_WIDTH - GAP_X;
      const totalH =
        UPLOAD_HEIGHT * imageSelections.length + GAP_Y * (imageSelections.length - 1);
      const startY =
        self.position.y + ((self.height ?? IMAGE_GEN_NODE_DEFAULT_HEIGHT) - totalH) / 2;
      const newIds: string[] = [];
      imageSelections.forEach((sel, idx) => {
        const y = startY + idx * (UPLOAD_HEIGHT + GAP_Y);
        const newId = addNodeAction(
          CANVAS_NODE_TYPES.upload,
          { x: baseX, y },
          {
            imageUrl: sel.url,
            previewImageUrl: sel.url,
            displayName: sel.name || undefined,
          },
        );
        addEdgeAction(newId, id);
        newIds.push(newId);
      });
      state.autoGroupSpawn(id, newIds, { label: '资产参考组' });
    },
    [addEdgeAction, addNodeAction, id],
  );

  // Hover preview state for the upstream image thumbnails in the OpsPanel
  // reference row. Mirrors the @-mention chip preview UX so users can peek
  // a full-size image without leaving the prompt editor.
  const [refHover, setRefHover] = useState<{ imageUrl: string; rect: DOMRect } | null>(null);
  const refPreviewStyle = useMemo(
    () =>
      resolveImageGenReferencePreviewPosition(
        refHover?.rect ?? null,
        window.innerWidth,
      ),
    [refHover],
  );

  const resolvedTitle = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.imageGen, data),
    [data],
  );
  const {
    width: resolvedWidth,
    height: resolvedHeight,
  } = resolveImageGenNodeDimensions(width, height);
  // 收起态浮动面板固定基础尺寸；放大用居中弹窗（见下方 OperationPanelShell）。
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const panelHeight = IMAGE_GEN_OPERATIONS_PANEL_HEIGHT;
  const panelWidth = Math.max(
    resolvedWidth,
    IMAGE_GEN_OPERATIONS_PANEL_MIN_WIDTH,
  );

  const previewUrl = useMemo(
    () => resolveImageGenPreviewUrl(data, referenceImageUrl),
    [data, referenceImageUrl],
  );
  const visiblePreviewUrl = isGenerating ? null : previewUrl;

  const hasGeneratedResult = Boolean(data.imageUrl);
  // Natural pixel size of the displayed image, mirrored from data when present
  // (persisted by the onLoad handler below) and refreshed on every <img> load so
  // the resolution badge shows even for nodes whose size already matched (those
  // skip the persist branch). Lets us render a top-right resolution chip like the
  // video node.
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(() => resolveImageGenNaturalSize(data));
  // ── 叠卡画册（count > 1 的一组生成结果）──
  // 收拢时主图后探出 N-1 张卡片边缘；hover 出现右上角数量徽标，点开展开成
  // 宫格画册（同一节点内，天然不可解组）。展开态可对任意一张「设为主图」
  // （回填 imageUrl 并收拢）或单独下载。
  const albumRootRef = useRef<HTMLDivElement | null>(null);
  // 画册容器 pointerdown 起点，用于区分点击与拖动（拖动节点后松手会补发 click）。
  const albumPointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const [albumExpanded, setAlbumExpanded] = useState(false);
  // 本次会话内"应到张数"：N 个接口并发、完成有先后，先完成的立即入册，
  // 未完成的在画册里占位（骨架 + spinner）。存模块级登记表而非组件 state——
  // onlyRenderVisibleElements 下平移出视口会卸载组件，state 会丢；见模块注释。
  const albumPendingTotal = useAlbumPendingTotal(id);
  const albumUrls = useMemo(
    () => imageGenAlbumUrls(data.generationBatch),
    [data.generationBatch],
  );
  const albumTotalSlots = Math.max(albumUrls.length, albumPendingTotal);
  const albumPendingCount = Math.max(0, albumPendingTotal - albumUrls.length);
  const hasAlbum = albumTotalSlots > 1;

  // 画册展开期间注册为本节点的 activeOverlay：拖动画册会让 React Flow 重新
  // 选中节点（selectNodesOnDrag），单靠展开瞬间的取消选中压不住——action
  // 工具条 / OpsPanel / 历史条 / 替换素材把手都认 activeOverlayNodeId 让位，
  // 注册后无论选中与否都不会再叠出来。
  useEffect(() => {
    if (!albumExpanded) return;
    setActiveOverlayNodeId(id);
    return () => {
      // 只清自己注册的，避免误清其它浮层（多角度/打光等）的注册。
      if (useCanvasStore.getState().activeOverlayNodeId === id) {
        setActiveOverlayNodeId(null);
      }
    };
  }, [albumExpanded, id, setActiveOverlayNodeId]);

  useEffect(() => {
    if (!albumExpanded) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (albumRootRef.current?.contains(event.target as Node)) return;
      setAlbumExpanded(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAlbumExpanded(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [albumExpanded]);

  const handleSetAlbumMainImage = useCallback(
    (url: string) => {
      updateNodeData(id, { imageUrl: url, previewImageUrl: url });
      setAlbumExpanded(false);
    },
    [id, updateNodeData],
  );

  // 展开画册时取消节点激活态：上方 action 工具条、下方 OpsPanel、历史记录条
  // 都跟着 selected 走，叠在宫格上很乱——画册期间只看图。
  // 注意必须经 onNodesChange 派发 select=false 清掉 React Flow 自身的选中
  // 标志——只清 store 的 selectedNodeId 会被 Canvas 的选中同步 effect
  // （RF selectedNodeIds → setSelectedNode）立刻写回来。
  // 副作用放在 setState updater 外面：updater 必须纯（StrictMode 会双调用，
  // 副作用入内会把 onNodesChange 派发两遍）。
  const handleToggleAlbumExpanded = useCallback(() => {
    if (!albumExpanded) {
      const store = useCanvasStore.getState();
      const selectionChanges = store.nodes
        .filter((node) => node.selected)
        .map((node) => ({ id: node.id, type: 'select' as const, selected: false }));
      if (selectionChanges.length > 0) {
        store.onNodesChange(selectionChanges);
      }
      setSelectedNode(null);
      // 每次展开重置「应用到画布」的落点游标。
      albumAppliedCountRef.current = 0;
    }
    setAlbumExpanded(!albumExpanded);
  }, [albumExpanded, setSelectedNode]);

  // 「应用到画布」：把这张图作为独立图片节点放到展开宫格右侧（同构 imageGen
  // 节点，可直接被下游引用/二次生成）。画册保持展开，方便连续应用多张——
  // 连续应用的落点逐次向下错开，避免精确叠在同一坐标上只看得见最后一个。
  const albumAppliedCountRef = useRef(0);
  const handleApplyAlbumImageToCanvas = useCallback(
    (url: string) => {
      const self = useCanvasStore.getState().nodes.find((n) => n.id === id);
      if (!self) return;
      const applyIndex = albumAppliedCountRef.current;
      albumAppliedCountRef.current += 1;
      const position = {
        x: self.position.x + resolvedWidth * 2 + 12 + 48 + applyIndex * 36,
        y: self.position.y + applyIndex * 36,
      };
      const newNodeId = addNodeAction(CANVAS_NODE_TYPES.imageGen, position, {
        imageUrl: url,
        previewImageUrl: url,
        aspectRatio: data.aspectRatio,
        user_spawned: true,
      } as Partial<ImageGenNodeData>);
      setSelectedNode(newNodeId);
    },
    [addNodeAction, data.aspectRatio, id, resolvedWidth, setSelectedNode],
  );

  const handleDownloadAlbumImage = useCallback(
    async (url: string, index: number) => {
      try {
        await downloadUrlAsFile(resolveImageDisplayUrl(url), `image-gen-${id}-${index + 1}.png`);
      } catch (error) {
        console.error('[image-gen] album download failed', error);
      }
    },
    [id],
  );

  const handlePickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!projectId) {
        console.error('[image-gen] missing project context');
        return;
      }
      setIsUploading(true);
      try {
        const result = await uploadCanvasAsset(projectId, file, file.name);
        updateNodeData(id, { referenceImageUrl: result.url });
      } catch (error) {
        console.error('[image-gen] upload failed', error);
      } finally {
        setIsUploading(false);
      }
    },
    [id, projectId, updateNodeData],
  );

  const handleClearReference = useCallback(() => {
    updateNodeData(id, { referenceImageUrl: null });
  }, [id, updateNodeData]);

  const handleSpawnUpstreamImage = useCallback(() => {
    const self = useCanvasStore.getState().nodes.find((n) => n.id === id);
    if (!self) return;
    // 上游图片节点本身也是 imageGen —— 用户可以直接在它里面写 prompt /
    // 选模型 / 生成图，下游再拿它的结果当参考图。与 upload 相比好处是
    // 自带 OpsPanel，整链路同构。
    const UPSTREAM_WIDTH = IMAGE_GEN_NODE_DEFAULT_WIDTH;
    const position = {
      x: self.position.x - UPSTREAM_WIDTH - 28,
      y: self.position.y,
    };
    const newNodeId = addNodeAction(CANVAS_NODE_TYPES.imageGen, position);
    addEdgeAction(newNodeId, id);
    setSelectedNode(newNodeId);
  }, [addEdgeAction, addNodeAction, id, setSelectedNode]);

  const handleTranslatePrompt = useCallback(async () => {
    if (isTranslatingPrompt || isGenerating) return;
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    if (!projectId) {
      console.error('[image-gen] translate: missing project context');
      return;
    }
    setIsTranslatingPrompt(true);
    try {
      const result = await translateCanvasText({
        projectId,
        text: prompt,
        nodeType: 'image',
        canvasId,
        nodeId: id,
      });
      if (result.translatedText) {
        setPromptDraft(result.translatedText);
        updateNodeData(id, { prompt: result.translatedText });
      }
    } catch (error) {
      console.error('[image-gen] translate failed', error);
    } finally {
      setIsTranslatingPrompt(false);
    }
  }, [
    canvasId,
    id,
    isGenerating,
    isTranslatingPrompt,
    projectId,
    prompt,
    updateNodeData,
  ]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, resolvedHeight, resolvedWidth, updateNodeInternals]);

  // 「实时读取上游」：用户可以不填 prompt，只要上游连了带 text 的节点
  // (文本/脚本/图片生成 prompt 等) 就能 submit；submit 时拼接上游 text。
  const hasEffectivePrompt = hasEffectiveImageGenPrompt({
    prompt,
    upstreamText: upstreamTextJoined,
    inlineUpstreamText: shouldInlineUpstreamTextAsPrompt,
    hasUserEditedPrompt: hasUserEditedPromptRef.current,
  });
  const submitDisabled =
    isGenerating || imageModelsLoading || !selectedModel || !hasEffectivePrompt;

  const handleSubmit = useCallback(async () => {
    if (submitDisabled || submittingRef.current) return;
    submittingRef.current = true;
    try {
    if (!projectId) {
      console.error('[image-gen] missing project context');
      return;
    }

    // apiModel comes from the SAME reconciled model the picker displays, so the
    // backend always receives the model the user actually sees.
    if (!selectedModel) return;
    const apiModel = selectedModel.apiModel;
    // 自身参考图（用户手动上传） + 所有上游图片/视频 URL，去重 —— 与 @图片N
    // 编号共用同一份有序列表（orderedReferenceUrls），后端按位置解释 图片N。
    // 后端 reference_urls 接受 image / video 混合数组。
    const referenceUrls = orderedReferenceUrls;
    const hasCamera = hasImageGenCameraSelection(cameraSelection);
    const effectivePrompt = resolveImageGenEffectivePrompt({
      prompt,
      upstreamText: upstreamTextJoined,
      inlineUpstreamText: shouldInlineUpstreamTextAsPrompt,
      hasUserEditedPrompt: hasUserEditedPromptRef.current,
    });
    const genPayload = {
      prompt: effectivePrompt,
      // 后端只接受固定的几个比例；节点上的 aspectRatio 可能是图片自然尺寸约分出的
      // 非标准值（如 "43:24"）或 "auto"，提交前吸附到最接近的合法比例（auto→1:1）。
      aspectRatio: snapImageGenAspectRatio(aspectRatio) as typeof aspectRatio,
      imageSize: size,
      // 画质仅对 image2 系模型生效，其余模型不下发该字段。
      quality: isImage2 ? quality : null,
      referenceUrls,
      model: apiModel,
      modelId,
      camera: hasCamera
        ? {
            cameraBodyId: cameraSelection?.cameraBodyId ?? null,
            lensId: cameraSelection?.lensId ?? null,
            focalLengthMm: cameraSelection?.focalLengthMm ?? null,
            aperture: cameraSelection?.aperture ?? null,
          }
        : null,
      style: styleTemplateId ? { templateId: styleTemplateId } : null,
    };

    // 后端不再支持一次出多张，改为按「生成数量」并发调用 N 次接口，每次出
    // 1 张。N > 1 时不再复制兄弟节点，而是全部回填到当前节点的
    // generationBatch（叠卡画册）：第 1 张完成的设为主图（imageUrl），其余
    // 逐张追加进画册，收拢态渲染成叠起的卡片。
    const total = Math.min(Math.max(effectiveCount, 1), 4);
    // Clear any prior failure / album on resubmit — the on-node error banner
    // should only reflect the most recent attempt.
    updateNodeData(id, {
      isGenerating: true,
      generationStartedAt: Date.now(),
      generationError: null,
      generationErrorDetails: null,
      generationErrorRequestId: null,
      generationBatch: null,
    });
    // 先完成的图立即入册展示，未完成的在画册里渲染占位骨架。
    setAlbumPendingTotal(id, total > 1 ? total : 0);

    // 各并发任务完成顺序不定，本地累积已完成的 URL，整组写回（避免读改写竞态）。
    const completedUrls: string[] = [];
    const runOne = async (runIndex: number) => {
      let taskKey: string | null = null;
      try {
        const { task, url, resultFallbackError } = await generateCanvasImage(
          {
            projectId,
            ...genPayload,
            canvasId,
            nodeId: id,
          },
          (submittedTask) => {
            taskKey = submittedTask.task_key;
            // With N concurrent runs on one node only one handle can persist.
            if (runIndex === 0) {
              updateNodeData(id, generationTaskDescriptor(submittedTask));
            }
          },
        );
        if (resultFallbackError) {
          console.warn('[image-gen] fallback fetch failed', resultFallbackError);
        }
        if (url) {
          completedUrls.push(url);
          const isFirstCompleted = completedUrls.length === 1;
          updateNodeData(id, {
            // 第 1 张完成的设为主图并结束 loading；后续只扩充画册。
            ...(isFirstCompleted ? buildImageGenerationSuccessPatch(url) : {}),
            ...(total > 1 ? { generationBatch: [...completedUrls] } : {}),
          });
          if (canAutoCommitOnGenerate && isFirstCompleted) {
            publishCanvasCommitRequested({
              nodeId: id,
              auto: true,
            });
          }
        } else {
          console.warn('[image-gen] generation completed without output url', task);
          // 只有 run 0（任务句柄的归属者）且尚无任何成功时才终结 loading——
          // 非首个任务先「无 URL 完成」不能把还在跑的整体 loading 提前掐掉。
          if (runIndex === 0 && completedUrls.length === 0) {
            updateNodeData(id, { isGenerating: false, generationStartedAt: null });
          }
        }
      } catch (error) {
        console.error('[image-gen] generation failed', error);
        // 已有同批其它图完成（主图已落）时不覆盖成功态为错误——部分失败只
        // 影响画册张数。
        if (completedUrls.length > 0) return;
        // 任务仲裁（stale / shouldWrite）只对 run 0 有意义：节点上只持久化了
        // run 0 的任务句柄，其余 run 的 taskKey 必然对不上，套用仲裁会把
        // 它们的失败全部误判为「过期任务」而静默吞掉。
        if (runIndex === 0) {
          const latestNodeData = (useCanvasStore
            .getState()
            .nodes
            .find((node) => node.id === id)?.data ?? {}) as Record<string, unknown>;
          if (
            taskKey
            && isStaleGenerationTask({ nodeData: latestNodeData, taskKey })
          ) return;
          if (
            taskKey
            && !shouldWriteGenerationError({ nodeData: latestNodeData, taskKey, error })
          ) {
            updateNodeData(id, { isGenerating: false, generationStartedAt: null });
            return;
          }
        }
        // Persist the failure on the node so it stays visible until the next
        // submit — the request id is the handle support uses to trace it.
        // 只有 run 0 失败才终结 loading：非首 run 失败时 run 0 可能还在跑，
        // 它的成功补丁会清掉这里写的错误横幅。
        const rawErrorMessage =
          error instanceof Error && error.message
            ? error.message
            : String(error || t('common.error'));
        const displayErrorMessage = backendErrorToastMessage(error, t);
        updateNodeData(id, {
          ...(runIndex === 0
            ? { isGenerating: false, generationStartedAt: null }
            : {}),
          generationError: displayErrorMessage,
          // Keep the complete task/provider error for support copy. Only the
          // concise provider `message` is rendered on the node.
          generationErrorDetails: rawErrorMessage,
          generationErrorRequestId: extractRequestId(rawErrorMessage),
        });
        // Re-throw so the caller can surface a single error dialog after all
        // concurrent attempts settle (rather than one dialog per failed image).
        throw error;
      }
    };

    await Promise.allSettled(
      Array.from({ length: total }, (_, runIndex) => runOne(runIndex)),
    );
    // 全部尘埃落定后撤掉占位（失败的任务不留空槽，画册按实际完成数收口）。
    setAlbumPendingTotal(id, 0);
    // Backend records each attempt (success or failure); pull the new entries.
    // Failures are surfaced directly on the failing node (request-id banner),
    // set per-target inside runOne's catch — no global modal.
    void refreshHistory();
    } finally {
      submittingRef.current = false;
    }
  }, [
    aspectRatio,
    canAutoCommitOnGenerate,
    canvasId,
    selectedModel,
    cameraSelection,
    count,
    effectiveCount,
    id,
    isImage2,
    modelId,
    orderedReferenceUrls,
    prompt,
    projectId,
    quality,
    size,
    styleTemplateId,
    submitDisabled,
    shouldInlineUpstreamTextAsPrompt,
    updateNodeData,
    upstreamTextJoined,
    refreshHistory,
  ]);

  // ===== Step B: 场景资产节点的 "用作背景源" 操作 =====
  // scene_master / scene_reverse_master 节点上的按钮 → 打开 BackgroundCropperDialog
  // → 用户选择截图比例和区域 → 生成当前背景候选节点 → 自动 commit 主线。
  // 用户明确要求 \"不全用 master/reverse,要截图\" — 所以走 cropper 路径,不是
  // 直接 PATCH anchor (旧实现已替换)。
  // Step C: director_combined 节点上的「打开导演世界」按钮使用
  // ai-anime-fe 内置同源 viewer,不跳旧外部导演台。
  const sourceMeta = (freezoneSource?.meta ?? {}) as Record<string, unknown>;
  const sourceEpisode = typeof sourceMeta.episode === "number"
    ? sourceMeta.episode
    : null;
  const sourceBeat = typeof sourceMeta.beat === "number"
    ? sourceMeta.beat
    : null;
  // 平面 source: master / reverse 走 BackgroundCropperDialog (用户选择截图比例和区域)。
  // 360 / 3GS 不走这条 — 它们统一进入 Director World，capture 入口在那里。
  const cropperSourceRoles = new Set(['scene_master', 'scene_reverse_master']);
  const canUseAsBackground = cropperSourceRoles.has(sourceRole);
  const canOpenDirectorStage = sourceRole === "director_combined"
    && sourceEpisode !== null
    && sourceBeat !== null;
  const [bgCropperOpen, setBgCropperOpen] = useState(false);
  const [directorStageBusy, setDirectorStageBusy] = useState(false);
  const [directorStageOpen, setDirectorStageOpen] = useState(false);
  const [directorStageManifest, setDirectorStageManifest] = useState<DirectorStageManifest | null>(null);
  // 从 canvas metadata 拿到当前镜头的 episode/beat 定位信息 (selectedBackground 在
  // beat preset 里 emit 时跟 beat-scope 节点同步,但本节点 (scene_master 等) 来自
  // _add_scene_refs 没带 episode/beat meta — 从 canvas metadata.preset 兜底)。
  const canvasMetaForBeat = getFreezoneCanvasMetadata();
  const canvasPresetMeta = (canvasMetaForBeat?.preset as
    | { episode?: number; beat?: number }
    | undefined) ?? undefined;
  const effectiveEpisode = sourceEpisode ?? canvasPresetMeta?.episode ?? null;
  const effectiveBeat = sourceBeat ?? canvasPresetMeta?.beat ?? null;

  useEffect(() => {
    if (!shouldInlineUpstreamTextAsPrompt) return;
    if (isComposingRef.current) return;
    if (hasUserEditedPromptRef.current) return;
    if (externalPrompt.trim().length > 0) return;
    const nextPrompt = upstreamTextJoined.trim();
    if (!nextPrompt) return;
    setPromptDraft(nextPrompt);
  }, [
    externalPrompt,
    shouldInlineUpstreamTextAsPrompt,
    upstreamTextJoined,
  ]);

  const handleOpenDirectorStageInline = useCallback(async () => {
    if (!canOpenDirectorStage) return;
    if (!projectId || effectiveEpisode === null || effectiveBeat === null) return;
    setDirectorStageBusy(true);
    try {
      const manifest = await getCanvasBeatDirectorManifest({
        projectId,
        episode: effectiveEpisode,
        beat: effectiveBeat,
      });
      setDirectorStageManifest(manifest);
      setDirectorStageOpen(true);
    } catch (err) {
      console.error('[director-stage] manifest fetch failed', err);
    } finally {
      setDirectorStageBusy(false);
    }
  }, [canOpenDirectorStage, effectiveBeat, effectiveEpisode, projectId]);

  const handleDirectorCaptureCombined = useCallback(
    async (blob: Blob, meta: ImageGenDirectorCaptureMeta) => {
      if (!projectId || effectiveEpisode === null || effectiveBeat === null) {
        throw new Error('缺少项目或镜头上下文');
      }

      let imageUrl = meta.controlFrameUrl
        ?? meta.controlFrameBundle?.urls?.combined
        ?? '';
      if (!imageUrl) {
        const uploaded = await uploadCanvasAsset(
          projectId,
          blob,
          `director_combined_${Date.now()}.png`,
          { disableTimeout: true },
        );
        imageUrl = uploaded.url;
      }

      const nextBundle = meta.controlFrameBundle ?? data.director_control_bundle;

      updateNodeData(id, {
        imageUrl,
        previewImageUrl: withImageCacheBust(imageUrl, Date.now()),
        ...(nextBundle ? { director_control_bundle: nextBundle } : {}),
        committed_at: new Date().toISOString(),
        committed_slot_url: imageUrl,
        slot_target: {
          kind: 'director_render',
          episode: effectiveEpisode,
          beat: effectiveBeat,
        },
      });
      publishCanvasAssetsUpdated();
    },
    [
      data.director_control_bundle,
      effectiveBeat,
      effectiveEpisode,
      id,
      projectId,
      updateNodeData,
    ],
  );

  const handlePreviewImageLoad = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const naturalWidth = event.currentTarget.naturalWidth;
      const naturalHeight = event.currentTarget.naturalHeight;
      if (naturalWidth > 0 && naturalHeight > 0) {
        setNaturalSize((previous) =>
          previous &&
          previous.width === naturalWidth &&
          previous.height === naturalHeight
            ? previous
            : { width: naturalWidth, height: naturalHeight },
        );
      }
      const forceNaturalSize = shouldForceNaturalImageSize(
        data as Record<string, unknown>,
      );
      if (data.isSizeManuallyAdjusted === true && !forceNaturalSize) return;
      const nextAspectRatio = aspectRatioFromImageDimensions(
        naturalWidth,
        naturalHeight,
      );
      if (!nextAspectRatio) return;
      const nextSize = resolveMinEdgeFittedSize(nextAspectRatio, {
        minWidth: IMAGE_GEN_NODE_MIN_WIDTH,
        minHeight: IMAGE_GEN_NODE_MIN_HEIGHT,
      });
      const displaySizeMismatch =
        Math.abs(resolvedWidth - nextSize.width) > 1 ||
        Math.abs(resolvedHeight - nextSize.height) > 1;
      if (nextAspectRatio !== data.aspectRatio || displaySizeMismatch) {
        updateNodeSize(id, nextSize, {
          lockManualSize: forceNaturalSize ? false : undefined,
          data: {
            aspectRatio: nextAspectRatio,
            imageNaturalWidth: naturalWidth,
            imageNaturalHeight: naturalHeight,
            imageAspectRatioUpdatedAt: Date.now(),
          },
        });
      }
    },
    [data, id, resolvedHeight, resolvedWidth, updateNodeSize],
  );

  const handleConfirmBackgroundCrop = useCallback(
    async (blob: Blob, filename: string) => {
      if (effectiveEpisode === null || effectiveBeat === null) return;
      await uploadAndAutoCommitSelectedBackgroundCandidate(
        projectId,
        { episode: effectiveEpisode, beat: effectiveBeat },
        blob,
        filename,
        {
          sourceNodeId: id,
          label: t('viewer.threeD.selectedBackgroundOutputLabel'),
          successMessage: t(
            'viewer.threeD.selectedBackgroundCommitSuccess',
            {
              episode: effectiveEpisode,
              beat: effectiveBeat,
            },
          ),
        },
      );
    },
    [effectiveBeat, effectiveEpisode, id, projectId, t],
  );

  // 视觉态从 4 个 derived flag 派生(see mainlineNodeFlags):
  //   preset_locked      — preset_managed === true:amber 实线 + lock badge
  //   candidate_pushable — user_spawned + slot_target:amber 虚线 + push badge
  //   context_only       — 有 mainline_context 但无 slot_target:cyan 细线 + context chip
  //   ordinary           — 都没有:默认白色 border
  //
  const mainlineFlags = useMemo(
    () => nodeMainlineFlags({ data, id, type: 'imageGenNode', position: { x: 0, y: 0 } } as never),
    [data, id],
  );
  const visualState = mainlineNodeVisualState(mainlineFlags);
  const mainlineCanvasReadonly = mainlineFlags.isPresetManaged && !canAutoCommitOnGenerate;
  const cardToneClass = (() => {
    switch (visualState) {
      case 'preset_locked':
        return canvasNodeFrameClass({ selected, mainline: true });
      case 'candidate_pushable':
        return canvasNodeFrameClass({ selected, mainline: true, dashed: true });
      case 'context_only':
        return canvasNodeFrameClass({ selected, mainline: true });
      case 'ordinary':
      default:
        return canvasNodeFrameClass({ selected });
    }
  })();
  // 画册展开时一并隐藏 OpsPanel——展开瞬间已 setSelectedNode(null)，这里再兜
  // 一道，防止展开后用户点节点重新选中时面板叠到宫格上。
  const showImageOpsPanel =
    selected && !isBoxSelecting && !hasActiveOverlay && !mainlineCanvasReadonly && !albumExpanded;


  return {
    id,
    data,
    selected,
    t,
    isBoxSelecting,
    hasActiveOverlay,
    updateNodeData,
    setSelectedNode,
    prompt,
    promptEditorRef,
    isComposingRef,
    hasUserEditedPromptRef,
    setPromptDraft,
    aspectRatio,
    size,
    quality,
    count,
    canAutoCommitOnGenerate,
    isGenerating,
    generationError,
    generationErrorDetails,
    generationErrorRequestId,
    cameraSelection,
    styleTemplateId,
    referenceImageUrl,
    fileInputRef,
    isUploading,
    isTranslatingPrompt,
    errorDetailsCopied,
    handleCopyErrorDetails,
    historyRecords,
    historyLoading,
    refreshHistory,
    historyPreviewUrl,
    setHistoryPreviewUrl,
    handleRestoreHistory,
    modelId,
    imageModelMode,
    isImage2,
    totalCreditCostDisplay,
    cameraSummary,
    selectedStyle,
    upstreamImageContents,
    upstreamTextContents,
    upstreamTextJoined,
    candidateBindingRoles,
    isConnected,
    mentionCandidates,
    insertContextPaletteEntry,
    handleDetachUpstream,
    isAssetLibraryOpen,
    setIsAssetLibraryOpen,
    spawnAssetLibraryReferences,
    refHover,
    setRefHover,
    refPreviewStyle,
    resolvedTitle,
    resolvedWidth,
    resolvedHeight,
    panelExpanded,
    setPanelExpanded,
    stylePickerOpen,
    setStylePickerOpen,
    panelHeight,
    panelWidth,
    previewUrl,
    visiblePreviewUrl,
    hasGeneratedResult,
    naturalSize,
    albumRootRef,
    albumPointerDownPosRef,
    albumExpanded,
    albumUrls,
    albumTotalSlots,
    albumPendingTotal,
    albumPendingCount,
    hasAlbum,
    handleSetAlbumMainImage,
    handleToggleAlbumExpanded,
    handleApplyAlbumImageToCanvas,
    handleDownloadAlbumImage,
    handlePickFile,
    handleUploadFile,
    handleClearReference,
    handleSpawnUpstreamImage,
    handleTranslatePrompt,
    submitDisabled,
    handleSubmit,
    sourceRole,
    canUseAsBackground,
    canOpenDirectorStage,
    bgCropperOpen,
    setBgCropperOpen,
    directorStageBusy,
    directorStageOpen,
    setDirectorStageOpen,
    directorStageManifest,
    effectiveEpisode,
    effectiveBeat,
    handleOpenDirectorStageInline,
    handleDirectorCaptureCombined,
    handlePreviewImageLoad,
    handleConfirmBackgroundCrop,
    cardToneClass,
    showImageOpsPanel,
    projectId,
  };
}

export type ImageGenNodeController = ReturnType<
  typeof useImageGenNodeController
>;
