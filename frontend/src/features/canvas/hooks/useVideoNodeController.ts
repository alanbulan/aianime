// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import {
  composeVideoNodePrompt,
  countVideoUpstreamMedia,
  countVideoUpstreamNodeTypes,
  hasVideoNodeGenerationError,
  planVideoAssetReferences,
  planVideoFrameSources,
  projectVideoReferenceMedia,
  resolveVideoFrameSeekSeconds,
  resolveVideoNodeAspectRatio,
  resolveVideoNodeDimensions,
  resolveVideoNodeDisplayedRect,
  resolveVideoNodeModel,
  resolveVideoNodePosterSource,
  resolveVideoNodeSource,
  resolveVideoNodeSubmitAspectRatio,
  videoNodeAlbumUrls,
  VIDEO_NODE_DEFAULT_HEIGHT,
  VIDEO_NODE_DEFAULT_WIDTH,
  VIDEO_NODE_OPERATIONS_PANEL_HEIGHT,
  VIDEO_NODE_OPERATIONS_PANEL_OVERHANG,
} from '@/features/canvas/application/videoNodeModel';
import {
  extractUpstreamContent,
  joinUpstreamText,
} from '@/features/canvas/application/graphContentResolver';
import { useCanvasStore } from '@/features/canvas/canvasStore';
import {
  captureVideoFrameBlob,
  ensureWebSafeVideo,
  rememberLastVideoModel,
  showErrorDialog,
  uploadCanvasAsset,
  useIsBoxSelecting,
  useUpstreamNodes,
} from '@/features/canvas/composition';
import {
  CANVAS_NODE_TYPES,
  isAudioNode,
  type VideoGenCount,
  type VideoNodeData,
} from '@/features/canvas/domain/canvasNodes';
import {
  canvasEventBus,
  resolveNodeDisplayName,
} from '@/modules/creative_canvas/public';
import {
  setAlbumPendingTotal,
  useAlbumPendingTotal,
} from '@/features/canvas/nodes/shared/albumPendingTotals';
import {
  type ContextPromptPaletteEntry,
  contextPromptPaletteInsertionText,
} from '@/features/canvas/nodes/contextPromptPalette';
import type {
  MentionCandidate,
  PromptMentionEditorHandle,
} from '@/features/canvas/nodes/PromptMentionEditor';
import {
  sortUpstreamByReferenceOrder,
  upstreamNodesInEdgeOrder,
} from '@/modules/creative_canvas/public';
import { useReferenceMentionSync } from '@/features/canvas/nodes/useReferenceMentionSync';
import type { VideoElementMetadata } from '@/modules/creative_canvas/public';
import {
  CAMERA_MOVEMENT_PRESETS,
  DEFAULT_VIDEO_DURATION_SEC,
  VIDEO_FILE_ACCEPT,
  buildVideoMetadataPatch,
  captureBrowserVideoFrameStrip,
  clampVideoDuration,
  classifyVideoReferenceItems,
  composeVideoClip,
  completeVideoGenerationTask,
  defaultSceneOptimizeForModel,
  eraseVideoSubtitles,
  findCameraMovementPreset,
  generationTaskDescriptor,
  hasMainlineContexts,
  historyRecordOutputUrl,
  isVideoFile,
  isVideoModeSupportedByModel,
  normalizeSceneOptimize,
  normalizeVideoQuality,
  resolveBrowserDroppedVideoFile,
  resolveErrorContent,
  resolveGenerationErrorDiagnostics,
  qualityToResolution,
  referenceImageUrl,
  referenceVideoUrl,
  resolveAudioReferenceDisplayName,
  resolveImageDisplayUrl,
  sceneOptimizeOptionsForModel,
  submitVideoGeneration,
  supportedVideoModesForModel,
  submittableImageUrl,
  translateCanvasText,
  useCanvasVideoCameraTemplates,
  useCanvasVideoModels,
  useNodeGenerationHistory,
  useNodeGenerationTaskState,
  videoDurationBoundsForModel,
  videoModelReferenceDisabledReason,
  videoModelUsesTypedReferenceModes,
  videoQualityOptionsForModel,
  videoReferenceCapsForMode,
  validateVideoReferenceAudioDuration,
  resolveVideoGenerationModeOptions,
  type CanvasAssetLibrarySelection,
  type CanvasGenerationHistoryRecord,
  type CameraMovementPreset,
  type VideoGenMode,
  type VideoGenerationReference,
  type VideoReferenceCapEntry,
} from '@/modules/creative_canvas/public';
import { formatCreditCost } from '@/components/credits/credit-visual';
import { useGenerationCreditCost } from '@/modules/model_usage/public';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { downloadUrlAsFile } from '@/lib/browserDownload';
import { backendErrorToastMessage } from '@/shared/api/errors';

export interface VideoNodeControllerOptions {
  id: string;
  data: VideoNodeData;
  selected?: boolean;
  width?: number;
  height?: number;
  projectId: string;
  canvasId: string;
}

