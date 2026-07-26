// Copyright (c) 2026 AI anime
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import {
  AlertTriangle,
  ArrowUp,
  Languages,
  Loader2,
  Video as VideoIcon,
  X as XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  CANVAS_NODE_TYPES,
  isAudioNode,
  isExportImageNode,
  isImageEditNode,
  isImageGenNode,
  isStoryboardGenNode,
  isUploadNode,
  isVideoNode,
  type CanvasNode,
  type VideoGenCount,
  type VideoGenMode,
  type VideoNodeData,
} from "@/features/canvas/domain/canvasNodes";
import {
  DEFAULT_VIDEO_DURATION_SEC,
  clampVideoDuration,
  defaultSceneOptimizeForModel,
  isHappyHorseVideoModel,
  isVideoModeSupportedByModel,
  normalizeSceneOptimize,
  normalizeVideoQuality,
  qualityToResolution,
  sceneOptimizeOptionsForModel,
  videoDurationBoundsForModel,
  videoModelReferenceDisabledReason,
  videoQualityOptionsForModel,
} from "@/features/canvas/domain/videoGenerationModel";
import {
  referenceImageUrl,
  referenceVideoUrl,
  submittableImageUrl,
} from "@/features/canvas/domain/videoReferenceMedia";
import {
  classifyVideoReferenceItems,
  videoReferenceCapsForMode,
  type VideoReferenceCapEntry,
  type VideoReferenceItem,
} from "@/features/canvas/domain/videoReferenceLimits";
import {
  VIDEO_GENERATION_ASPECT_RATIOS,
  resolveImageDisplayUrl,
  snapToAllowedAspectRatio,
} from "@/features/canvas/application/imageData";
import { resolveAudioReferenceDisplayName } from "@/features/canvas/application/audioReferenceDisplayName";
import { resolveGenerationOutputUrl } from "@/features/canvas/application/generationOutputUrl";
import { resolveDroppedVideoFile } from "@/features/canvas/application/resolveDroppedVideoFile";
import { probeAudioDurationMs } from "@/features/canvas/infrastructure/browserAudioMetadata";
import { captureVideoFrameBlob } from "@/features/canvas/infrastructure/browserVideoFrameCapture";
import { ensureWebSafeVideo } from "@/features/canvas/infrastructure/videoTranscode";
import { isVideoFile, VIDEO_FILE_ACCEPT } from "@/features/canvas/application/videoFileTypes";
import { resolveNodeDisplayName } from "@/features/canvas/domain/nodeDisplay";
import { toast } from "sonner";
import { downloadUrlAsFile } from "@/lib/browserDownload";
import {
  setAlbumPendingTotal,
  useAlbumPendingTotal,
} from "@/features/canvas/nodes/shared/albumPendingTotals";
import { canvasEventBus } from "@/features/canvas/application/canvasServices";
import {
  extractUpstreamContent,
  joinUpstreamText,
} from "@/features/canvas/application/graphContentResolver";
import { useUpstreamNodes } from "@/features/canvas/hooks/useUpstreamGraph";
import {
  sortUpstreamByReferenceOrder,
  upstreamNodesInEdgeOrder,
} from "@/features/canvas/nodes/referenceOrdering";
import { ReferenceTextChip } from "@/features/canvas/nodes/shared/ReferenceTextChip";
import { useReferenceMentionSync } from "@/features/canvas/nodes/useReferenceMentionSync";
import { useNodeGenerationTaskState } from "@/features/canvas/hooks/useNodeGenerationTaskState";
import { resolveErrorContent } from "@/features/canvas/application/errorDialog";
import { showErrorDialog } from "@/features/canvas/composition";
import { backendErrorToastMessage } from "@/shared/api/errors";
import { resolveGenerationErrorDiagnostics } from "@/features/canvas/application/generationErrorReport";
import {
  PromptMentionEditor,
  type MentionCandidate,
  type PromptMentionEditorHandle,
} from "@/features/canvas/nodes/PromptMentionEditor";
import { NodeContextPromptPaletteButton } from "@/features/canvas/nodes/ContextPromptPaletteButton";
import {
  contextPromptPaletteInsertionText,
  type ContextPromptPaletteEntry,
} from "@/features/canvas/nodes/contextPromptPalette";
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from "@/features/canvas/ui/NodeHeader";
import { NodeResizeHandle } from "@/features/canvas/ui/NodeResizeHandle";
import { PanelExpandButton } from "@/features/canvas/ui/PanelExpandButton";
import {
  NODE_OPS_PANEL_ENTER_CLASS,
  OperationPanelShell,
} from "@/features/canvas/ui/OperationPanelShell";
import { NodeGenerationOverlay } from "@/features/canvas/ui/NodeGenerationOverlay";
import {
  CANVAS_NODE_INPUT_BODY_FRAME_CLASS,
  CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS,
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS,
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  CANVAS_NODE_OPS_PANEL_CLASS,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  canvasNodeFrameClass,
} from "@/features/canvas/ui/nodeFrameStyles";
import {
  hasMainlineContexts,
  NodeContextBadges,
} from "@/features/freezone/context/NodeContextBadges";
import { RegenerateButton } from "@/features/canvas/ui/RegenerateButton";
import {
  NODE_CREDIT_PILL_FLAT_CLASS,
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_DISABLED_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
  NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS,
  NODE_INLINE_ICON_BUTTON_CLASS,
} from "@/features/canvas/ui/nodeControlStyles";
import { VideoClipPanel } from "@/features/canvas/nodes/VideoClipPanel";
import { VideoPlayerControls } from "@/features/canvas/nodes/VideoPlayerControls";
import {
  ReferenceMediaRow,
} from "@/features/canvas/nodes/VideoReferenceMedia";
import {
  SubtitleEraseBoxOverlay,
  SubtitleEraseOpsPanel,
} from "@/features/canvas/nodes/VideoSubtitleEraseControls";
import { CameraMovementChip } from "@/features/canvas/nodes/CameraMovementChip";
import { CharacterLibraryChip } from "@/features/canvas/nodes/CharacterLibraryChip";
import { VideoCountPicker } from "@/features/canvas/nodes/VideoCountPicker";
import { VideoConfigChip } from "@/features/canvas/nodes/VideoConfigChip";
import {
  VideoAlbumDeck,
  VideoAlbumGallery,
  VideoAlbumToggleButton,
} from "@/features/canvas/nodes/VideoAlbumControls";
import { VideoGenerationModeSelect } from "@/features/canvas/nodes/VideoGenerationModeSelect";
import {
  VideoNodeEmptyState,
  VideoUploadActionRail,
} from "@/features/canvas/nodes/VideoNodeEmptyState";
import { resolveVideoGenerationModeOptions } from "@/features/canvas/nodes/videoGenerationModeOptions";
import {
  CAMERA_MOVEMENT_PRESETS,
  findCameraMovementPreset,
  type CameraMovementPreset,
} from "@/features/canvas/domain/cameraMovementPresets";
import { useFreezoneVideoCameraTemplates } from "@/features/canvas/hooks/useFreezoneVideoCameraTemplates";
import { useFreezoneVideoModels } from "@/features/canvas/hooks/useFreezoneVideoModels";
import { useIsBoxSelecting } from "@/features/canvas/hooks/useIsBoxSelecting";
import {
  AssetLibraryModal,
  type AssetLibrarySelection,
} from "@/features/canvas/ui/AssetLibraryModal";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  fetchFreezoneJobResult,
  fetchFreezoneTextTranslateResult,
  submitFreezoneTextTranslate,
  submitFreezoneVideoCompose,
  submitFreezoneVideoErase,
  submitFreezoneVideoEdit,
  submitFreezoneVideoGen,
  submitFreezoneVideoI2v,
  submitFreezoneVideoKeyframes,
  submitFreezoneVideoOmniGen,
  uploadFreezoneImage,
  uploadFreezoneVideo,
  type FreezoneJobRef,
  type FreezoneVideoAspectRatio,
  type FreezoneVideoReferenceItem,
} from "@/api/ops";
import { awaitTaskCompletion } from "@/api/tasks";
import { generationTaskDescriptor } from "@/features/canvas/application/resumeGeneration";
import { useNodeGenerationHistory } from "@/features/canvas/hooks/useNodeGenerationHistory";
import {
  NodeGenerationHistory,
  hasCompletedHistoryRecords,
  historyRecordOutputUrl,
} from "@/features/canvas/ui/NodeGenerationHistory";
import type { FreezoneGenerationHistoryRecord } from "@/api/ops";
import { readUrl } from "@/lib/url-params";
import {
  DEFAULT_VIDEO_MODEL_ID,
  ProviderModelPicker,
} from "@/features/canvas/ui/ProviderModelPicker";
import { writeLastVideoModel } from "@/features/canvas/domain/lastVideoModel";
import {
  CreditCostPill,
  formatCreditCost,
} from "@/components/credits/credit-visual";
import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type VideoNodeProps = NodeProps & {
  id: string;
  data: VideoNodeData;
  selected?: boolean;
};

