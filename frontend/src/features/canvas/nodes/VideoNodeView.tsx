// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import {
  ArrowUp,
  Languages,
  Loader2,
  Video as VideoIcon,
} from 'lucide-react';

import {
  VIDEO_NODE_ASPECT_RATIOS,
  VIDEO_NODE_COUNT_OPTIONS,
  VIDEO_NODE_MAX_HEIGHT,
  VIDEO_NODE_MAX_WIDTH,
  VIDEO_NODE_MIN_HEIGHT,
  VIDEO_NODE_MIN_WIDTH,
  VIDEO_NODE_OPERATIONS_PANEL_EXPANDED_HEIGHT,
  VIDEO_NODE_OPERATIONS_PANEL_EXPANDED_WIDTH,
  VIDEO_NODE_OPERATIONS_PANEL_GAP,
} from '@/features/canvas/application/videoNodeModel';
import { CreditCostPill } from '@/components/credits/credit-visual';
import type { VideoNodeController } from '@/features/canvas/hooks/useVideoNodeController';
import {
  CameraMovementChip,
  CharacterLibraryChip,
  VideoConfigChip,
  VideoCountPicker,
  VideoGenerationModeSelect,
  VideoHumanReviewSwitch,
  VideoNodeClipPanel,
  VideoNodePrimaryVideo,
  SubtitleEraseBoxOverlay,
  SubtitleEraseOpsPanel,
  ReferenceMediaRow,
  VideoAlbumDeck,
  VideoAlbumGallery,
  VideoAlbumToggleButton,
  VideoNodeEmptyState,
  VideoNodeGenerationHistoryPanel,
  VideoPlayerControls,
  VideoGeneratingState,
  VideoGenerationErrorState,
  VideoGenerationHistoryPreview,
  VideoLoadErrorOverlay,
  VideoMetadataLoadingOverlay,
  VideoUploadingState,
} from '@/modules/creative_canvas/public';
import { NodeContextPromptPaletteButton } from '@/features/canvas/nodes/ContextPromptPaletteButton';
import { PromptMentionEditor } from '@/features/canvas/nodes/PromptMentionEditor';
import { VideoUploadActionRail } from '@/features/canvas/nodes/VideoUploadActionRail';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import { OperationPanelShell } from '@/features/canvas/ui/OperationPanelShell';
import { ProviderModelPicker } from '@/features/canvas/ui/ProviderModelPicker';
import {
  AssetLibraryModal,
  CANVAS_NODE_INPUT_BODY_FRAME_CLASS,
  CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS,
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS,
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  CANVAS_NODE_OPS_PANEL_CLASS,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  NODE_CREDIT_PILL_FLAT_CLASS,
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_DISABLED_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
  NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS,
  NODE_INLINE_ICON_BUTTON_CLASS,
  NodeContextBadges,
  NodeResizeHandle,
  PanelExpandButton,
  ReferenceTextChip,
  canvasNodeFrameClass,
  resolveImageDisplayUrl,
} from '@/modules/creative_canvas/public';

export interface VideoNodeViewProps {
  controller: VideoNodeController;
}