export function useVideoNodeController({
  id,
  data,
  selected,
  width,
  height,
  projectId,
  canvasId,
}: VideoNodeControllerOptions) {
  const { t } = useTranslation();
  const updateNodeInternals = useUpdateNodeInternals();
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const isBoxSelecting = useIsBoxSelecting();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const addDerivedUploadNode = useCanvasStore(
    (state) => state.addDerivedUploadNode,
  );
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const deleteEdge = useCanvasStore((state) => state.deleteEdge);
  const setActiveOverlayNodeId = useCanvasStore(
    (state) => state.setActiveOverlayNodeId,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // 在途守卫：持到本批所有并发任务 allSettled 才释放（见 handleSubmit）。
  const submittingRef = useRef(false);
  // Mirror the actual video element into state so VideoPlayerControls 能
  // 在挂载/卸载时重新订阅事件（仅 ref 不会触发重渲染）。同时保留可写的
  // ref，给非 React 路径（capture frame 之类）继续用 .current。
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const setVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);
  const transientUrlRef = useRef<string | null>(null);
  const [transientPreviewUrl, setTransientPreviewUrl] = useState<
    string | null
  >(null);
  const [isCapturingFrame, setIsCapturingFrame] = useState(false);
  const [isTranslatingPrompt, setIsTranslatingPrompt] = useState(false);
  const [isCharacterLibraryOpen, setIsCharacterLibraryOpen] = useState(false);
  const [isComposingClip, setIsComposingClip] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);

  // 每节点生成历史：仅在节点被选中时拉取，避免画布上每个视频节点都各发一次
  // 请求。生成完成后调用 refreshHistory 把新记录拉进来。
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

  // 生成进行中时，点击历史记录走「非破坏性预览」：不覆写 videoUrl、不打断在途
  // 任务，仅把这条历史视频临时显示在主体上（见 isGenerating 渲染分支）。新视频
  // 生成完成后由下方 effect 自动清空，回到最新结果。非生成态恢复历史时也清掉它。
  const [historyPreviewUrl, setHistoryPreviewUrl] = useState<string | null>(
    null,
  );

  const prompt = typeof data.prompt === "string" ? data.prompt : "";
  // Local draft + composition guard so IME (中文输入法) candidates stop being
  // wiped by the store-driven re-render. Same fix pattern as
  // `docs/changes/2026-05-12-image-gen-ime-fix.md`.
  const [promptDraft, setPromptDraft] = useState(prompt);
  const isComposingRef = useRef(false);
  const promptEditorRef = useRef<PromptMentionEditorHandle | null>(null);
  useEffect(() => {
    if (isComposingRef.current) return;
    setPromptDraft(prompt);
  }, [prompt]);

  // 「上下文调色盘」：与图生节点同款，把镜头里人物/道具的标记颜色快速插进提示词。
  // palette 的全量 nodes/edges 订阅下沉到 NodeContextPromptPaletteButton，避免本节点
  // 为它订阅整图、被任意节点拖动牵连重渲染。插入直接走编辑器命令式 API：弹层与编辑器
  // 同在面板里、编辑器恒已挂载，故回调无需依赖 prompt（保持稳定引用）。
  const insertContextPaletteEntry = useCallback(
    (entry: ContextPromptPaletteEntry) => {
      promptEditorRef.current?.insertTextAtCursor(
        contextPromptPaletteInsertionText(entry),
      );
    },
    [],
  );
  const genMode: VideoGenMode = data.genMode ?? "textToVideo";
  const {
    models: availableVideoModels,
    isLoading: videoModelsLoading,
  } = useCanvasVideoModels(projectId);
  // Reconcile persisted ids against the live catalog so the displayed model
  // and submitted SKU remain identical after catalog changes.
  const selectedVideoModel = useMemo(
    () => resolveVideoNodeModel(availableVideoModels, data.model),
    [availableVideoModels, data.model],
  );
  const modelId = selectedVideoModel?.id ?? "";
  const supportedVideoModes = supportedVideoModesForModel(selectedVideoModel);
  const usesTypedReferenceModes =
    videoModelUsesTypedReferenceModes(selectedVideoModel);
  // aspectRatio 只认合法的比例预设（含 "auto"）；历史上曾被写成像素串(如
  // "1248:704")的旧节点在这里吸附到最接近的合法视频比例，保证 chip 显示干净。
  const aspectRatio = resolveVideoNodeAspectRatio(data.aspectRatio);
  const submitAspectRatio = resolveVideoNodeSubmitAspectRatio(
    data,
    aspectRatio,
  );
  const qualityOptions = useMemo(
    () => videoQualityOptionsForModel(selectedVideoModel),
    [selectedVideoModel],
  );
  const quality = normalizeVideoQuality(data.quality, qualityOptions);
  const durationBounds = useMemo(
    () => videoDurationBoundsForModel(selectedVideoModel),
    [selectedVideoModel],
  );
  const durationSec = clampVideoDuration(
    typeof data.durationSec === "number"
      ? data.durationSec
      : DEFAULT_VIDEO_DURATION_SEC,
    durationBounds,
  );
  const sceneOptimizeOptions = useMemo(
    () => sceneOptimizeOptionsForModel(selectedVideoModel),
    [selectedVideoModel],
  );
  const sceneOptimize = normalizeSceneOptimize(
    data.sceneOptimize,
    sceneOptimizeOptions,
    defaultSceneOptimizeForModel(selectedVideoModel),
  );
  const generateAudio = Boolean(data.generateAudio);
  const supportsHumanReview = selectedVideoModel?.supportsHumanReview === true;
  const maxReferenceAudioDurationMs =
    typeof selectedVideoModel?.maxReferenceAudioDurationSeconds === "number"
      ? selectedVideoModel.maxReferenceAudioDurationSeconds * 1000
      : null;
  const maxReferenceImages = selectedVideoModel?.maxReferenceImages ??
    (usesTypedReferenceModes ? 5 : 9);
  const maxReferenceVideos = selectedVideoModel?.maxReferenceVideos ?? 3;
  const maxReferenceAudios = selectedVideoModel?.maxReferenceAudios ?? 3;
  const maxReferenceTotal = selectedVideoModel?.maxReferenceTotal ?? 12;
  const humanReview = Boolean(data.humanReview);
  const count: VideoGenCount = (data.count ?? 1) as VideoGenCount;
  useEffect(() => {
    const patch: Partial<VideoNodeData> = {};
    if (data.quality !== quality) {
      patch.quality = quality;
    }
    if (data.durationSec !== durationSec) {
      patch.durationSec = durationSec;
    }
    if (Object.keys(patch).length > 0) {
      updateNodeData(id, patch);
    }
  }, [
    data.durationSec,
    data.quality,
    durationSec,
    id,
    quality,
    updateNodeData,
  ]);
  const videoModelForCost =
    videoModelsLoading
      ? null
      : (selectedVideoModel?.apiModel ?? null);
  // Debounce the cost-estimate inputs: dragging the duration slider (and,
  // to a lesser degree, flipping count/quality/model) churns the query key
  // and TanStack Query aborts each in-flight request, spraying "Canceled"
  // rows across the Network tab. Coalesce to one request once the params
  // settle (~350ms). Primitives only — see useDebouncedValue's contract.
  const debouncedModel = useDebouncedValue(videoModelForCost, 350);
  const debouncedQuality = useDebouncedValue(quality, 350);
  const debouncedCount = useDebouncedValue(count, 350);
  const debouncedDurationSec = useDebouncedValue(durationSec, 350);
  const videoCreditCost = useGenerationCreditCost(
    "video_model",
    debouncedModel,
    {
      surface: "canvas",
      params: { resolution: qualityToResolution(debouncedQuality) },
      quantity: Math.min(Math.max(debouncedCount, 1), 4) * debouncedDurationSec,
    },
  );
  const totalCreditCostDisplay = useMemo(() => {
    const total = videoCreditCost.data?.data.cost;
    if (typeof total !== "number") return null;
    return formatCreditCost(total);
  }, [videoCreditCost.data?.data.cost]);
  const cameraMovementId =
    typeof data.cameraMovement === "string" ? data.cameraMovement : null;
  // Pull the camera-template catalog from `/freezone/video/camera-templates`.
  // Fall back to the bundled `CAMERA_MOVEMENT_PRESETS` while loading or if the
  // backend is unreachable so the chip never goes blank.
  const cameraTemplatesQuery = useCanvasVideoCameraTemplates(projectId);
  const cameraTemplates = useMemo<ReadonlyArray<CameraMovementPreset>>(
    () =>
      cameraTemplatesQuery.templates.length > 0
        ? cameraTemplatesQuery.templates
        : CAMERA_MOVEMENT_PRESETS,
    [cameraTemplatesQuery.templates],
  );
  const cameraTemplatesLoading = cameraTemplatesQuery.isLoading;
  const cameraMovementPreset = useMemo(
    () => findCameraMovementPreset(cameraTemplates, cameraMovementId),
    [cameraTemplates, cameraMovementId],
  );
  const { isGenerating } = useNodeGenerationTaskState(data);
  const generationError =
    typeof data.generationError === 'string' ? data.generationError.trim() : '';
  // Only treat as a failure-state once generation has stopped and produced no
  // video — a stale error must never hide a successfully generated clip.
  const hasGenerationError = hasVideoNodeGenerationError({
    isGenerating,
    videoUrl: data.videoUrl,
    generationError,
  });
  const generationErrorRequestId =
    typeof data.generationErrorRequestId === "string" && data.generationErrorRequestId
      ? data.generationErrorRequestId
      : "";

  // 生成结束（成功/失败）后清掉临时历史预览，让主体回到最新结果。
  useEffect(() => {
    if (!isGenerating) setHistoryPreviewUrl(null);
  }, [isGenerating]);

  const handleRestoreHistory = useCallback(
    (record: CanvasGenerationHistoryRecord) => {
      const url = historyRecordOutputUrl(record);
      if (!url) return;
      // 生成进行中：仅做非破坏性预览，绝不动 videoUrl，也不打断在途任务。
      if (isGenerating) {
        setHistoryPreviewUrl(url);
        return;
      }
      setHistoryPreviewUrl(null);
      updateNodeData(id, {
        videoUrl: url,
        isGenerating: false,
        generationStartedAt: null,
        sourceFileName: null,
        generationError: null,
        generationErrorDetails: null,
        generationErrorRequestId: null,
        // 恢复单条历史结果时旧批次画册已与主视频脱钩——一并清掉。
        generationBatch: null,
      });
    },
    [id, isGenerating, updateNodeData],
  );

  // ------ upstream reference images ----------------------------------------
  // Anything connected via target → this video node that has an image url
  // shows up as a thumbnail chip next to the camera/role/marker chips. Ordered
  // by connection order (later-referenced after earlier), with manual
  // referenceOrder taking precedence — see sortUpstreamByReferenceOrder.
  // Subscribe to ONLY this node's one-hop upstream (not the whole nodes array)
  // so dragging unrelated nodes doesn't re-render this node. See useUpstreamGraph.
  const upstreamNodes = useUpstreamNodes(id);
  // 节点被连线（存在入边）后：隐藏「试试」CTA，只在节点中间显示一个图标（对齐 libtv）。
  const isConnected = useCanvasStore((state) =>
    state.edges.some((edge) => edge.target === id)
  );
  const sortedUpstreamNodes = useMemo(
    () =>
      sortUpstreamByReferenceOrder(
        upstreamNodes,
        data.referenceOrder,
      ),
    [data.referenceOrder, upstreamNodes],
  );
  const referenceImages = useMemo(
    () =>
      sortedUpstreamNodes
        .map((node) => {
          const url = referenceImageUrl(node);
          return url ? { nodeId: node.id, url } : null;
        })
        .filter(
          (entry): entry is { nodeId: string; url: string } => entry !== null,
        ),
    [sortedUpstreamNodes],
  );

  // 统一的「图 / 视 / 音」上游引用条目，给 chips 行用。顺序按连接顺序
  // （与 referenceImages 同步），让 chip 编号 1/2/3... 跟可视顺序一致。
  // text 上游不进这一行 —— 上面已经单独渲染了「@文本 chip」。
  const referenceMedia = useMemo(
    () => projectVideoReferenceMedia(sortedUpstreamNodes),
    [sortedUpstreamNodes],
  );

  // 提示词里的 @图片N / @音频N 必须随「角色库」连线引用实时对应：删除 / 重排 /
  // 新增引用时角色库会重新编号（删掉图片1 后原图片2 变图片1），这里把 prompt 里的
  // mention 数字一并重写，被删引用的 mention 则移除。按「上一帧有序 id ↔ 这一帧有序
  // id」差分，覆盖所有删边路径（detach 按钮 / 双击断开 / Delete 键）与手动重排。
  const orderedImageIds = useMemo(
    () =>
      referenceMedia
        .filter((item) => item.kind === "image")
        .map((item) => item.nodeId),
    [referenceMedia],
  );
  const orderedVideoIds = useMemo(
    () =>
      referenceMedia
        .filter((item) => item.kind === "video")
        .map((item) => item.nodeId),
    [referenceMedia],
  );
  const orderedAudioIds = useMemo(
    () =>
      referenceMedia
        .filter((item) => item.kind === "audio")
        .map((item) => item.nodeId),
    [referenceMedia],
  );
  const applyPromptRemap = useCallback(
    (next: string) => updateNodeData(id, { prompt: next }),
    [id, updateNodeData],
  );
  useReferenceMentionSync(
    prompt,
    [
      { prefix: "图片", ids: orderedImageIds },
      { prefix: "视频", ids: orderedVideoIds },
      { prefix: "音频", ids: orderedAudioIds },
    ],
    applyPromptRemap,
  );

  const referenceMediaCaps = videoReferenceCapsForMode(genMode);
  const referenceMediaCapInfo = useMemo<VideoReferenceCapEntry[]>(
    () => classifyVideoReferenceItems(referenceMedia, genMode),
    [referenceMedia, genMode],
  );

  // @ 提及候选 —— 图片、音频都可引用，但编号按 *各自类型* 的序号走，
  // *不* 按行内混合位置。后端按上传的图片数量来对应 图片N，若用混合位置编号
  // （音频排第一时图片就成了「图片2」），后端只看到 1 张图却被要求引用图片2
  // 会报错。所以图片用图片序号、音频用音频序号，各自独立计数。
  //
  // 存在领域 cap 的模式（当前是 allReference / firstLastFrame），超过 cap 的
  // 条目不能进 @ 候选 —— 服务端会直接丢弃，留
  // 在候选里只会让用户选了之后被静默忽略。其它模式（imageReference 等）各自
  // 已有提交时 `.slice(0, N)` 兜底，本次不动。
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const out: MentionCandidate[] = [];
    let imageIdx = 0;
    let videoIdx = 0;
    let audioIdx = 0;
    const enforceCap = referenceMediaCaps != null;
    for (const info of referenceMediaCapInfo) {
      const item = info.item;
      if (item.kind === "image") {
        imageIdx += 1;
        if (enforceCap && !info.withinCap) continue;
        out.push({
          key: item.nodeId,
          name: `图片${imageIdx}`,
          imageUrl: resolveImageDisplayUrl(item.imageUrl),
          index: imageIdx,
        });
      } else if (item.kind === "video") {
        videoIdx += 1;
        if (enforceCap && !info.withinCap) continue;
        out.push({
          key: item.nodeId,
          name: `视频${videoIdx}`,
          imageUrl: item.thumbUrl ? resolveImageDisplayUrl(item.thumbUrl) : "",
          videoUrl: resolveImageDisplayUrl(item.videoUrl),
          index: videoIdx,
        });
      } else if (item.kind === "audio") {
        audioIdx += 1;
        if (enforceCap && !info.withinCap) continue;
        out.push({
          key: item.nodeId,
          name: `音频${audioIdx}`,
          imageUrl: "",
          index: audioIdx,
          audioUrl: resolveImageDisplayUrl(item.audioUrl),
          displayName: resolveAudioReferenceDisplayName(
            item,
            typeof window !== "undefined"
              ? window.location.origin
              : "http://localhost",
          ),
        });
      }
    }
    return out;
  }, [referenceMediaCapInfo, referenceMediaCaps]);

  // 取消关联某个上游素材：删掉「该上游节点 → 本节点」的连线。collectInputContents
  // 只走一跳，item.nodeId 就是直接相连的上游节点，可精确定位要删的边。
  const handleDetachUpstream = useCallback(
    (sourceNodeId: string) => {
      useCanvasStore
        .getState()
        .edges.filter((edge) => edge.source === sourceNodeId && edge.target === id)
        .forEach((edge) => deleteEdge(edge.id));
    },
    [id, deleteEdge],
  );

  // 通用上游遍历：拿到所有上游节点的 text/imageUrl/videoUrl/audioUrl 统一视图。
  // 视频生成只用其中的 text 字段拼接到 prompt 前面；image/video/audio 仍走
  // 各自分支已有的分类逻辑（带 backend 上限校验）。
  const upstreamContents = useMemo(
    () => upstreamNodes.map(extractUpstreamContent),
    [upstreamNodes],
  );
  const upstreamTextContents = useMemo(
    () =>
      upstreamContents.filter(
        (c) => typeof c.text === "string" && c.text.trim().length > 0,
      ),
    [upstreamContents],
  );
  const upstreamTextJoined = useMemo(
    () => joinUpstreamText(upstreamContents),
    [upstreamContents],
  );

  // Count upstream resources by media type. Drives the disable rules on the
  // tab row — e.g. 图生视频 only makes sense with images (no upstream videos),
  // 首尾帧 caps at 2 images.
  const upstreamCounts = useMemo(
    () => countVideoUpstreamMedia(upstreamNodes),
    [upstreamNodes],
  );
  // Typed-reference modes use node types so an empty upstream image node can
  // select a compatible mode before its media is generated.
  const upstreamTypeCounts = useMemo(
    () => countVideoUpstreamNodeTypes(upstreamNodes),
    [upstreamNodes],
  );
  const generationModeOptions = useMemo(
    () =>
      resolveVideoGenerationModeOptions({
        supportedModes: supportedVideoModes,
        usesTypedReferenceModes,
        // Typed-reference models use node types so empty upstream image nodes
        // can still select a compatible mode before media is generated.
        upstreamCounts: usesTypedReferenceModes
          ? upstreamTypeCounts
          : upstreamCounts,
      }),
    [supportedVideoModes, upstreamCounts, upstreamTypeCounts, usesTypedReferenceModes],
  );
  const isClipMode = Boolean(data.isClipMode);
  const clipStartMs =
    typeof data.clipStartMs === "number" ? data.clipStartMs : null;
  const clipEndMs =
    typeof data.clipEndMs === "number" ? data.clipEndMs : null;
  const durationMs =
    typeof data.durationMs === "number" ? data.durationMs : null;

  const resolvedTitle = useMemo(
    () => resolveNodeDisplayName(CANVAS_NODE_TYPES.video, data),
    [data],
  );
  const {
    width: resolvedWidth,
    height: resolvedHeight,
  } = resolveVideoNodeDimensions(width, height);
  // 收起态浮动面板固定基础尺寸；放大用居中弹窗（见下方 OperationPanelShell）。
  const [panelExpanded, setPanelExpanded] = useState(false);
  const panelHeight = VIDEO_NODE_OPERATIONS_PANEL_HEIGHT;
  const panelOverhang = VIDEO_NODE_OPERATIONS_PANEL_OVERHANG;

  // ── 叠卡画册（count > 1 的一组生成结果，与图片节点同构）──
  // 收拢时主视频后探出 N-1 张卡片边；hover 出现右上角数量徽标，点开展开成
  // 宫格画册。展开态点视频设为主视频、可单独「应用到画布」/ 下载。
  const albumRootRef = useRef<HTMLDivElement | null>(null);
  const [albumExpanded, setAlbumExpanded] = useState(false);
  // 本次会话内"应到条数"——未完成的在画册里占位。存模块级登记表而非组件
  // state：onlyRenderVisibleElements 下平移出视口会卸载组件，state 会丢。
  const albumPendingTotal = useAlbumPendingTotal(id);
  const albumUrls = useMemo(
    () => videoNodeAlbumUrls(data.generationBatch),
    [data.generationBatch],
  );
  const albumTotalSlots = Math.max(albumUrls.length, albumPendingTotal);
  const albumPendingCount = Math.max(0, albumPendingTotal - albumUrls.length);
  const hasAlbum = albumTotalSlots > 1;

  // 画册展开期间注册为本节点的 activeOverlay：外部 action 工具条 / 替换素材
  // 把手 / + 派生按钮都认它让位（拖动重新选中也压得住）。
  useEffect(() => {
    if (!albumExpanded) return;
    setActiveOverlayNodeId(id);
    return () => {
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

  const handleSetAlbumMainVideo = useCallback(
    (url: string) => {
      updateNodeData(id, { videoUrl: url, sourceFileName: null });
      setAlbumExpanded(false);
    },
    [id, updateNodeData],
  );

  // 展开画册时取消节点激活态；必须经 onNodesChange 清 React Flow 自身的
  // selected 标志（只清 store 的 selectedNodeId 会被选中同步 effect 写回）。
  // 副作用放在 setState updater 外面：updater 必须纯（StrictMode 会双调用）。
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

  // 「应用到画布」：把这条视频作为独立视频节点放到展开宫格右侧。连续应用
  // 的落点逐次错开，避免精确叠在同一坐标上只看得见最后一个。
  const albumAppliedCountRef = useRef(0);
  const handleApplyAlbumVideoToCanvas = useCallback(
    (url: string) => {
      const self = useCanvasStore.getState().nodes.find((n) => n.id === id);
      if (!self) return;
      const applyIndex = albumAppliedCountRef.current;
      albumAppliedCountRef.current += 1;
      const position = {
        x: self.position.x + resolvedWidth * 2 + 12 + 48 + applyIndex * 36,
        y: self.position.y + applyIndex * 36,
      };
      const newNodeId = addNode(CANVAS_NODE_TYPES.video, position, {
        videoUrl: url,
        aspectRatio: data.aspectRatio,
        user_spawned: true,
      } as Partial<VideoNodeData>);
      setSelectedNode(newNodeId);
    },
    [addNode, data.aspectRatio, id, resolvedWidth, setSelectedNode],
  );

  const handleDownloadAlbumVideo = useCallback(
    async (url: string, index: number) => {
      try {
        await downloadUrlAsFile(resolveImageDisplayUrl(url), `video-gen-${id}-${index + 1}.mp4`);
      } catch (error) {
        console.error('[video-node] album download failed', error);
      }
    },
    [id],
  );

  const clearTransientPreview = useCallback(() => {
    if (transientUrlRef.current) {
      URL.revokeObjectURL(transientUrlRef.current);
      transientUrlRef.current = null;
    }
    setTransientPreviewUrl(null);
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      if (!isVideoFile(file)) return;
      if (!projectId) {
        console.error("[video-node] missing project context");
        return;
      }
      clearTransientPreview();
      const previewUrl = URL.createObjectURL(file);
      transientUrlRef.current = previewUrl;
      setTransientPreviewUrl(previewUrl);
      updateNodeData(id, { sourceFileName: file.name, isUploading: true });
      try {
        // HEVC（飞书录屏/iPhone）等 Web 不兼容编码先在浏览器内转成 H.264 再上传，
        // 否则 Edge 等无对应解码器的浏览器只有声音没画面。见 videoTranscode.ts。
        // 转码期间 UI 统一走「上传中」loading，不单独显示转码进度。
        const prepared = await ensureWebSafeVideo(file);
        if (prepared.transcoded) {
          // 源编码在本浏览器可能根本解不了（Edge+HEVC），本地预览也换成转码产物。
          clearTransientPreview();
          const preparedUrl = URL.createObjectURL(prepared.file);
          transientUrlRef.current = preparedUrl;
          setTransientPreviewUrl(preparedUrl);
        }
        const uploaded = await uploadCanvasAsset(
          projectId,
          prepared.file,
          prepared.file.name,
          { disableTimeout: true },
        );
        updateNodeData(id, {
          videoUrl: uploaded.url,
          previewImageUrl: null,
          sourceFileName: file.name,
          isUploading: false,
        });
      } catch (error) {
        console.error("[video-node] upload failed", error);
        updateNodeData(id, { isUploading: false });
        clearTransientPreview();
      }
    },
    [clearTransientPreview, id, projectId, updateNodeData],
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) await processFile(file);
      event.target.value = "";
    },
    [processFile],
  );

  const handleDrop = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const file = resolveBrowserDroppedVideoFile(event.dataTransfer);
      if (file) await processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleUploadClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  // Spawn the frame source node(s) to the left of this video node and wire
  // them as inputs. Used by the empty-state "首帧/首尾帧 生成视频" CTAs.
  // 首帧走图片节点（可上传也可直接生图）+ 全能参考；首尾帧仍走上传节点 + 关键帧。
  const spawnFrameUploads = useCallback(
    (mode: 'firstFrame' | 'firstLastFrame') => {
      const state = useCanvasStore.getState();
      const targetNode = state.nodes.find((node) => node.id === id);
      if (!targetNode) return;
      const plan = planVideoFrameSources({
        mode,
        targetNode,
        nodes: state.nodes,
        edges: state.edges,
        prompt,
      });
      const nodeIds = plan.nodes.map((nodePlan) =>
        addNode(nodePlan.type, nodePlan.position, nodePlan.data),
      );
      nodeIds.forEach((nodeId) => addEdge(nodeId, id));
      state.autoGroupSpawn(id, nodeIds, { label: plan.groupLabel });
      updateNodeData(id, plan.videoPatch);
    },
    [addEdge, addNode, id, prompt, updateNodeData],
  );

  // Spawn reference nodes from selected asset-library entries — one per
  // selection, stacked vertically to the left of this video node, then wired
  // as upstream references so they show up in the operations panel. The node
  // type depends on the media: images/videos become upload nodes carrying
  // imageUrl/videoUrl, audio becomes an audio node carrying audioUrl.
  const spawnCharacterLibraryReferences = useCallback(
    (selections: ReadonlyArray<CanvasAssetLibrarySelection>) => {
      if (selections.length === 0) return;
      const state = useCanvasStore.getState();
      const targetNode = state.nodes.find((node) => node.id === id);
      if (!targetNode) return;
      const plans = planVideoAssetReferences({
        selections,
        targetPosition: targetNode.position,
        targetHeight: targetNode.height,
        aspectRatio: data.aspectRatio,
      });
      const nodeIds = plans.map((plan) =>
        addNode(plan.type, plan.position, plan.data),
      );
      nodeIds.forEach((nodeId) => addEdge(nodeId, id));
      state.autoGroupSpawn(id, nodeIds, { label: '资产参考组' });
    },
    [addEdge, addNode, data.aspectRatio, id],
  );

  const handleTranslatePrompt = useCallback(async () => {
    if (isTranslatingPrompt || isGenerating) return;
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return;
    if (!projectId) {
      console.error("[video-node] translate: missing project context");
      return;
    }
    setIsTranslatingPrompt(true);
    try {
      const result = await translateCanvasText({
        projectId,
        text: prompt,
        nodeType: "video",
        canvasId,
        nodeId: id,
      });
      if (result.translatedText) {
        updateNodeData(id, { prompt: result.translatedText });
      }
    } catch (error) {
      console.error("[video-node] translate failed", error);
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
    return canvasEventBus.subscribe("video-node/reupload", ({ nodeId }) => {
      if (nodeId !== id) return;
      inputRef.current?.click();
    });
  }, [id]);

  useEffect(() => {
    return canvasEventBus.subscribe(
      "video-node/external-file",
      ({ nodeId, file }) => {
        if (nodeId !== id || !isVideoFile(file)) return;
        void processFile(file);
      },
    );
  }, [id, processFile]);

  // First time an upstream image becomes available, flip the gen mode so the
  // video actually consumes it. Default to `allReference`（全能参考）—— it
  // accepts 1-9 images and is the more general entry point; the 首尾帧 keyframe
  // workflow stays reachable via the explicit empty-state CTA. Only fires while
  // data.genMode is undefined — once the user picks any tab we respect that.
  // Typed-reference models use the state machine below instead.
  useEffect(() => {
    if (usesTypedReferenceModes) return;
    if (data.genMode != null) return;
    if (referenceImages.length === 0) return;
    updateNodeData(id, { genMode: "allReference" });
  }, [data.genMode, id, referenceImages.length, updateNodeData, usesTypedReferenceModes]);

  // One state machine keeps typed-reference modes aligned with upstream types:
  //   - 上游有视频            → 视频编辑 (videoEdit / video_url)
  //   - 上游图片 >1 张        → 图片参考 (imageReference / reference_images 1-9)
  //   - 上游图片 == 1 张      → 默认首帧 (imageToVideo / image_url)，但尊重用户
  //                             主动切到的「图片参考」
  //   - 无上游                → 文生视频 (textToVideo)
  // 每次都纠正，确保 genMode 不会卡在与当前上游不匹配的模式（否则 submit 时会被
  // 静默截断 / 触发上游互斥报错）。
  useEffect(() => {
    if (!usesTypedReferenceModes) return;
    const { images, videos } = upstreamTypeCounts;
    let target: VideoGenMode;
    if (videos > 0) {
      target = "videoEdit";
    } else if (images > 1) {
      target = "imageReference";
    } else if (images === 1) {
      target = genMode === "imageReference" ? "imageReference" : "imageToVideo";
    } else {
      target = "textToVideo";
    }
    if (genMode !== target) {
      updateNodeData(id, { genMode: target });
    }
  }, [
    genMode,
    id,
    usesTypedReferenceModes,
    upstreamTypeCounts.images,
    upstreamTypeCounts.videos,
    updateNodeData,
  ]);

  // Audio refs only carry meaning under the omni-gen (allReference) path —
  // textToVideo / firstLastFrame / imageToVideo discard them. So when an
  // audio upstream first appears, force the mode to `allReference`. Tracked
  // through a ref so we only fire on the 0 → ≥1 transition; once the user
  // disconnects all audio and reconnects, it fires again.
  const prevHasAudioRef = useRef(false);
  const hasAudioUpstream = useMemo(
    () => referenceMedia.some((item) => item.kind === "audio"),
    [referenceMedia],
  );
  useEffect(() => {
    const prev = prevHasAudioRef.current;
    prevHasAudioRef.current = hasAudioUpstream;
    if (!prev && hasAudioUpstream && data.genMode !== "allReference" && !usesTypedReferenceModes) {
      updateNodeData(id, { genMode: "allReference" });
    }
  }, [data.genMode, hasAudioUpstream, id, updateNodeData, usesTypedReferenceModes]);

  // 上游接入视频素材时，只有「全能参考」能消费视频；其它模式（文生 / 图生 /
  // 首尾帧 / 图片参考）都会把视频丢弃。所以只要上游存在视频就强制切到
  // allReference 并锁死——下面的 tab 禁用规则会把其它 tab 一并禁用。
  // 与音频的「0→≥1 transition」不同，这里每次都纠正，确保视频在场期间无法切走。
  useEffect(() => {
    if (upstreamCounts.videos === 0) return;
    if (usesTypedReferenceModes) return;
    if (genMode === "allReference") return;
    updateNodeData(id, { genMode: "allReference" });
  }, [upstreamCounts.videos, genMode, id, updateNodeData, usesTypedReferenceModes]);

  // 文生视频不接受任何素材引用。即便用户先手动选了 textToVideo 再接入
  // 图片/音频（此时上面两个自动切换 effect 都因 genMode 已显式而 bail），
  // 也要强制切走，否则会停在 textToVideo 把已连素材丢弃。图片/音频统一走
  // allReference（全能参考），与「首次接入图片」的默认保持一致。
  useEffect(() => {
    if (usesTypedReferenceModes) return;
    if (genMode !== "textToVideo") return;
    if (upstreamCounts.images === 0 && upstreamCounts.audios === 0) return;
    updateNodeData(id, { genMode: "allReference" });
  }, [
    genMode,
    usesTypedReferenceModes,
    upstreamCounts.images,
    upstreamCounts.audios,
    id,
    updateNodeData,
  ]);

  // 首尾帧只承载「首帧 + 尾帧」两张图。一旦上游图片数 >2，从语义上就不再是
  // 首尾帧场景（应该是多图参考 / 全能参考），自动切到 allReference 跟「视频
  // 上游强制切 allReference」是同一类兜底逻辑。每次都纠正，避免用户在 >2
  // 图状态下被卡在 firstLastFrame 触发 submit 时被静默截断成两张。
  useEffect(() => {
    if (usesTypedReferenceModes) return;
    if (genMode !== "firstLastFrame") return;
    if (upstreamCounts.images <= 2) return;
    updateNodeData(id, { genMode: "allReference" });
  }, [genMode, upstreamCounts.images, id, updateNodeData, usesTypedReferenceModes]);

  useEffect(
    () => () => {
      clearTransientPreview();
    },
    [clearTransientPreview],
  );

  const videoSource = useMemo(
    () => resolveVideoNodeSource(data.videoUrl, transientPreviewUrl),
    [data.videoUrl, transientPreviewUrl],
  );
  const videoPosterSource = useMemo(
    () => resolveVideoNodePosterSource(videoSource),
    [videoSource],
  );

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, resolvedHeight, resolvedWidth, updateNodeInternals]);

  const [hasMetadata, setHasMetadata] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState(false);
  useEffect(() => {
    setHasMetadata(false);
    setVideoLoadError(false);
  }, [videoSource]);
  const handleVideoSelect = useCallback(() => {
    setSelectedNode(id);
  }, [id, setSelectedNode]);
  const handleVideoMetadata = useCallback(
    (metadata: VideoElementMetadata) => {
      setHasMetadata(true);
      setVideoLoadError(false);
      const updates = buildVideoMetadataPatch(
        {
          widthPx: data.widthPx,
          heightPx: data.heightPx,
          durationMs: data.durationMs,
        },
        metadata,
      );
      if (Object.keys(updates).length > 0) {
        updateNodeData(id, updates);
      }
    },
    [
      data.durationMs,
      data.heightPx,
      data.widthPx,
      id,
      updateNodeData,
    ],
  );
  const handleVideoLoadError = useCallback(() => {
    setHasMetadata(true);
    setVideoLoadError(true);
  }, []);

  // ---- subtitle erase mode (libtv-style 智能去字幕) ------------------------
  const subtitleEraseMode = data.subtitleEraseMode ?? null;
  const subtitleEraseBox = data.subtitleEraseBox ?? null;
  const [isErasing, setIsErasing] = useState(false);
  // Transient drag state — null when not currently dragging.
  const [eraseDrag, setEraseDrag] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  /**
   * Compute the displayed video frame rect inside its container (object-contain).
   * Returns container-pixel coords. We use this to (a) size the box overlay so
   * it sits on top of the actual video pixels (not the letterbox bars) and (b)
   * convert pointer coords ↔ normalized 0..1 source coords.
   */
  const getDisplayedVideoRect = useCallback(
    (containerWidth: number, containerHeight: number) =>
      resolveVideoNodeDisplayedRect(
        containerWidth,
        containerHeight,
        data.widthPx,
        data.heightPx,
      ),
    [data.heightPx, data.widthPx],
  );

  const handleEraseExit = useCallback(() => {
    updateNodeData(id, { subtitleEraseMode: null, subtitleEraseBox: null });
    setEraseDrag(null);
  }, [id, updateNodeData]);

  const handleClipSubmit = useCallback(
    async (startMs: number, endMs: number) => {
      if (isComposingClip) return;
      const sourceUrl = data.videoUrl;
      if (!sourceUrl) return;
      if (endMs <= startMs) return;
      if (!projectId) {
        console.error("[video-node] clip: missing project context");
        return;
      }
      setIsComposingClip(true);
      setClipError(null);
      try {
        const result = await composeVideoClip({
          projectId,
          nodeId: id,
          sourceUrl,
          startMs,
          endMs,
          quality,
        });
        if (result.url) {
          const state = useCanvasStore.getState();
          const position = state.findNodePosition(
            id,
            VIDEO_NODE_DEFAULT_WIDTH,
            VIDEO_NODE_DEFAULT_HEIGHT,
          );
          const newNodeId = addNode(CANVAS_NODE_TYPES.video, position, {
            videoUrl: result.url,
            durationMs: result.durationMs,
            displayName: "剪辑",
          });
          addEdge(id, newNodeId);
          updateNodeData(id, {
            isClipMode: false,
            clipStartMs: null,
            clipEndMs: null,
          });
        } else {
          console.warn("[video-node] compose completed without url", result);
          setClipError("剪辑完成但未返回视频地址");
        }
      } catch (error) {
        console.error("[video-node] clip compose failed", error);
        setClipError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsComposingClip(false);
      }
    },
    [
      addEdge,
      addNode,
      data.videoUrl,
      id,
      isComposingClip,
      projectId,
      quality,
      updateNodeData,
    ],
  );

  const handleEraseSubmit = useCallback(async () => {
    if (isErasing) return;
    if (!data.videoUrl) return;
    if (subtitleEraseMode === "box" && !subtitleEraseBox) return;
    if (!projectId) {
      console.error("[video-node] missing project context");
      return;
    }
    setIsErasing(true);
    try {
      const result = await eraseVideoSubtitles({
        projectId,
        sourceUrl: data.videoUrl,
        mode: subtitleEraseMode ?? "smart",
        box: subtitleEraseMode === "box" ? subtitleEraseBox : null,
      });
      if (result.url) {
        updateNodeData(id, {
          videoUrl: result.url,
          subtitleEraseMode: null,
          subtitleEraseBox: null,
        });
      } else {
        console.warn("[video-node] erase completed without url", result);
      }
    } catch (error) {
      console.error("[video-node] subtitle erase failed", error);
    } finally {
      setIsErasing(false);
    }
  }, [
    data.videoUrl,
    id,
    isErasing,
    projectId,
    subtitleEraseBox,
    subtitleEraseMode,
    updateNodeData,
  ]);

  const submitDisabled =
    isGenerating ||
    videoModelsLoading ||
    !selectedVideoModel ||
    Boolean(videoModelReferenceDisabledReason(selectedVideoModel, upstreamCounts)) ||
    (prompt.trim().length === 0 && upstreamTextJoined.length === 0);

  const handleSubmit = useCallback(async () => {
    if (submitDisabled) return;
    // 在途守卫（与 ImageGenNode 一致）：第 1 条完成就会清 isGenerating，
    // submitDisabled 拦不住「旧批次 N-1 个任务还在跑时重新提交」——旧闭包
    // 会用过期的 completedUrls 覆写新批次的 generationBatch。
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (!projectId) {
        console.error("[video-node] missing project context");
        return;
      }
      updateNodeData(id, {
        isGenerating: true,
        generationStartedAt: Date.now(),
        // Clear any prior failure so the banner reflects only this attempt.
        // 注意 generationBatch 不在这里清：下面还有多条校验失败的早退路径，
        // 在这里清会让一次失败的提交白白毁掉已有画册——批次清空挪到真正开跑前。
        generationError: null,
        generationErrorDetails: null,
        generationErrorRequestId: null,
      });
      // 运镜 fragment 拼接到最终 prompt 的开头；上游 text 在前、用户自己写
      // 的 prompt 在后，两段以 \n\n 隔开（与 ImageGenNode/ImageEditNode 一致）。
      const composedPrompt = composeVideoNodePrompt(
        upstreamTextJoined,
        prompt,
        cameraMovementPreset?.promptFragment,
      );
      try {
      // Walk the current edges/nodes once — used by every non-textToVideo
      // branch to collect upstream resources. 必须与 UI 编号侧（useUpstreamNodes）
      // 同源：按连线顺序收集。曾按 state.nodes 顺序（节点创建顺序）收集，先创建
      // 但后连线的节点会排到 references 前面，@图片N 在后端就指向错位的图。
      const collectUpstream = () => {
        const state = useCanvasStore.getState();
        return sortUpstreamByReferenceOrder(
          upstreamNodesInEdgeOrder(state.nodes, state.edges, id),
          data.referenceOrder,
        );
      };
      const collectUpstreamImageUrls = (): string[] => {
        const upstream = collectUpstream();
        const urls: string[] = [];
        for (const node of upstream) {
          const url = submittableImageUrl(node);
          if (typeof url === "string" && url.length > 0) urls.push(url);
        }
        return urls;
      };

      const durationClamped = clampVideoDuration(durationSec, durationBounds);
      const cameraTemplateId = cameraMovementId;
      // 后端按 canvas_id + node_id 记录每个节点的生成历史。多条生成时每个
      // 兄弟节点用各自的 targetId 作 node_id，历史才能分别落到对应节点。
      // 后端不再支持一次出多条，改为按「生成数量」并发调用 N 次接口。先按
      // genMode 组装出一个「调一次接口」的闭包 doSubmit，校验失败则置空提前返回。
      let doSubmit:
        | ((targetId: string) => ReturnType<typeof submitVideoGeneration>)
        | null = null;
      if (genMode === "firstLastFrame") {
        const imageUrls = collectUpstreamImageUrls();
        const firstFrameUrl = imageUrls[0] ?? null;
        const lastFrameUrl = imageUrls[1] ?? null;
        if (!firstFrameUrl && !lastFrameUrl) {
          console.warn(
            "[video-node] firstLastFrame submit without any frame",
          );
          updateNodeData(id, {
            isGenerating: false,
            generationStartedAt: null,
          });
          return;
        }
        doSubmit = (targetId) =>
          submitVideoGeneration({
            kind: "keyframes",
            projectId,
            firstFrameUrl,
            lastFrameUrl,
            prompt: composedPrompt,
            cameraTemplateId,
            aspectRatio: submitAspectRatio,
            quality,
            durationSeconds: durationClamped,
            generateAudio,
            model: modelId,
            genMode,
            humanReview: supportsHumanReview && humanReview,
            sceneOptimize: sceneOptimize ?? null,
            canvasId,
            nodeId: targetId,
          });
      } else if (genMode === "imageToVideo" || genMode === "imageReference") {
        // Unified i2v endpoint: 1 image = 图生视频, 2-9 images = 图片参考视频.
        const imageUrls = collectUpstreamImageUrls().slice(0, 9);
        if (imageUrls.length === 0) {
          console.warn("[video-node] i2v submit without any upstream image");
          updateNodeData(id, {
            isGenerating: false,
            generationStartedAt: null,
          });
          return;
        }
        doSubmit = (targetId) =>
          submitVideoGeneration({
            kind: "imageReferences",
            projectId,
            imageUrls,
            prompt: composedPrompt,
            cameraTemplateId,
            aspectRatio: submitAspectRatio,
            quality,
            durationSeconds: durationClamped,
            generateAudio,
            model: modelId,
            genMode,
            humanReview: supportsHumanReview && humanReview,
            sceneOptimize: sceneOptimize ?? null,
            canvasId,
            nodeId: targetId,
          });
      } else if (genMode === "videoEdit") {
        // Video edit: one source video plus the catalog-declared image limit.
        const upstream = collectUpstream();
        const videoUrl =
          upstream
            .map((node) => referenceVideoUrl(node) ?? "")
            .find((url) => url.length > 0) ?? "";
        if (!videoUrl) {
          console.warn("[video-node] videoEdit submit without upstream video");
          updateNodeData(id, {
            isGenerating: false,
            generationStartedAt: null,
          });
          return;
        }
        const allImageUrls = collectUpstreamImageUrls();
        if (allImageUrls.length > maxReferenceImages) {
          toast.warning(
            `视频编辑最多支持 ${maxReferenceImages} 张参考图，已忽略其余 ${allImageUrls.length - maxReferenceImages} 张`,
          );
        }
        const imageUrls = allImageUrls.slice(0, maxReferenceImages);
        doSubmit = (targetId) =>
          submitVideoGeneration({
            kind: "videoEdit",
            projectId,
            videoUrl,
            imageUrls,
            prompt: composedPrompt,
            cameraTemplateId,
            aspectRatio: submitAspectRatio,
            quality,
            durationSeconds: durationClamped,
            generateAudio,
            model: modelId,
            genMode,
            canvasId,
            nodeId: targetId,
          });
      } else if (genMode === "allReference") {
        if (usesTypedReferenceModes) {
          void showErrorDialog(
            "当前模型不支持全能参考模式，请切换到可用模式。",
            t("common.error"),
          );
          updateNodeData(id, {
            isGenerating: false,
            generationStartedAt: null,
          });
          return;
        }
        // Omni-gen: classify each upstream node by its media type.
        // Reference caps come from the active model catalog entry.
        const upstream = collectUpstream();
        const references: VideoGenerationReference[] = [];
        // 与 references 里 type==="audio" 的项一一对应，用于提交前校验音频总时长。
        const audioRefs: { url: string; durationMs: number | null }[] = [];
        let imageCount = 0;
        let videoCount = 0;
        let audioCount = 0;
        for (const node of upstream) {
          if (references.length >= maxReferenceTotal) break;
          const videoRefUrl = referenceVideoUrl(node);
          if (videoRefUrl) {
            // 视频节点或携带 videoUrl 的 upload 节点（资产库视频）统一收集。
            if (videoCount < maxReferenceVideos) {
              references.push({ type: "video", url: videoRefUrl });
              videoCount += 1;
            }
          } else if (isAudioNode(node)) {
            const url =
              typeof node.data.audioUrl === "string"
                ? node.data.audioUrl
                : "";
            if (url && audioCount < maxReferenceAudios) {
              // 音频引用默认走「配乐参考」语义；label 用 sourceFileName /
              // displayName 之一，方便后端日志和后续 UI 展示对得上。
              const rawLabel =
                (typeof node.data.sourceFileName === "string"
                  ? node.data.sourceFileName
                  : "") ||
                (typeof node.data.displayName === "string"
                  ? node.data.displayName
                  : "");
              references.push({
                type: "audio",
                url,
                role: "配乐参考",
                label: rawLabel,
              });
              audioRefs.push({
                url,
                durationMs:
                  typeof node.data.durationMs === "number"
                    ? node.data.durationMs
                    : null,
              });
              audioCount += 1;
            }
          } else {
            const url = submittableImageUrl(node);
            if (url && imageCount < maxReferenceImages) {
              references.push({ type: "image", url });
              imageCount += 1;
            }
          }
        }
        if (references.length === 0) {
          console.warn("[video-node] omni-gen submit without any reference");
          updateNodeData(id, {
            isGenerating: false,
            generationStartedAt: null,
          });
          return;
        }
        // Validate only when the model catalog declares an audio-duration cap.
        if (maxReferenceAudioDurationMs && audioRefs.length > 0) {
          const audioDuration =
            await validateVideoReferenceAudioDuration({
              references: audioRefs,
              maxDurationMs: maxReferenceAudioDurationMs,
            });
          if (audioDuration.exceedsLimit) {
            void showErrorDialog(
              t("node.videoNode.audio.durationExceeded", {
                max: Math.floor(maxReferenceAudioDurationMs / 1000),
              }),
              t("common.error"),
            );
            updateNodeData(id, {
              isGenerating: false,
              generationStartedAt: null,
            });
            return;
          }
        }
        doSubmit = (targetId) =>
          submitVideoGeneration({
            kind: "allReferences",
            projectId,
            prompt: composedPrompt,
            cameraTemplateId,
            references,
            aspectRatio: submitAspectRatio,
            quality,
            durationSeconds: durationClamped,
            generateAudio,
            model: modelId,
            genMode,
            humanReview: supportsHumanReview && humanReview,
            sceneOptimize: sceneOptimize ?? null,
            canvasId,
            nodeId: targetId,
          });
      } else {
        // textToVideo (default).
        doSubmit = (targetId) =>
          submitVideoGeneration({
            kind: "text",
            projectId,
            prompt: composedPrompt,
            cameraTemplateId,
            aspectRatio: submitAspectRatio,
            quality,
            durationSeconds: durationClamped,
            generateAudio,
            model: modelId,
            genMode,
            humanReview: supportsHumanReview && humanReview,
            sceneOptimize: sceneOptimize ?? null,
            canvasId,
            nodeId: targetId,
          });
      }

      if (!doSubmit) {
        updateNodeData(id, { isGenerating: false, generationStartedAt: null });
        return;
      }
      const submitOnce = doSubmit;

      // 多条生成不再复制兄弟节点：N 个任务并发、全部回填到当前节点的
      // generationBatch（叠卡画册，与图片节点一致）。第 1 条完成的设为主视频，
      // 其余逐条追加。
      const total = Math.min(Math.max(count, 1), 4);
      // 各并发任务完成顺序不定，本地累积已完成的 URL，整组写回（避免读改写竞态）。
      const completedUrls: string[] = [];
      // 收集每个子任务的失败，留到整批 settle 后统一决定是否弹错误框——避免
      // 「N 条里 1 条秒失败（如命中队列上限）、其余正常生成」时一边弹报错一边
      // 又冒加载动画的矛盾观感。
      const runErrors: unknown[] = [];
      const runOne = async (runIndex: number) => {
        try {
          const ref = await submitOnce(id);
          // Persist the task handle so a page refresh can resume this job.
          // N 个并发任务同节点只能存一个句柄——保留第 1 个（主视频）的。
          if (runIndex === 0) {
            updateNodeData(id, generationTaskDescriptor(ref));
          }
          const completed = await completeVideoGenerationTask({
            projectId,
            task: ref,
          });
          if (completed.resultLookupError) {
            console.error(
              "[video-node] fetch job result failed",
              completed.resultLookupError,
            );
          }
          const url = completed.url;
          if (url) {
            completedUrls.push(url);
            const isFirstCompleted = completedUrls.length === 1;
            updateNodeData(id, {
              // 第 1 条完成的设为主视频并结束 loading；后续只扩充画册。
              ...(isFirstCompleted
                ? {
                    videoUrl: url,
                    isGenerating: false,
                    generationStartedAt: null,
                    sourceFileName: null,
                    generationError: null,
                    generationErrorDetails: null,
                    generationErrorRequestId: null,
                  }
                : {}),
              ...(total > 1 ? { generationBatch: [...completedUrls] } : {}),
            });
          } else {
            console.warn(
              "[video-node] video gen completed without output url",
              completed.completion,
            );
            // 只有 run 0（任务句柄归属者）且尚无任何成功时才终结 loading——
            // 非首个任务先「无 URL 完成」不能把还在跑的整体 loading 掐掉。
            if (runIndex === 0 && completedUrls.length === 0) {
              updateNodeData(id, {
                isGenerating: false,
                generationStartedAt: null,
                generationError: "视频生成未返回结果",
                generationErrorDetails: null,
                generationErrorRequestId: null,
              });
            }
          }
        } catch (error) {
          console.error("[video-node] video gen failed", error);
          // 先记下错误再决定是否早退 —— settle 后的聚合分支靠 runErrors 判断
          // 「部分失败」并弹 toast；早退前不记会把首个成功之后的失败彻底吞掉。
          runErrors.push(error);
          // 已有同批其它视频完成（主视频已落）时不覆盖成功态为错误——
          // 部分失败只影响画册条数。
          if (completedUrls.length > 0) return;
          const resolved = resolveErrorContent(error, "视频生成失败");
          const displayErrorMessage = backendErrorToastMessage(error, t);
          const diagnostics = resolveGenerationErrorDiagnostics(error, resolved.details);
          // Persist the failure on the node so the 重新生成 entry survives after
          // the user dismisses the dialog (previously the error was dialog-only).
          // 只有 run 0 失败才终结 loading：非首 run 失败时 run 0 可能还在跑，
          // 它的成功补丁会清掉这里写的错误横幅。
          updateNodeData(id, {
            ...(runIndex === 0
              ? { isGenerating: false, generationStartedAt: null }
              : {}),
            generationError: displayErrorMessage,
            generationErrorDetails: diagnostics.details,
            generationErrorRequestId: diagnostics.requestId,
          });
        }
      };

      // 旧画册清空 + 占位计数都在所有校验通过、真正开跑前才动——前面有多个
      // 校验失败的早退路径，提前动会白白毁掉已有画册 / 把「生成中」占位卡死。
      updateNodeData(id, { generationBatch: null });
      setAlbumPendingTotal(id, total > 1 ? total : 0);
      await Promise.allSettled(
        Array.from({ length: total }, (_, runIndex) => runOne(runIndex)),
      );
      setAlbumPendingTotal(id, 0);
      // 整批结束后再决定错误反馈：
      //  - 一条都没成功 → 弹一次错误框（含真人素材被拦截的专用引导）；
      //  - 部分成功 → 不弹模态打断，仅用轻量 toast 告知少出了几条。
      // 这样「N 条里 1 条命中队列上限秒失败、其余正常在跑」时不会再出现
      // 「先弹上限报错、节点却又冒出加载动画」的矛盾观感。
      if (completedUrls.length === 0 && runErrors.length > 0) {
        const firstError = runErrors[0];
        const resolved = resolveErrorContent(firstError, "视频生成失败");
        const displayErrorMessage = backendErrorToastMessage(firstError, t);
        const diagnostics = resolveGenerationErrorDiagnostics(firstError, resolved.details);
        const haystack = `${displayErrorMessage}\n${diagnostics.details ?? ""}`;
        if (
          haystack.includes(
            "InputImageSensitiveContentDetected.PrivateInformation",
          )
        ) {
          // 素材含真实人脸被拦截：引导用户开启「真人素材审核」后重试。
          void showErrorDialog(
            "素材包含真实人脸，已被内容安全策略拦截。请在下方打开「真人素材审核」开关后重试（可能增加审核时间，不保证通过）。",
            "素材被拦截",
            diagnostics.details ?? undefined,
          );
        } else {
          void showErrorDialog(
            displayErrorMessage,
            t("common.error"),
            diagnostics.details ?? undefined,
          );
        }
      } else if (runErrors.length > 0) {
        toast.error(
          t("node.videoNode.partialBatchFailed", {
            ok: completedUrls.length,
            total,
          }),
        );
      }
      // 所有任务尘埃落定后统一拉一次历史：N 条记录都落在本节点名下，run 0
      // settle 时就拉会漏掉后完成的 N-1 条（后端成功失败都会记）。
      void refreshHistory();
      } catch (error) {
        console.error("[video-node] video gen failed", error);
        updateNodeData(id, { isGenerating: false, generationStartedAt: null });
        setAlbumPendingTotal(id, 0);
      }
    } finally {
      submittingRef.current = false;
    }
  }, [
    aspectRatio,
    submitAspectRatio,
    cameraMovementId,
    cameraMovementPreset,
    canvasId,
    count,
    durationBounds,
    durationSec,
    generateAudio,
    genMode,
    humanReview,
    id,
    maxReferenceAudioDurationMs,
    maxReferenceAudios,
    maxReferenceImages,
    maxReferenceTotal,
    maxReferenceVideos,
    supportsHumanReview,
    modelId,
    prompt,
    projectId,
    quality,
    refreshHistory,
    sceneOptimize,
    submitDisabled,
    updateNodeData,
    upstreamTextJoined,
    usesTypedReferenceModes,
  ]);

  const hasMainlineContext = hasMainlineContexts(
    (data as { mainline_context?: unknown }).mainline_context,
  );
  const isUploading = Boolean(data.isUploading);
  const isEmptyVideoBody =
    !videoSource &&
    !isUploading &&
    !isGenerating &&
    !hasGenerationError;
  const showVideoOpsPanel =
    selected &&
    !isBoxSelecting &&
    !albumExpanded &&
    !isClipMode &&
    !subtitleEraseMode &&
    !data.referenceOnly &&
    !data.isUpscaleNode;

  const handleCaptureFrame = useCallback(
    async (mode: "first" | "last" | "current") => {
      if (isCapturingFrame) return;
      if (!data.videoUrl) return;
      if (!projectId) {
        console.error("[video-node] missing project context");
        return;
      }
      const src = resolveImageDisplayUrl(data.videoUrl);
      const liveEl = videoRef.current;
      const seekSec = resolveVideoFrameSeekSeconds({
        mode,
        liveDuration:
          liveEl && Number.isFinite(liveEl.duration) ? liveEl.duration : null,
        fallbackDuration:
          typeof data.durationMs === 'number' ? data.durationMs / 1000 : null,
        currentTime:
          liveEl && Number.isFinite(liveEl.currentTime)
            ? liveEl.currentTime
            : null,
      });

      setIsCapturingFrame(true);
      try {
        const blob = await captureVideoFrameBlob(src, seekSec);
        const filename = `frame-${mode}-${Date.now()}.png`;
        const file = new File([blob], filename, { type: "image/png" });
        const uploaded = await uploadCanvasAsset(
          projectId,
          file,
          filename,
        );
        const widthPx = data.widthPx;
        const heightPx = data.heightPx;
        const aspectForNode =
          widthPx && heightPx && widthPx > 0 && heightPx > 0
            ? `${widthPx}:${heightPx}`
            : data.aspectRatio || "16:9";
        const createdNodeId = addDerivedUploadNode(
          id,
          uploaded.url,
          aspectForNode,
          uploaded.url,
        );
        if (createdNodeId) {
          const titleKey =
            mode === "first"
              ? "node.videoNode.frame.titleFirst"
              : mode === "last"
                ? "node.videoNode.frame.titleLast"
                : "node.videoNode.frame.titleCurrent";
          updateNodeData(createdNodeId, { displayName: t(titleKey) });
          addEdge(id, createdNodeId);
        }
      } catch (error) {
        console.error("[video-node] frame capture failed", error);
      } finally {
        setIsCapturingFrame(false);
      }
    },
    [
      addDerivedUploadNode,
      addEdge,
      data.aspectRatio,
      data.durationMs,
      data.heightPx,
      data.videoUrl,
      data.widthPx,
      id,
      isCapturingFrame,
      projectId,
      t,
      updateNodeData,
    ],
  );


  const handleModelChange = useCallback(
    (nextModelId: string) => {
      const nextModel = availableVideoModels.find(
        (model) => model.id === nextModelId,
      );
      const resetGenMode =
        data.genMode != null &&
        !isVideoModeSupportedByModel(data.genMode, nextModel);
      updateNodeData(id, {
        model: nextModelId,
        ...(resetGenMode
          ? { genMode: 'textToVideo' as VideoGenMode }
          : {}),
      });
      rememberLastVideoModel(nextModelId);
    },
    [availableVideoModels, data.genMode, id, updateNodeData],
  );

  const normalizeDuration = useCallback(
    (value: number) => clampVideoDuration(value, durationBounds),
    [durationBounds],
  );

  const getModelDisabledReason = useCallback(
    (model: (typeof availableVideoModels)[number]) =>
      videoModelReferenceDisabledReason(model, upstreamCounts),
    [upstreamCounts],
  );

  const handlePromptChange = useCallback(
    (next: string) => {
      setPromptDraft(next);
      if (!isComposingRef.current) {
        updateNodeData(id, { prompt: next });
      }
    },
    [id, updateNodeData],
  );

  const handlePromptCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handlePromptCompositionEnd = useCallback(
    (next: string) => {
      isComposingRef.current = false;
      setPromptDraft(next);
      updateNodeData(id, { prompt: next });
    },
    [id, updateNodeData],
  );

  return {
    id,
    data,
    selected,
    t,
    setSelectedNode,
    isBoxSelecting,
    updateNodeData,
    inputRef,
    videoEl,
    setVideoRef,
    isCapturingFrame,
    isTranslatingPrompt,
    isCharacterLibraryOpen,
    setIsCharacterLibraryOpen,
    isComposingClip,
    clipError,
    setClipError,
    historyRecords,
    historyLoading,
    refreshHistory,
    historyPreviewUrl,
    setHistoryPreviewUrl,
    prompt,
    promptDraft,
    promptEditorRef,
    handlePromptChange,
    handlePromptCompositionStart,
    handlePromptCompositionEnd,
    insertContextPaletteEntry,
    genMode,
    modelId,
    handleModelChange,
    getModelDisabledReason,
    aspectRatio,
    qualityOptions,
    quality,
    durationBounds,
    durationSec,
    normalizeDuration,
    sceneOptimizeOptions,
    sceneOptimize,
    generateAudio,
    supportsHumanReview,
    humanReview,
    count,
    totalCreditCostDisplay,
    cameraMovementId,
    cameraTemplates,
    cameraTemplatesLoading,
    isGenerating,
    generationError,
    hasGenerationError,
    generationErrorRequestId,
    handleRestoreHistory,
    isConnected,
    referenceMedia,
    referenceMediaCaps,
    referenceMediaCapInfo,
    mentionCandidates,
    handleDetachUpstream,
    upstreamTextContents,
    upstreamTextJoined,
    upstreamCounts,
    generationModeOptions,
    isClipMode,
    clipStartMs,
    clipEndMs,
    durationMs,
    resolvedTitle,
    resolvedWidth,
    resolvedHeight,
    panelExpanded,
    setPanelExpanded,
    panelHeight,
    panelOverhang,
    albumRootRef,
    albumExpanded,
    albumPendingTotal,
    albumUrls,
    albumTotalSlots,
    albumPendingCount,
    hasAlbum,
    handleSetAlbumMainVideo,
    handleToggleAlbumExpanded,
    handleApplyAlbumVideoToCanvas,
    handleDownloadAlbumVideo,
    handleFileChange,
    handleDrop,
    handleDragOver,
    handleUploadClick,
    spawnFrameUploads,
    spawnCharacterLibraryReferences,
    handleTranslatePrompt,
    videoSource,
    videoPosterSource,
    hasMetadata,
    videoLoadError,
    handleVideoSelect,
    handleVideoMetadata,
    handleVideoLoadError,
    subtitleEraseMode,
    subtitleEraseBox,
    isErasing,
    eraseDrag,
    setEraseDrag,
    getDisplayedVideoRect,
    handleEraseExit,
    handleClipSubmit,
    handleEraseSubmit,
    submitDisabled,
    handleSubmit,
    hasMainlineContext,
    isUploading,
    isEmptyVideoBody,
    showVideoOpsPanel,
    handleCaptureFrame,
    captureFrameStrip: captureBrowserVideoFrameStrip,
    videoFileAccept: VIDEO_FILE_ACCEPT,
    projectId,
  };
}

export type VideoNodeController = ReturnType<typeof useVideoNodeController>;