const DEFAULT_WIDTH = 580;
const DEFAULT_HEIGHT = 380;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 280;
const MAX_WIDTH = 1100;
const MAX_HEIGHT = 1000;

// 图片节点的默认落位尺寸（与 ImageGenNode 的 DEFAULT_WIDTH/HEIGHT 对齐）。
// 「首帧生成视频」会在视频节点左侧新建一个图片节点，排版要按它的真实尺寸算。
const IMAGE_GEN_NODE_WIDTH = 580;
const IMAGE_GEN_NODE_HEIGHT = 360;
/** 「首帧生成视频」预填的提示词，用户可以直接改。 */
const FIRST_FRAME_PROMPT = "以当前图为首帧生成视频";

const OPERATIONS_PANEL_HEIGHT = 280;
const OPERATIONS_PANEL_GAP = 12;
// Extend the ops panel beyond the node's left/right edges so the textarea +
// chips have more room than the video frame itself.
const OPERATIONS_PANEL_OVERHANG = 120;
// 「放大」后用居中弹窗展示，给提示词编辑更舒适的空间。
const OPERATIONS_PANEL_EXPANDED_HEIGHT = 560;
const OPERATIONS_PANEL_EXPANDED_WIDTH = 1040;

const ASPECT_RATIOS: ReadonlyArray<FreezoneVideoAspectRatio> = [
  "auto",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
];
const COUNT_OPTIONS: ReadonlyArray<VideoGenCount> = [1, 2, 4];

// Seedance 2.0(doubao-seedance-2-0，r2v）后端硬上限：一次请求的音频总时长
// 必须 ≤ 15.2s，超了会以 InvalidParameter 报错。对用户按「15 秒」提示，实际
// 用 15.2s 作拦截阈值，避免把后端本会放行的 15.0~15.2s 音频误拦。
const MAX_AUDIO_TOTAL_DURATION_MS = 15_200;

