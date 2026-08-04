// Copyright (c) 2026 AI anime
import { createPortal } from 'react-dom';
import { Handle, Position } from '@xyflow/react';
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  Copy,
  Download,
  Image as ImageIcon,
  Languages,
  Library,
  Loader2,
  Upload,
  X,
} from 'lucide-react';

import {
  AssetLibraryModal,
  CandidateBindingBadges,
  hasCompletedHistoryRecords,
  historyRecordOutputUrl,
  IMAGE_GEN_NODE_MAX_HEIGHT,
  IMAGE_GEN_NODE_MAX_WIDTH,
  IMAGE_GEN_NODE_MIN_HEIGHT,
  IMAGE_GEN_NODE_MIN_WIDTH,
  IMAGE_GEN_OPERATIONS_PANEL_EXPANDED_HEIGHT,
  IMAGE_GEN_OPERATIONS_PANEL_EXPANDED_MIN_WIDTH,
  IMAGE_GEN_OPERATIONS_PANEL_GAP,
  IMAGE_GEN_SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS,
  CANVAS_NODE_INPUT_BODY_FRAME_CLASS,
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS,
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  CANVAS_NODE_OPS_PANEL_CLASS,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  NodeGenerationHistory,
  NodeResizeHandle,
  PanelExpandButton,
  resolveImageDisplayUrl,
} from '@/modules/creative_canvas/public';
import type { ImageGenNodeController } from '@/features/canvas/hooks/useImageGenNodeController';
import { ReferenceTextChip } from '@/features/canvas/nodes/shared/ReferenceTextChip';
import {
  AspectSizeChip,
  CameraChip,
  CountSelect,
  StyleChip,
} from '@/features/canvas/nodes/ImageGenNodeControls';
import { NodeContextPromptPaletteButton } from '@/features/canvas/nodes/ContextPromptPaletteButton';
import { hasImageGenPromptOverride } from '@/features/canvas/nodes/imageGenPrompt';
import { PromptMentionEditor } from '@/features/canvas/nodes/PromptMentionEditor';
import { BackgroundCropperDialog } from '@/features/canvas/ui/BackgroundCropperDialog';
import { CanvasNodeImage } from '@/features/canvas/ui/CanvasNodeImage';
import { NodeGenerationOverlay } from '@/features/canvas/ui/NodeGenerationOverlay';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import {
  NODE_OPS_PANEL_ENTER_CLASS,
  OperationPanelShell,
} from '@/features/canvas/ui/OperationPanelShell';
import { ProviderModelPicker } from '@/features/canvas/ui/ProviderModelPicker';
import { RegenerateButton } from '@/features/canvas/ui/RegenerateButton';
import {
  NODE_SIDE_ACTION_BUTTON_CLASS,
  NODE_SIDE_ACTION_ICON_CLASS,
  NodeSideActionRail,
} from '@/features/canvas/ui/NodeSideActionRail';
import {
  NODE_CREDIT_PILL_FLAT_CLASS,
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_DISABLED_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
  NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS,
  NODE_INLINE_ICON_BUTTON_CLASS,
  NODE_REFERENCE_MEDIA_CHIP_CLASS,
  NODE_REFERENCE_MEDIA_DETACH_CLASS,
  NODE_TEXT_CONTROL_ICON_CLASS,
  NODE_TEXT_CONTROL_TRIGGER_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';
import {
  CreditCostPill,
} from '@/components/credits/credit-visual';
import { ThreeDDirectorDialog } from '@/features/viewer-kit/three-d/ThreeDDirectorDialog';

export interface ImageGenNodeViewProps {
  controller: ImageGenNodeController;
}

export function ImageGenNodeView({ controller }: ImageGenNodeViewProps) {
  const {
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
  } = controller;

  return (
    <div
      ref={albumRootRef}
      className="group relative h-full w-full overflow-visible"
      style={{ width: resolvedWidth, height: resolvedHeight }}
      onClick={() => setSelectedNode(id)}
    >
      {/* 叠卡画册的卡片边缘：从主图右下方探出，张数与画册一致（最多露 3 张）。
          先渲染、被后面的主卡覆盖，只露出错位的边。 */}
      {hasAlbum && !albumExpanded && previewUrl && (
        <>
          {Array.from({ length: Math.min(albumTotalSlots - 1, 3) }, (_, index) => {
            const step = index + 1;
            return (
              // 点探出的卡片边也能展开画册（和点数量徽标等效）。
              <div
                key={`album-deck-${index}`}
                role="button"
                tabIndex={-1}
                title="展开画册"
                onClick={(event) => {
                  event.stopPropagation();
                  handleToggleAlbumExpanded();
                }}
                className="absolute cursor-pointer rounded-[var(--node-radius)] border border-border bg-gradient-to-b from-muted to-card shadow-lg"
                style={{
                  // 仿 TapNow：后面的卡依次上下内缩、向右探出、微旋转——
                  // 露出的是一条条「卡片边」，而不是整块色板。
                  top: step * 7,
                  bottom: step * 7,
                  left: step * 6,
                  right: -step * 7,
                  transform: `rotate(${step * 1.1}deg)`,
                  transformOrigin: 'center right',
                  opacity: 1 - step * 0.18,
                }}
              />
            );
          })}
        </>
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

      {/* 画册展开时隐藏浮动标题和分辨率角标——画册容器自带「画册 · N 张」头部，
          两者都浮在节点上沿同一位置，叠在一起显示错乱。 */}
      {!albumExpanded && (
        <>
          <NodeHeader
            className={NODE_HEADER_FLOATING_POSITION_CLASS}
            icon={<ImageIcon className="h-4 w-4" />}
            titleText={resolvedTitle}
            editable
            onTitleChange={(nextTitle) => updateNodeData(id, { displayName: nextTitle })}
          />
          {visiblePreviewUrl && naturalSize ? (
            <div
              className="absolute -top-7 right-1 z-20 flex items-center gap-1 rounded-md border border-media-foreground/10 bg-media/55 px-2 py-0.5 text-[11px] font-medium tabular-nums text-media-foreground/70 backdrop-blur-sm"
              title={t('node.imageNode.resolution')}
            >
              <ImageIcon className="h-3 w-3 text-media-foreground/45" />
              {naturalSize.width}×{naturalSize.height}
            </div>
          ) : null}
        </>
      )}
      <CandidateBindingBadges roles={candidateBindingRoles} />

      <NodeResizeHandle
        minWidth={IMAGE_GEN_NODE_MIN_WIDTH}
        minHeight={IMAGE_GEN_NODE_MIN_HEIGHT}
        maxWidth={IMAGE_GEN_NODE_MAX_WIDTH}
        maxHeight={IMAGE_GEN_NODE_MAX_HEIGHT}
        keepAspectRatio
      />

      {!hasGeneratedResult && !referenceImageUrl && !isGenerating && !generationError && (
        <NodeSideActionRail nodeId={id} autoHide selected={Boolean(selected)}>
          <button
            type="button"
            disabled={isUploading}
            onClick={(event) => {
              event.stopPropagation();
              handlePickFile();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            title="上传图片"
            className={NODE_SIDE_ACTION_BUTTON_CLASS}
          >
            {isUploading ? (
              <Loader2 className={`${NODE_SIDE_ACTION_ICON_CLASS} animate-spin`} />
            ) : (
              <Upload className={NODE_SIDE_ACTION_ICON_CLASS} />
            )}
            <span>{isUploading ? '上传中' : '上传图片'}</span>
          </button>
        </NodeSideActionRail>
      )}

      <div
        className={`relative flex h-full w-full items-center justify-center ${visiblePreviewUrl ? 'overflow-hidden' : 'overflow-visible'} rounded-[var(--node-radius)] border transition-colors ${visiblePreviewUrl ? CANVAS_NODE_PANEL_SURFACE_CLASS : CANVAS_NODE_INPUT_SURFACE_CLASS} ${cardToneClass} ${visiblePreviewUrl ? '' : CANVAS_NODE_INPUT_BODY_FRAME_CLASS} ${
          // 画册展开时藏起节点本体的图片卡——半透明的画册容器盖不严，
          // 底下的主图会透出来叠在宫格头部。
          albumExpanded && hasAlbum ? 'invisible' : ''
        }`}
      >
        {visiblePreviewUrl ? (
          <>
            <CanvasNodeImage
              src={visiblePreviewUrl}
              alt={resolvedTitle}
              viewerSourceUrl={visiblePreviewUrl}
              onLoad={handlePreviewImageLoad}
              className="h-full w-full object-contain"
            />
            {!hasGeneratedResult && referenceImageUrl && !isGenerating && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleClearReference();
                }}
                title="移除参考图"
                className="nodrag absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-media/55 text-media-foreground transition-colors hover:bg-media/75"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {/* 画册数量徽标：hover 节点时出现，hover 徽标时箭头下探，点击展开画册。 */}
            {hasAlbum && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleToggleAlbumExpanded();
                }}
                onPointerDown={(event) => event.stopPropagation()}
                title={`展开 ${albumTotalSlots} 张生成结果`}
                className="nodrag group/albumpill absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-full bg-media/65 px-2.5 py-1 text-[12px] font-medium tabular-nums text-media-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-media/85 group-hover:inline-flex"
              >
                {albumPendingCount > 0
                  ? `${albumUrls.length}/${albumPendingTotal}`
                  : albumUrls.length}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    albumExpanded
                      ? 'rotate-180 group-hover/albumpill:-translate-y-[2px]'
                      : 'group-hover/albumpill:translate-y-[2px]'
                  }`}
                />
              </button>
            )}
          </>
        ) : isGenerating && historyPreviewUrl ? (
          // 生成进行中，但用户点了历史记录预览：临时显示那张历史图，新图仍在
          // 后台生成。顶部 pill 提示「生成中」，右上「返回」回到 loading 遮罩。
          // 用原生 <img>（非 CanvasNodeImage）避免 onLoad 按预览图改节点尺寸。
          <div className="relative h-full w-full">
            <img
              src={resolveImageDisplayUrl(historyPreviewUrl)}
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
              onClick={(event) => event.stopPropagation()}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2">
              <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-media/60 px-2.5 py-1 text-[11px] text-media-foreground/90 backdrop-blur">
                <Loader2 className="h-3 w-3 animate-spin" />
                新图片生成中…
              </span>
              <button
                type="button"
                className="nodrag pointer-events-auto inline-flex items-center gap-1 rounded-full bg-media/60 px-2.5 py-1 text-[11px] text-media-foreground/90 backdrop-blur transition-colors hover:bg-media/75"
                onClick={(event) => {
                  event.stopPropagation();
                  setHistoryPreviewUrl(null);
                }}
              >
                <X className="h-3 w-3" />
                返回
              </button>
            </div>
          </div>
        ) : isGenerating ? (
          <div className="h-full w-full" />
        ) : generationError ? (
          // Failed with no result yet: keep the card empty so only the centered
          // error banner shows — placeholder + upload affordances would clutter it.
          <div className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center px-8 text-text-muted">
            {isUploading ? (
              <div className="flex w-full flex-col items-center justify-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin opacity-70" />
                <span className="text-[12px] leading-6">上传中…</span>
              </div>
            ) : isConnected ? (
              // 已连线：不再显示文字 CTA，只在节点中间放一个图标（对齐 libtv）。
              <div className="flex w-full items-center justify-center">
                <ImageIcon className="h-9 w-9 text-text-muted/46" aria-hidden />
              </div>
            ) : (
              <>
                <div className="flex min-h-0 flex-col justify-center gap-2 py-4">
                  <div className="text-xs text-[var(--canvas-node-input-helper)]">试试：</div>
                  <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSpawnUpstreamImage();
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    title="新建一个上游图片节点用作参考"
                    className="nodrag -mx-2 inline-flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  >
                    <Upload className="h-4 w-4 text-text-muted/90" />
                    <span>图生图</span>
                  </button>
                  </div>
                </div>
                <ImageIcon className="ml-auto mr-20 h-9 w-9 text-text-muted/46" aria-hidden />
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleUploadFile(file);
          }}
        />

        {isGenerating && !historyPreviewUrl && (
          <NodeGenerationOverlay
            startedAt={data.generationStartedAt ?? null}
            durationMs={data.generationDurationMs}
            hasBackground={Boolean(visiblePreviewUrl)}
          />
        )}

        {!isGenerating && generationError && (
          <div className="nodrag absolute inset-x-5 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center rounded-lg border border-destructive/35 bg-card/95 px-4 py-3 text-center shadow-lg">
            <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              <span>{t("node.imageNode.generationFailed")}</span>
            </div>
            <div
              className="mt-1 max-h-12 max-w-full overflow-y-auto break-words text-[11px] leading-4 text-destructive [overflow-wrap:anywhere]"
              title={generationError}
            >
              {generationError}
            </div>
            {generationErrorRequestId && (
              <div className="mt-1 flex max-w-full items-center justify-center gap-1.5 text-[10px] text-text-muted">
                <span className="shrink-0">{t("node.imageNode.requestId")}</span>
                <code className="min-w-0 max-w-[160px] truncate font-mono" title={generationErrorRequestId}>
                  {generationErrorRequestId}
                </code>
                <button
                  type="button"
                  title={errorDetailsCopied ? t("nodeToolbar.copied") : t("nodeToolbar.copyErrorReport")}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleCopyErrorDetails();
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="mt-2 flex justify-center">
              <RegenerateButton
                onClick={() => void handleSubmit()}
                busy={isGenerating}
                disabled={submitDisabled}
              />
            </div>
          </div>
        )}
      </div>

      {/* 展开的画册宫格：覆盖在节点位置向右下铺开，每格与节点等尺寸。
          外层一圈「组」式轮廓（边框 + 弱底色 + 左上角标签），强调这组图是
          一个组合。hover 单格出现「应用到画布」+ 下载；点击图片设为主图。 */}
      {albumExpanded && hasAlbum && (
        // 容器不带 nodrag、也不拦 pointerdown——按住画册任意处即可拖动整个节点
        // （组合一起走）。按下时记录起点，cell 的 onClick 据此区分「点击选主图」
        // 和「拖动后松手」（React Flow 拖完浏览器仍会补发 click）。
        <div
          className="nowheel absolute -left-3 -top-3 z-[80] cursor-grab rounded-2xl border border-border bg-card p-3 shadow-xl active:cursor-grabbing"
          style={{ width: resolvedWidth * 2 + 12 + 24 }}
          onClick={(event) => event.stopPropagation()}
          onPointerDownCapture={(event) => {
            albumPointerDownPosRef.current = { x: event.clientX, y: event.clientY };
          }}
        >
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            画册 · {albumTotalSlots} 张
          </div>
          <div className="grid grid-cols-2 gap-3">
          {albumUrls.map((url, index) => {
            const isMain = url === data.imageUrl;
            return (
              // 直接点击图片即设为主图并收拢画册（不再需要单独的「设为主图」按钮）。
              <div
                key={`album-cell-${index}`}
                role="button"
                tabIndex={-1}
                title="点击设为主图"
                onClick={(event) => {
                  event.stopPropagation();
                  // 拖动画册（移动节点）后松手补发的 click 不算选主图。
                  const start = albumPointerDownPosRef.current;
                  if (
                    start
                    && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
                  ) {
                    return;
                  }
                  handleSetAlbumMainImage(url);
                }}
                className={`group/albumcell relative cursor-pointer overflow-hidden rounded-[var(--node-radius)] border bg-media shadow-xl transition-colors ${
                  isMain
                    ? 'border-primary/80 ring-2 ring-primary/40'
                    : 'border-border hover:border-foreground/35'
                }`}
                style={{ width: resolvedWidth, height: resolvedHeight }}
              >
                <img
                  src={resolveImageDisplayUrl(url)}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleApplyAlbumImageToCanvas(url);
                  }}
                  title="把这张图作为独立图片节点放到画布上"
                  className="nodrag absolute left-2 top-2 z-10 hidden h-7 items-center gap-1 rounded-md bg-media/70 px-2.5 text-[12px] font-medium text-media-foreground backdrop-blur-sm transition-colors hover:bg-media/90 group-hover/albumcell:inline-flex"
                >
                  <Upload className="h-3.5 w-3.5" />
                  应用到画布
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDownloadAlbumImage(url, index);
                  }}
                  title="下载这张图片"
                  className="nodrag absolute right-2 top-2 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-media/70 text-media-foreground backdrop-blur-sm transition-colors hover:bg-media/90 group-hover/albumcell:inline-flex"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {isMain && (
                  <span className="absolute bottom-2 left-2 z-10 rounded-md bg-media/65 px-2 py-0.5 text-[11px] font-medium text-media-foreground backdrop-blur-sm">
                    主图
                  </span>
                )}
              </div>
            );
          })}
          {/* 还在生成中的槽位：占位骨架，完成一张替换一张。 */}
          {Array.from({ length: albumPendingCount }, (_, index) => (
            <div
              key={`album-pending-${index}`}
              className="relative flex items-center justify-center overflow-hidden rounded-[var(--node-radius)] border border-border bg-media shadow-xl"
              style={{ width: resolvedWidth, height: resolvedHeight }}
            >
              <div className="flex flex-col items-center gap-2 text-text-muted/70">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-[12px]">生成中…</span>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {/*
        Step B + C: 场景资产 / 导演中间产物节点的内联 action 按钮
        (scene_master / scene_reverse_master 加 "用作背景源" → 打开 cropper
         dialog 选 16:9 区域 → 生成当前背景候选并自动 commit;
         director_combined 加 "打开导演世界" → 同源 viewer dialog)。
        button 浮在节点右下角,selected 时可见,避免占用节点 body 空间。
      */}
      {selected && (canUseAsBackground || canOpenDirectorStage) && (
        <div className="nodrag absolute bottom-2 right-2 z-[6] flex gap-1">
          {canUseAsBackground && (
            <button
              type="button"
              disabled={effectiveEpisode === null || effectiveBeat === null}
              onClick={(event) => {
                event.stopPropagation();
                setBgCropperOpen(true);
              }}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-warning/55 bg-warning px-2 text-[10px] font-medium text-warning-foreground shadow-sm hover:bg-warning/90 disabled:cursor-not-allowed disabled:opacity-50"
              title={`从 ${sourceRole === 'scene_master' ? 'scene_master' : 'scene_reverse_master'} 选一个 16:9 区域写入本 beat 的 selected_background.png — beat 工作台后续 sketch/render 会用这张做背景锚点`}
            >
              📐 截取背景
            </button>
          )}
          {canOpenDirectorStage && (
            <button
              type="button"
              disabled={directorStageBusy}
              onClick={(event) => {
                event.stopPropagation();
                void handleOpenDirectorStageInline();
              }}
              className={`inline-flex h-6 items-center gap-1 rounded-md border border-primary/55 px-2 text-[10px] font-medium shadow-sm ${
                directorStageBusy
                  ? 'cursor-not-allowed bg-primary/10 text-primary/60'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              }`}
              title={t("viewer.threeD.openDirectorWorldTitle")}
            >
              {directorStageBusy
                ? t("viewer.threeD.openingDirectorWorld")
                : `🎬 ${t("viewer.threeD.directorWorld")}`}
            </button>
          )}
        </div>
      )}

      {/*
        自由 canvas 上 ImageGenNode 的全功能 ops panel (camera / model picker /
        free reference upload / generation count / style picker / submit ...).
        Preset-managed source nodes hide this panel; user-spawned nodes keep it.
      */}
      {showImageOpsPanel && (
        <OperationPanelShell
          expanded={panelExpanded}
          onCollapse={() => setPanelExpanded(false)}
          inlineClassName={`nodrag absolute left-1/2 z-10 flex -translate-x-1/2 flex-col rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS}`}
          inlineStyle={{
            top: `calc(100% + ${IMAGE_GEN_OPERATIONS_PANEL_GAP}px)`,
            height: panelHeight,
            width: panelWidth,
          }}
          modalStyle={{
            width: `min(${IMAGE_GEN_OPERATIONS_PANEL_EXPANDED_MIN_WIDTH}px, 92vw)`,
            height: `min(${IMAGE_GEN_OPERATIONS_PANEL_EXPANDED_HEIGHT}px, 86vh)`,
          }}
        >
          <PanelExpandButton
            expanded={panelExpanded}
            onToggle={() => setPanelExpanded((v) => !v)}
            className="absolute right-2 top-2 z-20"
          />
          <div className="flex shrink-0 items-center gap-2 pl-3 pr-10 pt-3">
            <StyleChip
              projectId={projectId}
              selectedId={styleTemplateId}
              selectedLabel={selectedStyle?.label ?? null}
              onChange={(nextId) => updateNodeData(id, { styleTemplateId: nextId })}
              onOpenChange={setStylePickerOpen}
            />
            <NodeContextPromptPaletteButton
              nodeId={id}
              onInsert={insertContextPaletteEntry}
            />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsAssetLibraryOpen(true);
              }}
              className={`${NODE_TEXT_CONTROL_TRIGGER_CLASS} group/asset px-1.5`}
              title="从资产库选择参考图（人物 / 场景 / 道具）"
            >
              <Library className={`${NODE_TEXT_CONTROL_ICON_CLASS} group-hover/asset:text-text-dark`} />
              <span>资产库</span>
            </button>
            {upstreamTextContents.map((content) => (
              <ReferenceTextChip
                key={content.nodeId}
                nodeId={content.nodeId}
                text={content.text ?? ''}
                sourceLabel={content.displayName ?? content.nodeType}
                onDetach={handleDetachUpstream}
              />
            ))}
            {upstreamImageContents.length > 0 && (
              <div className="ml-3 flex shrink-0 items-center gap-1.5">
                {upstreamImageContents.map((content) => {
                  const url = resolveImageDisplayUrl(content.imageUrl as string);
                  return (
                    <div
                      key={`upstream-image-${content.nodeId}`}
                      className={NODE_REFERENCE_MEDIA_CHIP_CLASS}
                      title={`来自上游 · ${content.displayName ?? content.nodeType}`}
                      onMouseEnter={(event) => {
                        setRefHover({
                          imageUrl: url,
                          rect: event.currentTarget.getBoundingClientRect(),
                        });
                      }}
                      onMouseLeave={() => setRefHover(null)}
                    >
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                      {/* 前端按产品要求不再显示「图片N」数字角标——引用统一呈现为
                          「图片」，序号只存在于提交给后端的 prompt（@图片N）里。 */}
                      <button
                        type="button"
                        title="取消引用此素材"
                        className={NODE_REFERENCE_MEDIA_DETACH_CLASS}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          setRefHover(null);
                          handleDetachUpstream(content.nodeId);
                        }}
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <PromptMentionEditor
            ref={promptEditorRef}
            value={prompt}
            onChange={(next) => {
              hasUserEditedPromptRef.current = hasImageGenPromptOverride(next);
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
              hasUserEditedPromptRef.current = hasImageGenPromptOverride(next);
              setPromptDraft(next);
              updateNodeData(id, { prompt: next });
            }}
            candidates={mentionCandidates}
            placeholder={
              upstreamTextJoined.length > 0
                ? '上游内容已自动接入，可继续补充提示词…'
                : '描述你想要生成的画面内容，@引用素材'
            }
            className={`nodrag nowheel min-h-0 w-full flex-1 overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent px-3 py-2 text-sm leading-6 text-text-dark outline-none ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
          />

          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <ProviderModelPicker
                projectId={projectId}
                selectedModelId={modelId}
                onChange={(nextModelId) => updateNodeData(id, { model: nextModelId })}
                imageMode={imageModelMode}
                popoverPlacement="top"
              />
              <AspectSizeChip
                aspectRatio={aspectRatio}
                size={size}
                quality={quality}
                showQuality={isImage2}
                onChange={(patch) => updateNodeData(id, patch)}
              />
              <CameraChip
                projectId={projectId}
                selection={cameraSelection}
                summary={cameraSummary}
                onChange={(next) => updateNodeData(id, { cameraSelection: next })}
              />
              {!canAutoCommitOnGenerate && (
                <CountSelect
                  value={count}
                  onChange={(nextCount) => updateNodeData(id, { count: nextCount })}
                />
              )}
              <button
                type="button"
                title="翻译提示词（中英文互译）"
                disabled={isTranslatingPrompt || isGenerating || prompt.trim().length === 0}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleTranslatePrompt();
                }}
                className={`${NODE_INLINE_ICON_BUTTON_CLASS} ${
                  isTranslatingPrompt
                    ? NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS
                    : ''
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
                title="生成"
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
      {selected && !isBoxSelecting && !hasActiveOverlay && !panelExpanded && !stylePickerOpen && hasCompletedHistoryRecords(historyRecords) && (
        <div
          className={`nodrag absolute left-1/2 z-[300] -translate-x-1/2 rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS} ${NODE_OPS_PANEL_ENTER_CLASS} px-3 py-2`}
          style={{
            top: `calc(100% + ${IMAGE_GEN_OPERATIONS_PANEL_GAP * 2 + panelHeight}px)`,
            width: panelWidth,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <NodeGenerationHistory
            records={historyRecords}
            isLoading={historyLoading}
            onRestore={handleRestoreHistory}
            onRefresh={() => void refreshHistory()}
            resolveMediaUrl={resolveImageDisplayUrl}
            isActive={(record) => {
              const url = historyRecordOutputUrl(record);
              if (!url) return false;
              // 预览态下高亮正在预览的历史条，否则高亮当前主图。
              if (isGenerating && historyPreviewUrl) {
                return url === historyPreviewUrl;
              }
              return url === data.imageUrl;
            }}
          />
        </div>
      )}
      {refHover && refPreviewStyle
        && createPortal(
          <div
            className="pointer-events-none fixed z-[10001] overflow-hidden rounded-lg border border-border bg-surface-dark/95 shadow-xl"
            style={{
              left: refPreviewStyle.left,
              top: refPreviewStyle.top,
              width: refPreviewStyle.size,
              height: refPreviewStyle.size,
            }}
          >
            <img
              src={refHover.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>,
          document.body,
        )}

      {/* Step B: 平面 source (master/reverse) 的截取背景 dialog。
          Pano360 / 3GS 不走这条 — 它们用各自 viewer 上的 capture 按钮。 */}
      {canUseAsBackground && effectiveEpisode !== null && effectiveBeat !== null && (
        <BackgroundCropperDialog
          isOpen={bgCropperOpen}
          onClose={() => setBgCropperOpen(false)}
          sourceUrl={typeof data.imageUrl === 'string' ? data.imageUrl : ''}
          sourceLabel={sourceRole === 'scene_master' ? 'master' : 'reverse'}
          aspectOptions={IMAGE_GEN_SELECTED_BACKGROUND_CROP_ASPECT_OPTIONS}
          onConfirmBlob={handleConfirmBackgroundCrop}
          onCandidateSuccess={() => setBgCropperOpen(false)}
          onError={(msg) => console.warn('[bg-cropper]', msg)}
        />
      )}
      {canOpenDirectorStage && (
        <ThreeDDirectorDialog
          open={directorStageOpen}
          onOpenChange={setDirectorStageOpen}
          manifest={directorStageManifest}
          title={t("viewer.threeD.beatDirectorWorld")}
          description={t("viewer.threeD.beatDirectorWorldDescription")}
          viewerPurpose="beat"
          autoCommitDirectorCombined
          onSubmitDirectorCombined={handleDirectorCaptureCombined}
        />
      )}
      <AssetLibraryModal
        open={isAssetLibraryOpen}
        project={projectId}
        allowedMedia={['image']}
        resolveMediaUrl={resolveImageDisplayUrl}
        onClose={() => setIsAssetLibraryOpen(false)}
        onConfirm={(selections) => spawnAssetLibraryReferences(selections)}
      />
    </div>
  );
}