export function VideoNodeView({ controller }: VideoNodeViewProps) {
  const {
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
    captureFrameStrip,
    videoFileAccept,
    projectId,
  } = controller;

  const cardToneClass = canvasNodeFrameClass({
    selected,
    mainline: hasMainlineContext,
  });
  const bodySurfaceClass = isEmptyVideoBody
    ? CANVAS_NODE_INPUT_SURFACE_CLASS
    : CANVAS_NODE_PANEL_SURFACE_CLASS;
  const bodyFrameClass = isEmptyVideoBody
    ? selected
      ? CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS
      : CANVAS_NODE_INPUT_BODY_FRAME_CLASS
    : cardToneClass;

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
          typeof data.widthPx === 'number' &&
          typeof data.heightPx === 'number' &&
          data.widthPx > 0 &&
          data.heightPx > 0 ? (
            <div
              className="absolute -top-7 right-1 z-20 flex items-center gap-1 rounded-md border border-media-foreground/10 bg-media/55 px-2 py-0.5 text-[11px] font-medium tabular-nums text-media-foreground/70 backdrop-blur-sm"
              title={t('node.videoNode.resolution')}
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
        minWidth={VIDEO_NODE_MIN_WIDTH}
        minHeight={VIDEO_NODE_MIN_HEIGHT}
        maxWidth={VIDEO_NODE_MAX_WIDTH}
        maxHeight={VIDEO_NODE_MAX_HEIGHT}
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
        className={`relative flex h-full w-full items-center justify-center ${videoSource ? 'overflow-hidden' : 'overflow-visible'} rounded-[var(--node-radius)] border ${bodySurfaceClass} transition-colors ${bodyFrameClass} ${
          albumExpanded && hasAlbum ? 'invisible' : ''
        }`}
      >
        {!isGenerating && !isUploading && videoSource ? (
          <VideoNodePrimaryVideo
            source={videoPosterSource}
            onElementChange={setVideoRef}
            onSelect={handleVideoSelect}
            onMetadata={handleVideoMetadata}
            onError={handleVideoLoadError}
          />
        ) : isUploading ? (
          <VideoUploadingState />
        ) : isGenerating && historyPreviewUrl ? (
          <VideoGenerationHistoryPreview
            videoUrl={resolveImageDisplayUrl(historyPreviewUrl)}
            onClose={() => setHistoryPreviewUrl(null)}
          />
        ) : isGenerating ? (
          <VideoGeneratingState
            previewImageUrl={
              data.previewImageUrl
                ? resolveImageDisplayUrl(data.previewImageUrl)
                : null
            }
            startedAt={data.generationStartedAt ?? null}
            durationMs={data.generationDurationMs}
          />
        ) : hasGenerationError ? (
          <VideoGenerationErrorState
            error={generationError}
            requestId={generationErrorRequestId}
            busy={isGenerating}
            disabled={submitDisabled}
            onRegenerate={() => void handleSubmit()}
          />
        ) : (
          <VideoNodeEmptyState
            isUpscaleNode={Boolean(data.isUpscaleNode)}
            isConnected={isConnected}
            hasUpstreamVideo={upstreamCounts.videos > 0}
            onSpawnFirstLastFrame={() => spawnFrameUploads('firstLastFrame')}
            onSpawnFirstFrame={() => spawnFrameUploads('firstFrame')}
          />
        )}

        {videoSource && videoLoadError && !isGenerating && !isUploading && (
          <VideoLoadErrorOverlay />
        )}

        {videoSource && !hasMetadata && !isUploading && !isGenerating && (
          <VideoMetadataLoadingOverlay />
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

        {videoSource && subtitleEraseMode === 'box' && (
          <SubtitleEraseBoxOverlay
            box={subtitleEraseBox}
            drag={eraseDrag}
            disabled={isErasing}
            getDisplayedRect={getDisplayedVideoRect}
            onDragStart={(start) => setEraseDrag(start)}
            onDragMove={(next) =>
              setEraseDrag((previous) =>
                previous
                  ? { ...previous, x1: next.x1, y1: next.y1 }
                  : previous,
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

      <VideoNodeClipPanel
        visible={isClipMode}
        videoUrl={videoSource}
        durationMs={durationMs}
        clipStartMs={clipStartMs}
        clipEndMs={clipEndMs}
        isSubmitting={isComposingClip}
        captureFrameStrip={captureFrameStrip}
        error={clipError}
        topOffsetPx={VIDEO_NODE_OPERATIONS_PANEL_GAP}
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

      {showVideoOpsPanel && (
        <OperationPanelShell
          expanded={panelExpanded}
          onCollapse={() => setPanelExpanded(false)}
          inlineClassName={`nodrag absolute z-30 flex flex-col rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS}`}
          inlineStyle={{
            top: `calc(100% + ${VIDEO_NODE_OPERATIONS_PANEL_GAP}px)`,
            left: -panelOverhang,
            right: -panelOverhang,
            height: panelHeight,
          }}
          modalStyle={{
            width: `min(${VIDEO_NODE_OPERATIONS_PANEL_EXPANDED_WIDTH}px, 92vw)`,
            height: `min(${VIDEO_NODE_OPERATIONS_PANEL_EXPANDED_HEIGHT}px, 86vh)`,
          }}
        >
          <PanelExpandButton
            expanded={panelExpanded}
            onToggle={() => setPanelExpanded((value) => !value)}
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
                onChange={(nextMode) =>
                  updateNodeData(id, { genMode: nextMode })
                }
              />
              <NodeContextPromptPaletteButton
                nodeId={id}
                onInsert={insertContextPaletteEntry}
              />
              {upstreamTextContents.map((content) => (
                <ReferenceTextChip
                  key={`upstream-text-${content.nodeId}`}
                  nodeId={content.nodeId}
                  text={content.text ?? ''}
                  sourceLabel={content.displayName ?? content.nodeType}
                  onDetach={handleDetachUpstream}
                />
              ))}
            </div>
            {referenceMedia.length > 0 && (
              <ReferenceMediaRow
                items={referenceMediaCapInfo}
                caps={referenceMediaCaps}
                showFrameSlotLabels={genMode === 'firstLastFrame'}
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
            onChange={handlePromptChange}
            onCompositionStart={handlePromptCompositionStart}
            onCompositionEnd={handlePromptCompositionEnd}
            onKeyDown={(event) => event.stopPropagation()}
            candidates={mentionCandidates}
            placeholder={
              upstreamTextJoined.length > 0
                ? '上游内容已自动接入，可继续补充提示词…'
                : t('node.videoNode.placeholder')
            }
            className={`nodrag nowheel min-h-0 w-full flex-1 overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent px-3 py-2 text-sm leading-6 text-text-dark outline-none ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
          />

          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <ProviderModelPicker
                projectId={projectId}
                selectedModelId={modelId}
                onChange={handleModelChange}
                domain="video"
                popoverPlacement="top"
                getOptionDisabledReason={getModelDisabledReason}
              />
              <VideoConfigChip
                aspectRatio={aspectRatio}
                aspectRatioOptions={VIDEO_NODE_ASPECT_RATIOS}
                quality={quality}
                qualityOptions={qualityOptions}
                durationSec={durationSec}
                durationBounds={durationBounds}
                normalizeDuration={normalizeDuration}
                sceneOptimize={sceneOptimize}
                sceneOptimizeOptions={sceneOptimizeOptions}
                generateAudio={generateAudio}
                onChange={(patch) => updateNodeData(id, patch)}
              />
              {supportsHumanReview && (
                <VideoHumanReviewSwitch
                  checked={humanReview}
                  onChange={(checked) =>
                    updateNodeData(id, { humanReview: checked })
                  }
                />
              )}
              <VideoCountPicker
                value={count}
                options={VIDEO_NODE_COUNT_OPTIONS}
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
                title={
                  isGenerating
                    ? t('node.videoNode.submitBusy')
                    : t('node.videoNode.submit')
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

      <VideoNodeGenerationHistoryPanel
        visible={
          Boolean(selected) &&
          !isBoxSelecting &&
          !albumExpanded &&
          !isClipMode &&
          !subtitleEraseMode &&
          !data.referenceOnly
        }
        records={historyRecords}
        isLoading={historyLoading}
        activeOutputUrl={
          isGenerating && historyPreviewUrl
            ? historyPreviewUrl
            : (data.videoUrl ?? null)
        }
        topOffsetPx={VIDEO_NODE_OPERATIONS_PANEL_GAP * 2 + panelHeight}
        horizontalOverhangPx={panelOverhang}
        resolveMediaUrl={resolveImageDisplayUrl}
        onRestore={handleRestoreHistory}
        onRefresh={() => void refreshHistory()}
      />

      {subtitleEraseMode && (
        <div
          className="nodrag absolute left-0 right-0 z-10 flex justify-center"
          style={{
            top: `calc(100% + ${VIDEO_NODE_OPERATIONS_PANEL_GAP}px)`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <SubtitleEraseOpsPanel
            mode={subtitleEraseMode}
            isErasing={isErasing}
            hasBox={Boolean(subtitleEraseBox)}
            onExit={handleEraseExit}
            onResetBox={() => updateNodeData(id, { subtitleEraseBox: null })}
            onSubmit={handleEraseSubmit}
          />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={videoFileAccept}
        className="hidden"
        onChange={handleFileChange}
      />

      <AssetLibraryModal
        open={isCharacterLibraryOpen}
        project={projectId}
        resolveMediaUrl={resolveImageDisplayUrl}
        onClose={() => setIsCharacterLibraryOpen(false)}
        onConfirm={spawnCharacterLibraryReferences}
      />
    </div>
  );
}