export const VideoNode = memo(
  ({ id, data, selected, width, height }: VideoNodeProps) => {
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
    // Mirror the actual <video> element into state so VideoPlayerControls 能
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
    } = useNodeGenerationHistory(id, { enabled: Boolean(selected) });

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
      isFallback: videoModelsFallback,
    } = useFreezoneVideoModels();
    // Same fix as ImageGenNode: when no model is explicitly picked, default to
    // the FIRST live model (what ProviderModelPicker displays) rather than the
    // static DEFAULT_VIDEO_MODEL_ID, so the displayed model matches the value
    // actually sent to /freezone/video/gen.
    const selectedVideoModel = useMemo(() => {
      const persisted =
        typeof data.model === "string" && data.model.length > 0
          ? data.model
          : null;
      return (
        (persisted
          ? availableVideoModels.find((model) => model.id === persisted)
          : undefined) ?? availableVideoModels[0]
      );
    }, [availableVideoModels, data.model]);
    const modelId = selectedVideoModel?.id ?? DEFAULT_VIDEO_MODEL_ID;
    const selectedVideoModelId = selectedVideoModel?.apiModel ?? selectedVideoModel?.id ?? modelId;
    const isHappyHorseModel = isHappyHorseVideoModel(selectedVideoModelId);
    // aspectRatio 只认合法的比例预设（含 "auto"）；历史上曾被写成像素串(如
    // "1248:704")的旧节点在这里吸附到最接近的合法视频比例，保证 chip 显示干净。
    const aspectRatio: FreezoneVideoAspectRatio = (
      ASPECT_RATIOS as readonly string[]
    ).includes(String(data.aspectRatio))
      ? (data.aspectRatio as FreezoneVideoAspectRatio)
      : (snapToAllowedAspectRatio(
          String(data.aspectRatio ?? ""),
          VIDEO_GENERATION_ASPECT_RATIOS,
          "16:9",
        ) as FreezoneVideoAspectRatio);
    // 提交给后端的比例必须是 6 个合法视频比例之一、绝不发 "auto"：auto 时按节点
    // 真实像素(若有)推导最接近的比例，否则回退 16:9。
    const submitAspectRatio: FreezoneVideoAspectRatio =
      aspectRatio === "auto"
        ? (snapToAllowedAspectRatio(
            typeof data.widthPx === "number" &&
              typeof data.heightPx === "number" &&
              data.widthPx > 0 &&
              data.heightPx > 0
              ? `${data.widthPx}:${data.heightPx}`
              : "",
            VIDEO_GENERATION_ASPECT_RATIOS,
            "16:9",
          ) as FreezoneVideoAspectRatio)
        : aspectRatio;
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
    // 真人素材审核开关只对 Seedance 2.0 系列模型生效。归一化掉分隔符后匹配
    // `seedance2`，覆盖 `huimeng_seedance20_fast` / 未来可能的 `seedance_2_0` 等 id。
    const isSeedance20Model = /seedance2/i.test(modelId.replace(/[\s._-]/g, ""));
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
    const videoBackendForCost =
      videoModelsLoading || videoModelsFallback
        ? null
        : (selectedVideoModel?.apiModel ?? null);
    // Debounce the cost-estimate inputs: dragging the duration slider (and,
    // to a lesser degree, flipping count/quality/model) churns the query key
    // and TanStack Query aborts each in-flight request, spraying "Canceled"
    // rows across the Network tab. Coalesce to one request once the params
    // settle (~350ms). Primitives only — see useDebouncedValue's contract.
    const debouncedBackend = useDebouncedValue(videoBackendForCost, 350);
    const debouncedQuality = useDebouncedValue(quality, 350);
    const debouncedCount = useDebouncedValue(count, 350);
    const debouncedDurationSec = useDebouncedValue(durationSec, 350);
    const videoCreditCost = useGenerationCreditCost(
      "video_backend",
      debouncedBackend,
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
    const cameraTemplatesQuery = useFreezoneVideoCameraTemplates();
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
    const hasGenerationError =
      !isGenerating && !data.videoUrl && generationError.length > 0;
    const generationErrorRequestId =
      typeof data.generationErrorRequestId === "string" && data.generationErrorRequestId
        ? data.generationErrorRequestId
        : "";

    // 生成结束（成功/失败）后清掉临时历史预览，让主体回到最新结果。
    useEffect(() => {
      if (!isGenerating) setHistoryPreviewUrl(null);
    }, [isGenerating]);

    const handleRestoreHistory = useCallback(
      (record: FreezoneGenerationHistoryRecord) => {
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
    const referenceImages = useMemo(() => {
      const upstream = sortUpstreamByReferenceOrder(
        upstreamNodes,
        data.referenceOrder,
      );
      return upstream
        .map((node) => {
          const url = referenceImageUrl(node);
          if (!url) return null;
          return { nodeId: node.id, url };
        })
        .filter(
          (entry): entry is { nodeId: string; url: string } => entry != null,
        );
    }, [upstreamNodes, data.referenceOrder]);

    // 统一的「图 / 视 / 音」上游引用条目，给 chips 行用。顺序按连接顺序
    // （与 referenceImages 同步），让 chip 编号 1/2/3... 跟可视顺序一致。
    // text 上游不进这一行 —— 上面已经单独渲染了「@文本 chip」。
    const referenceMedia = useMemo<VideoReferenceItem[]>(() => {
      const upstream = sortUpstreamByReferenceOrder(
        upstreamNodes,
        data.referenceOrder,
      );
      const items: VideoReferenceItem[] = [];
      for (const node of upstream) {
        const videoUrl = referenceVideoUrl(node);
        if (videoUrl) {
          const vdata = node.data as {
            previewImageUrl?: string | null;
            displayName?: string | null;
          };
          const thumbUrl =
            typeof vdata.previewImageUrl === "string" &&
            vdata.previewImageUrl.length > 0
              ? vdata.previewImageUrl
              : null;
          items.push({
            kind: "video",
            nodeId: node.id,
            videoUrl,
            thumbUrl,
            displayName: vdata.displayName ?? null,
          });
          continue;
        }
        if (isAudioNode(node)) {
          const audioUrl =
            typeof node.data.audioUrl === "string" &&
            node.data.audioUrl.length > 0
              ? node.data.audioUrl
              : null;
          if (!audioUrl) continue;
          items.push({
            kind: "audio",
            nodeId: node.id,
            audioUrl,
            displayName: node.data.displayName ?? null,
          });
          continue;
        }
        const url = referenceImageUrl(node);
        if (url) {
          items.push({
            kind: "image",
            nodeId: node.id,
            imageUrl: url,
            displayName:
              (node.data as { displayName?: string | null }).displayName ??
              null,
          });
        }
      }
      return items;
    }, [upstreamNodes, data.referenceOrder]);

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
    const upstreamCounts = useMemo(() => {
      let images = 0;
      let videos = 0;
      let audios = 0;
      for (const node of upstreamNodes) {
        if (referenceVideoUrl(node)) {
          // 视频节点或携带 videoUrl 的 upload 节点（资产库选入的视频）都算视频。
          videos += 1;
        } else if (isAudioNode(node)) {
          if (
            typeof node.data.audioUrl === "string" &&
            node.data.audioUrl.length > 0
          ) {
            audios += 1;
          }
        } else if (referenceImageUrl(node)) {
          images += 1;
        }
      }
      return { images, videos, audios };
    }, [upstreamNodes]);
    // HappyHorse 的模式可用性由「上游节点类型」决定，而非素材是否已填。空的图片
    // 节点（尚未生成/上传图）也应让「首帧 / 图片参考」可选——用户先连节点、后填图
    // 是正常顺序。所以这里按节点类型统计，区别于 upstreamCounts 的「已解析 URL」口径。
    const upstreamTypeCounts = useMemo(() => {
      let images = 0;
      let videos = 0;
      let audios = 0;
      for (const node of upstreamNodes) {
        // 携带 videoUrl 的 upload 节点（资产库视频）先判为视频，避免落到下面
        // 的 isUploadNode 分支被误算成图片。空的 video 节点（尚未生成）仍按类型算视频。
        if (isVideoNode(node) || referenceVideoUrl(node)) {
          videos += 1;
        } else if (isAudioNode(node)) {
          audios += 1;
        } else if (
          isImageGenNode(node) ||
          isUploadNode(node) ||
          isImageEditNode(node) ||
          isExportImageNode(node) ||
          isStoryboardGenNode(node)
        ) {
          images += 1;
        }
      }
      return { images, videos, audios };
    }, [upstreamNodes]);
    const generationModeOptions = useMemo(
      () =>
        resolveVideoGenerationModeOptions({
          isHappyHorseModel,
          // HappyHorse 按上游节点类型判断，空图片节点也算；其它模型按已解析素材判断。
          upstreamCounts: isHappyHorseModel
            ? upstreamTypeCounts
            : upstreamCounts,
        }),
      [isHappyHorseModel, upstreamCounts, upstreamTypeCounts],
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
    const resolvedWidth = Math.max(
      MIN_WIDTH,
      Math.round(width ?? DEFAULT_WIDTH),
    );
    const resolvedHeight = Math.max(
      MIN_HEIGHT,
      Math.round(height ?? DEFAULT_HEIGHT),
    );
    // 收起态浮动面板固定基础尺寸；放大用居中弹窗（见下方 OperationPanelShell）。
    const [panelExpanded, setPanelExpanded] = useState(false);
    const panelHeight = OPERATIONS_PANEL_HEIGHT;
    const panelOverhang = OPERATIONS_PANEL_OVERHANG;

    // ── 叠卡画册（count > 1 的一组生成结果，与图片节点同构）──
    // 收拢时主视频后探出 N-1 张卡片边；hover 出现右上角数量徽标，点开展开成
    // 宫格画册。展开态点视频设为主视频、可单独「应用到画布」/ 下载。
    const albumRootRef = useRef<HTMLDivElement | null>(null);
    const [albumExpanded, setAlbumExpanded] = useState(false);
    // 本次会话内"应到条数"——未完成的在画册里占位。存模块级登记表而非组件
    // state：onlyRenderVisibleElements 下平移出视口会卸载组件，state 会丢。
    const albumPendingTotal = useAlbumPendingTotal(id);
    const albumUrls = useMemo(() => {
      const raw = data.generationBatch;
      if (!Array.isArray(raw)) return [];
      return raw.filter((u): u is string => typeof u === 'string' && u.length > 0);
    }, [data.generationBatch]);
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
        const projectId = readUrl().project;
        if (!projectId) {
          console.error("[video-node] no project in URL");
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
          const uploaded = await uploadFreezoneVideo(
            projectId,
            prepared.file,
            prepared.file.name,
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
      [clearTransientPreview, id, updateNodeData],
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
        const file = resolveDroppedVideoFile(event.dataTransfer);
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
      (mode: "firstFrame" | "firstLastFrame") => {
        const state = useCanvasStore.getState();
        const self = state.nodes.find((n) => n.id === id);
        if (!self) return;
        const isFirstFrame = mode === "firstFrame";
        // 两种源节点的默认尺寸不同（图片节点 580×360 / 上传节点 320×350），
        // 左列的定位与避让都得按实际尺寸算，否则图片节点会压到视频节点身上。
        const FRAME_WIDTH = isFirstFrame ? IMAGE_GEN_NODE_WIDTH : 320;
        const FRAME_HEIGHT = isFirstFrame ? IMAGE_GEN_NODE_HEIGHT : 350;
        const GAP_X = 40;
        const GAP_Y = 24;
        const baseX = self.position.x - FRAME_WIDTH - GAP_X;
        const stepY = FRAME_HEIGHT + GAP_Y;
        const nodeSize = (node: CanvasNode) => ({
          width:
            node.measured?.width ??
            (typeof node.width === "number" ? node.width : FRAME_WIDTH),
          height:
            node.measured?.height ??
            (typeof node.height === "number" ? node.height : FRAME_HEIGHT),
        });
        const overlaps = (
          a: { x: number; y: number; width: number; height: number },
          b: { x: number; y: number; width: number; height: number },
        ) => {
          const margin = 12;
          return (
            a.x < b.x + b.width + margin &&
            a.x + a.width + margin > b.x &&
            a.y < b.y + b.height + margin &&
            a.y + a.height + margin > b.y
          );
        };
        const occupiedRects = state.nodes
          .filter((node) => node.id !== self.id)
          .map((node) => {
            const size = nodeSize(node);
            return {
              x: node.position.x,
              y: node.position.y,
              width: size.width,
              height: size.height,
            };
          });
        const upstreamIds = new Set(
          state.edges.filter((edge) => edge.target === id).map((edge) => edge.source),
        );
        const frameColumnNodes = state.nodes.filter((node) => {
          if (!upstreamIds.has(node.id)) return false;
          if (
            node.type !== CANVAS_NODE_TYPES.upload &&
            node.type !== CANVAS_NODE_TYPES.imageGen
          ) {
            return false;
          }
          return Math.abs(node.position.x - baseX) < 8;
        });
        const lastFrameColumnY = frameColumnNodes.reduce<number | null>(
          (maxY, node) => (maxY === null ? node.position.y : Math.max(maxY, node.position.y)),
          null,
        );
        const resolveAvailableY = (preferredY: number) => {
          let y =
            lastFrameColumnY === null
              ? preferredY
              : Math.max(preferredY, lastFrameColumnY + stepY);
          for (let attempt = 0; attempt < 40; attempt += 1) {
            const candidate = { x: baseX, y, width: FRAME_WIDTH, height: FRAME_HEIGHT };
            if (!occupiedRects.some((rect) => overlaps(candidate, rect))) {
              occupiedRects.push(candidate);
              return y;
            }
            y += stepY;
          }
          occupiedRects.push({ x: baseX, y, width: FRAME_WIDTH, height: FRAME_HEIGHT });
          return y;
        };
        if (isFirstFrame) {
          const baseY = resolveAvailableY(
            self.position.y + ((self.height ?? DEFAULT_HEIGHT) - FRAME_HEIGHT) / 2,
          );
          const newId = addNode(
            CANVAS_NODE_TYPES.imageGen,
            { x: baseX, y: baseY },
            {
              displayName: "首帧",
            },
          );
          addEdge(newId, id);
          state.autoGroupSpawn(id, [newId], { label: '首帧生成视频组' });
          // 首帧走全能参考（把上游图当参考图喂给全能生成端点），并把提示词直接
          // 写好；用户已经写过提示词就别覆盖他的内容。
          updateNodeData(id, {
            genMode: "allReference",
            ...(prompt.trim() ? {} : { prompt: FIRST_FRAME_PROMPT }),
          });
          return;
        }
        const totalH = FRAME_HEIGHT * 2 + GAP_Y;
        const startY =
          self.position.y + ((self.height ?? DEFAULT_HEIGHT) - totalH) / 2;
        const firstY = resolveAvailableY(startY);
        const lastY = resolveAvailableY(firstY + stepY);
        const firstId = addNode(
          CANVAS_NODE_TYPES.upload,
          { x: baseX, y: firstY },
          { displayName: "首帧" },
        );
        addEdge(firstId, id);
        const lastId = addNode(
          CANVAS_NODE_TYPES.upload,
          { x: baseX, y: lastY },
          { displayName: "尾帧" },
        );
        addEdge(lastId, id);
        state.autoGroupSpawn(id, [firstId, lastId], { label: '首尾帧生成视频组' });
        updateNodeData(id, { genMode: "firstLastFrame" });
      },
      [addEdge, addNode, id, prompt, updateNodeData],
    );

    // Spawn reference nodes from selected asset-library entries — one per
    // selection, stacked vertically to the left of this video node, then wired
    // as upstream references so they show up in the operations panel. The node
    // type depends on the media: images/videos become upload nodes carrying
    // imageUrl/videoUrl, audio becomes an audio node carrying audioUrl.
    const spawnCharacterLibraryReferences = useCallback(
      (selections: ReadonlyArray<AssetLibrarySelection>) => {
        if (selections.length === 0) return;
        const state = useCanvasStore.getState();
        const self = state.nodes.find((n) => n.id === id);
        if (!self) return;
        const UPLOAD_WIDTH = 320;
        const UPLOAD_HEIGHT = 240;
        const GAP_X = 40;
        const GAP_Y = 24;
        const baseX = self.position.x - UPLOAD_WIDTH - GAP_X;
        const totalH =
          UPLOAD_HEIGHT * selections.length + GAP_Y * (selections.length - 1);
        const startY =
          self.position.y + ((self.height ?? DEFAULT_HEIGHT) - totalH) / 2;
        const newIds: string[] = [];
        selections.forEach((sel, idx) => {
          const y = startY + idx * (UPLOAD_HEIGHT + GAP_Y);
          const displayName = sel.name || undefined;
          let newId: string;
          if (sel.media === "audio") {
            newId = addNode(
              CANVAS_NODE_TYPES.audio,
              { x: baseX, y },
              { audioUrl: sel.url, displayName },
            );
          } else if (sel.media === "video") {
            // 资产库视频作为「上游视频引用素材」：建 referenceOnly 的 video 节点，
            // 它能播放视频本体、被 isVideoNode 识别、下游自动切 videoEdit。之前建的是
            // 只渲染图片的 upload 节点——即便塞了 videoUrl 也不显示、也不被识别成视频。
            newId = addNode(
              CANVAS_NODE_TYPES.video,
              { x: baseX, y },
              {
                videoUrl: sel.url,
                aspectRatio: data.aspectRatio,
                displayName,
                referenceOnly: true,
              } as Partial<VideoNodeData>,
            );
          } else {
            newId = addNode(
              CANVAS_NODE_TYPES.upload,
              { x: baseX, y },
              {
                imageUrl: sel.url,
                previewImageUrl: sel.url,
                displayName,
              },
            );
          }
          addEdge(newId, id);
          newIds.push(newId);
        });
        state.autoGroupSpawn(id, newIds, { label: '资产参考组' });
      },
      [addEdge, addNode, data.aspectRatio, id],
    );

    const handleTranslatePrompt = useCallback(async () => {
      if (isTranslatingPrompt || isGenerating) return;
      const trimmed = prompt.trim();
      if (trimmed.length === 0) return;
      const project = readUrl().project;
      if (!project) {
        console.error("[video-node] translate: no project in URL");
        return;
      }
      setIsTranslatingPrompt(true);
      try {
        const ref = await submitFreezoneTextTranslate(project, {
          text: prompt,
          nodeType: "video",
          canvasId: readUrl().canvas ?? "default",
          nodeId: id,
        });
        await awaitTaskCompletion(ref.task_key, project);
        const result = await fetchFreezoneTextTranslateResult(
          project,
          ref.job_id,
        );
        if (result.translated_text) {
          updateNodeData(id, { prompt: result.translated_text });
        }
      } catch (error) {
        console.error("[video-node] translate failed", error);
      } finally {
        setIsTranslatingPrompt(false);
      }
    }, [id, isGenerating, isTranslatingPrompt, prompt, updateNodeData]);

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
    // HappyHorse 走下面的统一状态机，不参与这条默认。
    useEffect(() => {
      if (isHappyHorseModel) return;
      if (data.genMode != null) return;
      if (referenceImages.length === 0) return;
      updateNodeData(id, { genMode: "allReference" });
    }, [data.genMode, id, isHappyHorseModel, referenceImages.length, updateNodeData]);

    // HappyHorse 的模式完全由上游节点类型决定（文档的 4 大功能一一对应），这里用
    // 一条统一状态机替代分散的兜底 effect，避免多个 effect 互相打架：
    //   - 上游有视频            → 视频编辑 (videoEdit / video_url)
    //   - 上游图片 >1 张        → 图片参考 (imageReference / reference_images 1-9)
    //   - 上游图片 == 1 张      → 默认首帧 (imageToVideo / image_url)，但尊重用户
    //                             主动切到的「图片参考」
    //   - 无上游                → 文生视频 (textToVideo)
    // 每次都纠正，确保 genMode 不会卡在与当前上游不匹配的模式（否则 submit 时会被
    // 静默截断 / 触发上游互斥报错）。
    useEffect(() => {
      if (!isHappyHorseModel) return;
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
      isHappyHorseModel,
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
      if (!prev && hasAudioUpstream && data.genMode !== "allReference" && !isHappyHorseModel) {
        updateNodeData(id, { genMode: "allReference" });
      }
    }, [data.genMode, hasAudioUpstream, id, isHappyHorseModel, updateNodeData]);

    // 上游接入视频素材时，只有「全能参考」能消费视频；其它模式（文生 / 图生 /
    // 首尾帧 / 图片参考）都会把视频丢弃。所以只要上游存在视频就强制切到
    // allReference 并锁死——下面的 tab 禁用规则会把其它 tab 一并禁用。
    // 与音频的「0→≥1 transition」不同，这里每次都纠正，确保视频在场期间无法切走。
    useEffect(() => {
      if (upstreamCounts.videos === 0) return;
      if (isHappyHorseModel) return;
      if (genMode === "allReference") return;
      updateNodeData(id, { genMode: "allReference" });
    }, [upstreamCounts.videos, genMode, id, isHappyHorseModel, updateNodeData]);

    // 文生视频不接受任何素材引用。即便用户先手动选了 textToVideo 再接入
    // 图片/音频（此时上面两个自动切换 effect 都因 genMode 已显式而 bail），
    // 也要强制切走，否则会停在 textToVideo 把已连素材丢弃。图片/音频统一走
    // allReference（全能参考），与「首次接入图片」的默认保持一致。
    useEffect(() => {
      if (isHappyHorseModel) return;
      if (genMode !== "textToVideo") return;
      if (upstreamCounts.images === 0 && upstreamCounts.audios === 0) return;
      updateNodeData(id, { genMode: "allReference" });
    }, [
      genMode,
      isHappyHorseModel,
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
      if (isHappyHorseModel) return;
      if (genMode !== "firstLastFrame") return;
      if (upstreamCounts.images <= 2) return;
      updateNodeData(id, { genMode: "allReference" });
    }, [genMode, isHappyHorseModel, upstreamCounts.images, id, updateNodeData]);

    useEffect(
      () => () => {
        clearTransientPreview();
      },
      [clearTransientPreview],
    );

    const videoSource = useMemo(() => {
      if (data.videoUrl) return resolveImageDisplayUrl(data.videoUrl);
      if (transientPreviewUrl) return transientPreviewUrl;
      return null;
    }, [data.videoUrl, transientPreviewUrl]);

    // 预览专用 src：preload="metadata" 不会绘制任何一帧，又没有 poster，画布上
    // 就是一个纯黑框（视频本身正常，下载可看）。追加 `#t=0.1` 媒体片段，让浏览器
    // seek 到 0.1s 并把那一帧画出来当封面——与 NodeGenerationHistory /
    // CanvasHistoryAssetsModal 的缩略图用法一致。仅用于显示，不影响下载/抓帧/播放。
    const videoPosterSource = useMemo(() => {
      if (!videoSource) return null;
      return videoSource.includes("#t=") ? videoSource : `${videoSource}#t=0.1`;
    }, [videoSource]);

    useEffect(() => {
      updateNodeInternals(id);
    }, [id, resolvedHeight, resolvedWidth, updateNodeInternals]);

    const [hasMetadata, setHasMetadata] = useState(false);
    const [videoLoadError, setVideoLoadError] = useState(false);
    useEffect(() => {
      setHasMetadata(false);
      setVideoLoadError(false);
    }, [videoSource]);

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
      (containerW: number, containerH: number) => {
        const vw = data.widthPx ?? 0;
        const vh = data.heightPx ?? 0;
        if (!vw || !vh || containerW <= 0 || containerH <= 0) {
          return { left: 0, top: 0, width: containerW, height: containerH };
        }
        const containerRatio = containerW / containerH;
        const videoRatio = vw / vh;
        if (videoRatio > containerRatio) {
          const w = containerW;
          const h = containerW / videoRatio;
          return { left: 0, top: (containerH - h) / 2, width: w, height: h };
        }
        const h = containerH;
        const w = containerH * videoRatio;
        return { left: (containerW - w) / 2, top: 0, width: w, height: h };
      },
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
        const projectId = readUrl().project;
        if (!projectId) {
          console.error("[video-node] clip: no project in URL");
          return;
        }
        // Compose only supports 720p / 1080p — fall back to 720p for 480P sources.
        const composeResolution = quality === "1080P" ? "1080p" : "720p";
        setIsComposingClip(true);
        setClipError(null);
        try {
          const sourceStart = startMs / 1000;
          const sourceEnd = endMs / 1000;
          const ref = await submitFreezoneVideoCompose(projectId, {
            resolution: composeResolution,
            tracks: [
              {
                trackId: `track_${id}_video`,
                kind: "video",
                items: [
                  {
                    itemId: `item_${id}_${Date.now()}`,
                    sourceUrl,
                    timelineStart: 0,
                    sourceStart,
                    sourceEnd,
                  },
                ],
              },
            ],
          });
          await awaitTaskCompletion(ref.task_key, projectId);
          const result = await fetchFreezoneJobResult(
            projectId,
            "freezone_video_compose",
            ref.job_id,
          );
          if (result.url) {
            const state = useCanvasStore.getState();
            const position = state.findNodePosition(
              id,
              DEFAULT_WIDTH,
              DEFAULT_HEIGHT,
            );
            const newNodeId = addNode(CANVAS_NODE_TYPES.video, position, {
              videoUrl: result.url,
              durationMs: Math.round((sourceEnd - sourceStart) * 1000),
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
        quality,
        updateNodeData,
      ],
    );

    const handleEraseSubmit = useCallback(async () => {
      if (isErasing) return;
      if (!data.videoUrl) return;
      if (subtitleEraseMode === "box" && !subtitleEraseBox) return;
      const projectId = readUrl().project;
      if (!projectId) {
        console.error("[video-node] no project in URL");
        return;
      }
      setIsErasing(true);
      try {
        const ref = await submitFreezoneVideoErase(projectId, {
          sourceUrl: data.videoUrl,
          mode: subtitleEraseMode === "box" ? "box" : "smart_subtitle",
          box: subtitleEraseMode === "box" ? subtitleEraseBox : null,
        });
        await awaitTaskCompletion(ref.task_key, projectId);
        const result = await fetchFreezoneJobResult(
          projectId,
          "freezone_video_erase",
          ref.job_id,
        );
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
      subtitleEraseBox,
      subtitleEraseMode,
      updateNodeData,
    ]);

    const submitDisabled =
      isGenerating ||
      (prompt.trim().length === 0 && upstreamTextJoined.length === 0);

    const handleSubmit = useCallback(async () => {
      if (submitDisabled) return;
      // 在途守卫（与 ImageGenNode 一致）：第 1 条完成就会清 isGenerating，
      // submitDisabled 拦不住「旧批次 N-1 个任务还在跑时重新提交」——旧闭包
      // 会用过期的 completedUrls 覆写新批次的 generationBatch。
      if (submittingRef.current) return;
      submittingRef.current = true;
      try {
      const projectId = readUrl().project;
      if (!projectId) {
        console.error("[video-node] no project in URL");
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
      const fragment = cameraMovementPreset?.promptFragment;
      const trimmedPrompt = prompt.trim();
      const userPrompt = [upstreamTextJoined, trimmedPrompt]
        .filter((s) => s.length > 0)
        .join("\n\n");
      const composedPrompt = fragment
        ? userPrompt
          ? `${fragment}，${userPrompt}`
          : fragment
        : userPrompt;
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
        const canvasId = readUrl().canvas ?? "default";

        // 后端不再支持一次出多条，改为按「生成数量」并发调用 N 次接口。先按
        // genMode 组装出一个「调一次接口」的闭包 doSubmit，校验失败则置空提前返回。
        let doSubmit: ((targetId: string) => Promise<FreezoneJobRef>) | null = null;
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
            submitFreezoneVideoKeyframes(projectId, {
              firstFrameUrl,
              lastFrameUrl,
              prompt: composedPrompt,
              cameraTemplateId,
              aspectRatio: submitAspectRatio,
              resolution: qualityToResolution(quality),
              durationSeconds: durationClamped,
              generateAudio,
              model: modelId,
              genMode,
              humanReview: isSeedance20Model && humanReview,
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
            submitFreezoneVideoI2v(projectId, {
              imageUrls,
              prompt: composedPrompt,
              cameraTemplateId,
              aspectRatio: submitAspectRatio,
              resolution: qualityToResolution(quality),
              durationSeconds: durationClamped,
              generateAudio,
              model: modelId,
              genMode,
              humanReview: isSeedance20Model && humanReview,
              sceneOptimize: sceneOptimize ?? null,
              canvasId,
              nodeId: targetId,
            });
        } else if (genMode === "videoEdit") {
          // HappyHorse 视频编辑：1 个源视频 + 0-5 张参考图 → video_url + reference_images。
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
          if (allImageUrls.length > 5) {
            // 视频编辑上游硬上限 5 张参考图；超出的静默截断会让用户以为全用上了。
            toast.warning(
              `视频编辑最多支持 5 张参考图，已使用前 5 张（忽略其余 ${allImageUrls.length - 5} 张）`,
            );
          }
          const imageUrls = allImageUrls.slice(0, 5);
          doSubmit = (targetId) =>
            submitFreezoneVideoEdit(projectId, {
              videoUrl,
              imageUrls,
              prompt: composedPrompt,
              cameraTemplateId,
              aspectRatio: submitAspectRatio,
              resolution: qualityToResolution(quality),
              durationSeconds: durationClamped,
              audioSetting: "auto",
              generateAudio,
              model: modelId,
              genMode,
              canvasId,
              nodeId: targetId,
            });
        } else if (genMode === "allReference") {
          if (isHappyHorseModel) {
            void showErrorDialog(
              "HappyHorse 不支持全能参考模式，请切换为文生视频或图生视频。",
              t("common.error"),
            );
            updateNodeData(id, {
              isGenerating: false,
              generationStartedAt: null,
            });
            return;
          }
          // Omni-gen: classify each upstream node by its media type.
          // backend caps: image≤9, video≤3, audio≤3, total≤12.
          const upstream = collectUpstream();
          const references: FreezoneVideoReferenceItem[] = [];
          // 与 references 里 type==="audio" 的项一一对应，用于提交前校验音频总时长。
          const audioRefs: { url: string; durationMs: number | null }[] = [];
          let imageCount = 0;
          let videoCount = 0;
          let audioCount = 0;
          for (const node of upstream) {
            if (references.length >= 12) break;
            const videoRefUrl = referenceVideoUrl(node);
            if (videoRefUrl) {
              // 视频节点或携带 videoUrl 的 upload 节点（资产库视频）统一收集。
              if (videoCount < 3) {
                references.push({ type: "video", url: videoRefUrl });
                videoCount += 1;
              }
            } else if (isAudioNode(node)) {
              const url =
                typeof node.data.audioUrl === "string"
                  ? node.data.audioUrl
                  : "";
              if (url && audioCount < 3) {
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
              if (url && imageCount < 9) {
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
          // Seedance 2.0 后端限制音频总时长 ≤ 15.2s，超了会以 InvalidParameter
          // 报错。提交前先本地校验：durationMs 缺失时用 <audio> 探测兜底，超限就
          // 弹窗拦下，避免白跑一趟后端。仅对 seedance2 生效（其它模型上限可能不同）。
          if (isSeedance20Model && audioRefs.length > 0) {
            const resolvedDurations = await Promise.all(
              audioRefs.map((ref) =>
                typeof ref.durationMs === "number" && ref.durationMs > 0
                  ? Promise.resolve(ref.durationMs)
                  : probeAudioDurationMs(ref.url),
              ),
            );
            const totalAudioMs = resolvedDurations.reduce<number>(
              (sum, ms) => sum + (ms ?? 0),
              0,
            );
            if (totalAudioMs > MAX_AUDIO_TOTAL_DURATION_MS) {
              void showErrorDialog(
                t("node.videoNode.audio.durationExceeded", { max: 15 }),
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
            submitFreezoneVideoOmniGen(projectId, {
              prompt: composedPrompt,
              cameraTemplateId,
              references,
              aspectRatio: submitAspectRatio,
              resolution: qualityToResolution(quality),
              durationSeconds: durationClamped,
              generateAudio,
              model: modelId,
              genMode,
              humanReview: isSeedance20Model && humanReview,
              sceneOptimize: sceneOptimize ?? null,
              canvasId,
              nodeId: targetId,
            });
        } else {
          // textToVideo (default).
          doSubmit = (targetId) =>
            submitFreezoneVideoGen(projectId, {
              prompt: composedPrompt,
              cameraTemplateId,
              aspectRatio: submitAspectRatio,
              resolution: qualityToResolution(quality),
              durationSeconds: durationClamped,
              generateAudio,
              model: modelId,
              genMode,
              humanReview: isSeedance20Model && humanReview,
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
            const completed = await awaitTaskCompletion(ref.task_key, projectId);
            // Prefer the dedicated result endpoint — SSE `task.result` may only
            // carry metadata (same pattern as reverse_prompt + video_erase).
            let url = resolveGenerationOutputUrl(completed.result, "video");
            if (!url) {
              try {
                const result = await fetchFreezoneJobResult(
                  projectId,
                  ref.task_type,
                  ref.job_id,
                );
                url = result.url || null;
              } catch (error) {
                console.error("[video-node] fetch job result failed", error);
              }
            }
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
                completed,
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
      count,
      durationBounds,
      durationSec,
      generateAudio,
      genMode,
      humanReview,
      id,
      isSeedance20Model,
      modelId,
      prompt,
      quality,
      refreshHistory,
      sceneOptimize,
      submitDisabled,
      updateNodeData,
      upstreamTextJoined,
    ]);

    const hasMainlineContext = hasMainlineContexts(
      (data as { mainline_context?: unknown }).mainline_context,
    );

    const cardToneClass = canvasNodeFrameClass({
      selected,
      mainline: hasMainlineContext,
    });

    const isUploading = Boolean(data.isUploading);
    const isEmptyVideoBody = !videoSource && !isUploading && !isGenerating && !hasGenerationError;
    const bodySurfaceClass = isEmptyVideoBody
      ? CANVAS_NODE_INPUT_SURFACE_CLASS
      : CANVAS_NODE_PANEL_SURFACE_CLASS;
    const bodyFrameClass = isEmptyVideoBody
      ? selected
        ? CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS
        : CANVAS_NODE_INPUT_BODY_FRAME_CLASS
      : cardToneClass;
    const showVideoOpsPanel =
      selected &&
      !isBoxSelecting &&
      !albumExpanded &&
      !isClipMode &&
      !subtitleEraseMode &&
      !data.referenceOnly &&
      // 视频高清节点用自己的 VideoUpscaleEditorOverlay 配置面板，不走常规生成面板。
      !data.isUpscaleNode;

    const handleCaptureFrame = useCallback(
      async (mode: "first" | "last" | "current") => {
        if (isCapturingFrame) return;
        if (!data.videoUrl) return;
        const projectId = readUrl().project;
        if (!projectId) {
          console.error("[video-node] no project in URL");
          return;
        }
        const src = resolveImageDisplayUrl(data.videoUrl);
        const liveEl = videoRef.current;
        const liveDuration =
          liveEl && Number.isFinite(liveEl.duration) ? liveEl.duration : null;
        const fallbackDurationSec =
          typeof data.durationMs === "number" ? data.durationMs / 1000 : null;
        const knownDuration = liveDuration ?? fallbackDurationSec;
        let seekSec = 0;
        if (mode === "first") {
          seekSec = 0;
        } else if (mode === "last") {
          seekSec =
            knownDuration != null
              ? Math.max(0, knownDuration - 0.05)
              : Number.MAX_SAFE_INTEGER;
        } else {
          seekSec =
            liveEl && Number.isFinite(liveEl.currentTime)
              ? liveEl.currentTime
              : 0;
        }

        setIsCapturingFrame(true);
        try {
          const blob = await captureVideoFrameBlob(src, seekSec);
          const filename = `frame-${mode}-${Date.now()}.png`;
          const file = new File([blob], filename, { type: "image/png" });
          const uploaded = await uploadFreezoneImage(
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
        t,
        updateNodeData,
      ],
    );

    return (
      <div
        ref={albumRootRef}
        className="group relative h-full w-full overflow-visible"
        style={{ width: resolvedWidth, height: resolvedHeight }}
        onClick={() => setSelectedNode(id)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {hasAlbum && !albumExpanded && videoSource && (
          <VideoAlbumDeck
            totalSlots={albumTotalSlots}
            onExpand={handleToggleAlbumExpanded}
          />
        )}
        <Handle
          type="target"
          position={Position.Left}
          id="target"
          className="!h-2 !w-2 !border-0 !bg-muted-foreground"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="source"
          className="!h-2 !w-2 !border-0 !bg-muted-foreground"
        />

        {/* 画册展开时隐藏浮动标题和分辨率角标——画册容器自带头部（与图片节点一致）。 */}
        {!albumExpanded && (
          <>
            <NodeHeader
              className={NODE_HEADER_FLOATING_POSITION_CLASS}
              icon={<VideoIcon className="h-4 w-4" />}
              titleText={resolvedTitle}
              editable
              onTitleChange={(nextTitle) =>
                updateNodeData(id, { displayName: nextTitle })
              }
            />
            {videoSource &&
            hasMetadata &&
            !videoLoadError &&
            typeof data.widthPx === "number" &&
            typeof data.heightPx === "number" &&
            data.widthPx > 0 &&
            data.heightPx > 0 ? (
              <div
                className="absolute -top-7 right-1 z-20 flex items-center gap-1 rounded-md border border-media-foreground/10 bg-media/55 px-2 py-0.5 text-[11px] font-medium tabular-nums text-media-foreground/70 backdrop-blur-sm"
                title={t("node.videoNode.resolution")}
              >
                <VideoIcon className="h-3 w-3 text-media-foreground/45" />
                {data.widthPx}×{data.heightPx}
              </div>
            ) : null}
          </>
        )}
        <NodeContextBadges
          contexts={(data as { mainline_context?: unknown }).mainline_context}
        />

        <NodeResizeHandle
          minWidth={MIN_WIDTH}
          minHeight={MIN_HEIGHT}
          maxWidth={MAX_WIDTH}
          maxHeight={MAX_HEIGHT}
          keepAspectRatio
        />

        {!videoSource && !isUploading && !isGenerating && !data.isUpscaleNode && (
          <VideoUploadActionRail
            nodeId={id}
            selected={Boolean(selected)}
            onUpload={handleUploadClick}
          />
        )}

        <div
          className={`relative flex h-full w-full items-center justify-center ${videoSource ? "overflow-hidden" : "overflow-visible"} rounded-[var(--node-radius)] border ${bodySurfaceClass} transition-colors ${bodyFrameClass} ${
            // 画册展开时藏起节点本体——半透明的画册容器盖不严，底下的视频会透出来。
            albumExpanded && hasAlbum ? "invisible" : ""
          }`}
        >
          {/* 生成/上传中优先显示 loading：原地重新生成时 videoUrl 仍是上一条结果，
              若不加这层 guard，旧视频会一直占位、isGenerating 分支永远到不了。
              失败时 isGenerating 归 false，旧视频自动复现（videoUrl 未被清空）。 */}
          {!isGenerating && !isUploading && videoSource ? (
            <video
              ref={setVideoRef}
              src={videoPosterSource ?? undefined}
              className="h-full w-full object-contain"
              playsInline
              preload="metadata"
              onClick={() => {
                // 点击视频本体只负责选中节点 —— 播放/暂停统一交给左下角按钮。
                setSelectedNode(id);
              }}
              onLoadedMetadata={(event) => {
                const el = event.currentTarget;
                setHasMetadata(true);
                setVideoLoadError(false);
                if (el.videoWidth && el.videoHeight) {
                  // 只把视频真实像素记到 widthPx/heightPx；不要写回 aspectRatio。
                  // aspectRatio 仅保存用户选的比例预设（16:9 / auto…），否则
                  // chip 会显示成像素串(1248:704)，且会作为非法 aspect_ratio 带进
                  // 下一次生成请求。
                  const updates: Partial<VideoNodeData> = {};
                  if (data.widthPx !== el.videoWidth)
                    updates.widthPx = el.videoWidth;
                  if (data.heightPx !== el.videoHeight)
                    updates.heightPx = el.videoHeight;
                  if (data.durationMs !== Math.round(el.duration * 1000)) {
                    updates.durationMs = Math.round(el.duration * 1000);
                  }
                  if (Object.keys(updates).length > 0) {
                    updateNodeData(id, updates);
                  }
                }
              }}
              onError={() => {
                setHasMetadata(true);
                setVideoLoadError(true);
              }}
            />
          ) : isUploading ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted/85">
              <Loader2 className="h-7 w-7 animate-spin opacity-70" />
              <span className="px-4 text-center text-[12px] leading-6">
                {t("node.videoNode.uploading")}
              </span>
            </div>
          ) : isGenerating && historyPreviewUrl ? (
            // 生成进行中，但用户点了历史记录预览：临时播放那条历史视频，新视频
            // 仍在后台生成。顶部 pill 提示「生成中」，右上「返回」回到 loading。
            <div className="relative h-full w-full">
              <video
                src={resolveImageDisplayUrl(historyPreviewUrl)}
                className="h-full w-full object-contain"
                controls
                playsInline
                preload="metadata"
                onClick={(event) => event.stopPropagation()}
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2">
                <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-media/60 px-2.5 py-1 text-[11px] text-media-foreground/90 backdrop-blur">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  新视频生成中…
                </span>
                <button
                  type="button"
                  className="nodrag pointer-events-auto inline-flex items-center gap-1 rounded-full bg-media/60 px-2.5 py-1 text-[11px] text-media-foreground/90 backdrop-blur transition-colors hover:bg-media/75"
                  onClick={(event) => {
                    event.stopPropagation();
                    setHistoryPreviewUrl(null);
                  }}
                >
                  <XIcon className="h-3 w-3" />
                  返回
                </button>
              </div>
            </div>
          ) : isGenerating ? (
            <div className="relative h-full w-full">
              {data.previewImageUrl ? (
                <img
                  src={resolveImageDisplayUrl(data.previewImageUrl)}
                  alt=""
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : null}
              <NodeGenerationOverlay
                startedAt={data.generationStartedAt ?? null}
                durationMs={data.generationDurationMs}
                hasBackground={Boolean(data.previewImageUrl)}
              />
            </div>
          ) : hasGenerationError ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-destructive">
              <AlertTriangle className="h-7 w-7 opacity-90" />
              <span className="text-center text-[12px] font-medium leading-5 text-destructive">
                视频生成失败
              </span>
              <span className="max-h-[64px] overflow-y-auto break-words text-center text-[11px] leading-5 text-destructive [overflow-wrap:anywhere]">
                {generationError}
              </span>
              {generationErrorRequestId && (
                <div className="flex w-full max-w-[240px] items-center gap-1 rounded bg-destructive/10 px-2 py-1">
                  <span className="shrink-0 text-[10px] text-destructive">请求ID</span>
                  <code
                    className="min-w-0 flex-1 truncate font-mono text-[10px] text-destructive"
                    title={generationErrorRequestId}
                  >
                    {generationErrorRequestId}
                  </code>
                </div>
              )}
              <div className="mt-1">
                <RegenerateButton
                  onClick={() => void handleSubmit()}
                  busy={isGenerating}
                  disabled={submitDisabled}
                />
              </div>
            </div>
          ) : (
            <VideoNodeEmptyState
              isUpscaleNode={Boolean(data.isUpscaleNode)}
              isConnected={isConnected}
              hasUpstreamVideo={upstreamCounts.videos > 0}
              onSpawnFirstLastFrame={() => spawnFrameUploads("firstLastFrame")}
              onSpawnFirstFrame={() => spawnFrameUploads("firstFrame")}
            />
          )}

          {videoSource && videoLoadError && !isGenerating && !isUploading && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-media/80 px-4 text-center text-destructive">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <span className="text-[12px] font-medium">视频加载失败</span>
            </div>
          )}

          {videoSource && !hasMetadata && !isUploading && !isGenerating && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-dark/40">
              <Loader2 className="h-6 w-6 animate-spin text-text-muted/70" />
            </div>
          )}

          {videoSource &&
            hasMetadata &&
            !videoLoadError &&
            !isGenerating &&
            !isUploading &&
            !subtitleEraseMode && (
              <VideoPlayerControls
                videoEl={videoEl}
                isCapturingFrame={isCapturingFrame}
                onCapture={handleCaptureFrame}
              />
            )}

          {hasAlbum && !isGenerating && videoSource && (
            <VideoAlbumToggleButton
              totalSlots={albumTotalSlots}
              completedCount={albumUrls.length}
              pendingTotal={albumPendingTotal}
              pendingCount={albumPendingCount}
              expanded={albumExpanded}
              onToggle={handleToggleAlbumExpanded}
            />
          )}

          {videoSource && subtitleEraseMode === "box" && (
            <SubtitleEraseBoxOverlay
              box={subtitleEraseBox}
              drag={eraseDrag}
              disabled={isErasing}
              getDisplayedRect={getDisplayedVideoRect}
              onDragStart={(start) => setEraseDrag(start)}
              onDragMove={(next) =>
                setEraseDrag((prev) =>
                  prev ? { ...prev, x1: next.x1, y1: next.y1 } : prev,
                )
              }
              onDragEnd={(final) => {
                setEraseDrag(null);
                if (!final) return;
                updateNodeData(id, { subtitleEraseBox: final });
              }}
            />
          )}
        </div>

        {albumExpanded && hasAlbum && (
          <VideoAlbumGallery
            width={resolvedWidth}
            height={resolvedHeight}
            totalSlots={albumTotalSlots}
            urls={albumUrls}
            mainVideoUrl={data.videoUrl}
            pendingCount={albumPendingCount}
            resolveUrl={resolveImageDisplayUrl}
            onSetMain={handleSetAlbumMainVideo}
            onApply={handleApplyAlbumVideoToCanvas}
            onDownload={handleDownloadAlbumVideo}
          />
        )}

        {isClipMode && videoSource && (
          <div
            className="absolute left-0 right-0 z-10 flex flex-col gap-1"
            style={{ top: `calc(100% + ${OPERATIONS_PANEL_GAP}px)` }}
          >
            <VideoClipPanel
              videoUrl={videoSource}
              durationMs={durationMs}
              clipStartMs={clipStartMs}
              clipEndMs={clipEndMs}
              isSubmitting={isComposingClip}
              onChange={(patch) => updateNodeData(id, patch)}
              onExit={() => {
                if (isComposingClip) return;
                setClipError(null);
                updateNodeData(id, { isClipMode: false });
              }}
              onSubmit={(start, end) => {
                void handleClipSubmit(start, end);
              }}
            />
            {clipError && (
              <div className="break-words rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive [overflow-wrap:anywhere]">
                剪辑失败：{clipError}
              </div>
            )}
          </div>
        )}

        {showVideoOpsPanel && (
            <OperationPanelShell
              expanded={panelExpanded}
              onCollapse={() => setPanelExpanded(false)}
              inlineClassName={`nodrag absolute z-30 flex flex-col rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS}`}
              inlineStyle={{
                top: `calc(100% + ${OPERATIONS_PANEL_GAP}px)`,
                left: -panelOverhang,
                right: -panelOverhang,
                height: panelHeight,
              }}
              modalStyle={{
                width: `min(${OPERATIONS_PANEL_EXPANDED_WIDTH}px, 92vw)`,
                height: `min(${OPERATIONS_PANEL_EXPANDED_HEIGHT}px, 86vh)`,
              }}
            >
              <PanelExpandButton
                expanded={panelExpanded}
                onToggle={() => setPanelExpanded((v) => !v)}
                className="absolute right-2 top-2 z-20"
              />
              <div className="flex shrink-0 items-center overflow-x-auto px-3 pb-2 pr-10 pt-3">
                <div className="flex shrink-0 items-center gap-2">
                  <CameraMovementChip
                    templates={cameraTemplates}
                    isLoading={cameraTemplatesLoading}
                    selectedId={cameraMovementId}
                    onChange={(nextId) =>
                      updateNodeData(id, { cameraMovement: nextId })
                    }
                  />
                  <CharacterLibraryChip
                    onOpen={() => setIsCharacterLibraryOpen(true)}
                  />
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-3">
                  <VideoGenerationModeSelect
                    value={genMode}
                    options={generationModeOptions}
                    onChange={(nextMode) => updateNodeData(id, { genMode: nextMode })}
                  />
                  <NodeContextPromptPaletteButton
                    nodeId={id}
                    onInsert={insertContextPaletteEntry}
                  />
                  {upstreamTextContents.map((content) => (
                    <ReferenceTextChip
                      key={`upstream-text-${content.nodeId}`}
                      nodeId={content.nodeId}
                      text={content.text ?? ""}
                      sourceLabel={content.displayName ?? content.nodeType}
                      onDetach={handleDetachUpstream}
                    />
                  ))}
                </div>
                {referenceMedia.length > 0 && (
                  <ReferenceMediaRow
                    items={referenceMediaCapInfo}
                    caps={referenceMediaCaps}
                    showFrameSlotLabels={genMode === "firstLastFrame"}
                    resolveUrl={resolveImageDisplayUrl}
                    onFocus={(nodeId) => setSelectedNode(nodeId)}
                    onDetach={handleDetachUpstream}
                    onReorder={(ids) =>
                      updateNodeData(id, { referenceOrder: ids })
                    }
                  />
                )}
              </div>

              <PromptMentionEditor
                ref={promptEditorRef}
                value={promptDraft}
                onChange={(next) => {
                  setPromptDraft(next);
                  if (!isComposingRef.current) {
                    updateNodeData(id, { prompt: next });
                  }
                }}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={(next) => {
                  isComposingRef.current = false;
                  setPromptDraft(next);
                  updateNodeData(id, { prompt: next });
                }}
                onKeyDown={(event) => event.stopPropagation()}
                candidates={mentionCandidates}
                placeholder={
                  upstreamTextJoined.length > 0
                    ? "上游内容已自动接入，可继续补充提示词…"
                    : t("node.videoNode.placeholder")
                }
                className={`nodrag nowheel min-h-0 w-full flex-1 overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent px-3 py-2 text-sm leading-6 text-text-dark outline-none ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
              />

              <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <ProviderModelPicker
                    selectedModelId={modelId}
                    onChange={(nextModelId) => {
                      // 切换模型后，若当前 genMode 不被新模型支持（如 HappyHorse
                      // 专属的 videoEdit 切到普通模型），重置为通用安全值 textToVideo，
                      // 让状态机按新模型 + 上游重新推导；否则残留模式会在提交时打到
                      // 不支持的端点被后端 400（界面还停在错误的 tab）。
                      const resetGenMode =
                        data.genMode != null &&
                        !isVideoModeSupportedByModel(data.genMode, nextModelId);
                      updateNodeData(id, {
                        model: nextModelId,
                        ...(resetGenMode
                          ? { genMode: "textToVideo" as VideoGenMode }
                          : {}),
                      });
                      // 记住这次选择，后续新建的视频节点将继承它。
                      writeLastVideoModel(nextModelId);
                    }}
                    domain="video"
                    popoverPlacement="top"
                    getOptionDisabledReason={(model) =>
                      videoModelReferenceDisabledReason(model.apiModel ?? model.id, upstreamCounts)
                    }
                  />
                  <VideoConfigChip
                    aspectRatio={aspectRatio}
                    aspectRatioOptions={ASPECT_RATIOS}
                    quality={quality}
                    qualityOptions={qualityOptions}
                    durationSec={durationSec}
                    durationBounds={durationBounds}
                    normalizeDuration={(value) =>
                      clampVideoDuration(value, durationBounds)
                    }
                    sceneOptimize={sceneOptimize}
                    sceneOptimizeOptions={sceneOptimizeOptions}
                    generateAudio={generateAudio}
                    onChange={(patch) => updateNodeData(id, patch)}
                  />
                  {isSeedance20Model && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={humanReview}
                      title="素材含真实人脸时开启，可能增加审核时间，不保证通过。"
                      onClick={(event) => {
                        event.stopPropagation();
                        updateNodeData(id, { humanReview: !humanReview });
                      }}
                      className={`nodrag inline-flex h-7 items-center gap-1.5 rounded px-1 text-xs font-medium transition-colors ${
                        humanReview
                          ? "text-text-dark"
                          : "text-text-dark/72 hover:text-text-dark"
                      }`}
                    >
                      <span>真人验证</span>
                      <span
                        className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
                          humanReview
                            ? "bg-primary"
                            : "bg-input"
                        }`}
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 transform rounded-full bg-card shadow-sm transition-transform ${
                            humanReview ? "translate-x-3" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  )}
                  <VideoCountPicker
                    value={count}
                    options={COUNT_OPTIONS}
                    onChange={(nextCount) =>
                      updateNodeData(id, { count: nextCount })
                    }
                  />
                  <button
                    type="button"
                    title="翻译提示词（中英文互译）"
                    disabled={
                      isTranslatingPrompt ||
                      isGenerating ||
                      prompt.trim().length === 0
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleTranslatePrompt();
                    }}
                    className={`${NODE_INLINE_ICON_BUTTON_CLASS} ${
                      isTranslatingPrompt
                        ? NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS
                        : ""
                    }`}
                  >
                    {isTranslatingPrompt ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Languages className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CreditCostPill
                    display={totalCreditCostDisplay}
                    disabled={submitDisabled}
                    className={NODE_CREDIT_PILL_FLAT_CLASS}
                  />
                  <button
                    type="button"
                    disabled={submitDisabled}
                    title={
                      isGenerating
                        ? t("node.videoNode.submitBusy")
                        : t("node.videoNode.submit")
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleSubmit();
                    }}
                    className={`${NODE_GENERATE_BUTTON_BASE_CLASS} ${
                      submitDisabled
                        ? NODE_GENERATE_BUTTON_DISABLED_CLASS
                        : NODE_GENERATE_BUTTON_ENABLED_CLASS
                    }`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </OperationPanelShell>
          )}

        {selected &&
          !isBoxSelecting &&
          !albumExpanded &&
          !isClipMode &&
          !subtitleEraseMode &&
          !data.referenceOnly &&
          hasCompletedHistoryRecords(historyRecords) && (
            <div
              className={`nodrag absolute z-[300] rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS} ${NODE_OPS_PANEL_ENTER_CLASS} px-3 py-2`}
              style={{
                top: `calc(100% + ${OPERATIONS_PANEL_GAP * 2 + panelHeight}px)`,
                left: -panelOverhang,
                right: -panelOverhang,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <NodeGenerationHistory
                records={historyRecords}
                isLoading={historyLoading}
                onRestore={handleRestoreHistory}
                onRefresh={() => void refreshHistory()}
                isActive={(record) => {
                  const url = historyRecordOutputUrl(record);
                  if (!url) return false;
                  // 预览态下高亮正在预览的历史条，否则高亮当前主视频。
                  if (isGenerating && historyPreviewUrl) {
                    return url === historyPreviewUrl;
                  }
                  return url === data.videoUrl;
                }}
              />
            </div>
          )}

        {subtitleEraseMode && (
          <div
            className="nodrag absolute left-0 right-0 z-10 flex justify-center"
            style={{ top: `calc(100% + ${OPERATIONS_PANEL_GAP}px)` }}
            onClick={(event) => event.stopPropagation()}
          >
            <SubtitleEraseOpsPanel
              mode={subtitleEraseMode}
              isErasing={isErasing}
              hasBox={!!subtitleEraseBox}
              onExit={handleEraseExit}
              onResetBox={() => updateNodeData(id, { subtitleEraseBox: null })}
              onSubmit={handleEraseSubmit}
            />
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={VIDEO_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
        />

        <AssetLibraryModal
          open={isCharacterLibraryOpen}
          project={readUrl().project ?? null}
          onClose={() => setIsCharacterLibraryOpen(false)}
          onConfirm={(selections) =>
            spawnCharacterLibraryReferences(selections)
          }
        />
      </div>
    );
  },
);

VideoNode.displayName = "VideoNode";
