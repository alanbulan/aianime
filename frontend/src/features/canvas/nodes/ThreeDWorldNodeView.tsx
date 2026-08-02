// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2, Orbit } from 'lucide-react';

import type { CanvasGenerationHistoryRecord } from '@/features/canvas/application/generationHistory';
import { resolveImageDisplayUrl } from '@/features/canvas/application/imageData';
import {
  pickThreeDWorldPlyUrl,
  THREE_D_WORLD_NODE_SIZE_LIMITS,
  type ThreeDWorldReferenceImage,
  type ThreeDWorldReferenceText,
} from '@/features/canvas/application/threeDWorldNodeModel';
import type { CanvasImageTo3dVisibleSourceKind } from '@/features/canvas/domain/imageTo3d';
import type { ThreeDWorldNodeController } from '@/features/canvas/hooks/useThreeDWorldNodeController';
import { ReferenceTextChip } from '@/features/canvas/nodes/shared/ReferenceTextChip';
import { ThreeDWorldReferenceImageThumb } from '@/features/canvas/nodes/ThreeDWorldReferenceImageThumb';
import { NodeGenerationHistory } from '@/features/canvas/ui/NodeGenerationHistory';
import { NodeGenerationOverlay } from '@/features/canvas/ui/NodeGenerationOverlay';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import { NODE_INLINE_ERROR_MESSAGE_CLASS } from '@/features/canvas/ui/nodeControlStyles';
import {
  CANVAS_NODE_OPS_PANEL_CLASS,
  canvasNodeFrameClass,
} from '@/features/canvas/ui/nodeFrameStyles';
import { NodeContextBadges } from '@/modules/creative_canvas/public';
import { ThreeDDirectorDialog } from '@/features/viewer-kit/three-d/ThreeDDirectorDialog';

const PANEL_GAP_PX = 12;
const PANEL_OVERHANG_PX = 60;
const DIRECTOR_IMAGE_SOURCE_OPTIONS: Array<{
  value: CanvasImageTo3dVisibleSourceKind;
  labelKey: string;
}> = [
  { value: 'master', labelKey: 'nodeToolbar.normalImage' },
  { value: 'pano', labelKey: 'nodeToolbar.image360' },
];

interface OpsPanelProps {
  isGenerating: boolean;
  hasUpstream: boolean;
  errorMessage?: string | null;
  sourceKind: CanvasImageTo3dVisibleSourceKind;
  referenceImages: ThreeDWorldReferenceImage[];
  selectedReferenceNodeId: string | null;
  referenceImage: ThreeDWorldReferenceImage | null;
  referenceText: ThreeDWorldReferenceText | null;
  onReferenceImageChange(nodeId: string): void;
  onSourceKindChange(next: CanvasImageTo3dVisibleSourceKind): void;
  onSubmit(): void;
  onFocusUpstream(nodeId: string): void;
  onDetachUpstream(nodeId: string): void;
}

function OpsPanel({
  isGenerating,
  hasUpstream,
  errorMessage,
  sourceKind,
  referenceImages,
  selectedReferenceNodeId,
  referenceImage,
  referenceText,
  onReferenceImageChange,
  onSourceKindChange,
  onSubmit,
  onFocusUpstream,
  onDetachUpstream,
}: OpsPanelProps) {
  const { t } = useTranslation();
  if (!referenceImage && !referenceText && !errorMessage) return null;
  return (
    <div
      className={`nodrag nopan nowheel flex flex-col gap-2 rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS} p-3 text-text-dark`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {referenceImage || referenceText ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {referenceImages.length > 1 ? (
            <label
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-muted px-2 text-[11px] text-muted-foreground"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <select
                value={selectedReferenceNodeId ?? referenceImage?.nodeId ?? ''}
                onChange={(event) =>
                  onReferenceImageChange(event.target.value)
                }
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className="nodrag max-w-[160px] bg-transparent text-[11px] text-text-muted focus:text-text-dark focus:outline-none"
              >
                {referenceImages.map((item, index) => (
                  <option
                    key={item.nodeId}
                    value={item.nodeId}
                    className="bg-popover text-popover-foreground"
                  >
                    {item.displayName || `图片 ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {referenceImage ? (
            <ThreeDWorldReferenceImageThumb
              item={referenceImage}
              onFocus={onFocusUpstream}
              onDetach={onDetachUpstream}
            />
          ) : null}
          {referenceText ? (
            <ReferenceTextChip
              nodeId={referenceText.nodeId}
              text={referenceText.text}
              sourceLabel={referenceText.displayName}
              onDetach={onDetachUpstream}
              onFocus={onFocusUpstream}
            />
          ) : null}
        </div>
      ) : null}
      {errorMessage ? (
        <div
          className={`max-h-24 overflow-y-auto ${NODE_INLINE_ERROR_MESSAGE_CLASS}`}
        >
          {errorMessage}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <label
          className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted pl-2.5 pr-1 text-[11px] text-foreground/90 transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <select
            value={sourceKind}
            onChange={(event) =>
              onSourceKindChange(
                event.target.value as CanvasImageTo3dVisibleSourceKind,
              )
            }
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className="nodrag h-6 bg-transparent pr-1 text-[11px] text-foreground focus:outline-none"
            aria-label={t('nodeToolbar.directorWorldSourceType', {
              defaultValue: '3DGS 来源类型',
            })}
          >
            {DIRECTOR_IMAGE_SOURCE_OPTIONS.map((option) => (
              <option
                key={option.value}
                value={option.value}
                className="bg-popover text-popover-foreground"
              >
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!hasUpstream || isGenerating}
          className="nodrag inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
          {isGenerating
            ? t('nodeToolbar.generatingDirectorWorld')
            : t('nodeToolbar.generateDirectorWorld')}
        </button>
      </div>
    </div>
  );
}

function HistoryPanel({
  records,
  isLoading,
  onRestore,
  onRefresh,
  currentPlyUrl,
  previewThumbnailUrl,
}: {
  records: CanvasGenerationHistoryRecord[];
  isLoading: boolean;
  onRestore(record: CanvasGenerationHistoryRecord): void;
  onRefresh(): void;
  currentPlyUrl?: string | null;
  previewThumbnailUrl?: string | null;
}) {
  if (!isLoading && records.length === 0) return null;
  return (
    <div
      className={`nodrag nopan nowheel rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS} p-3 text-text-dark`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <NodeGenerationHistory
        records={records}
        isLoading={isLoading}
        onRestore={onRestore}
        onRefresh={onRefresh}
        isActive={(record) => {
          const plyUrl = pickThreeDWorldPlyUrl(record.result);
          return Boolean(plyUrl) && plyUrl === currentPlyUrl;
        }}
        fallbackThumbnailUrl={previewThumbnailUrl}
      />
    </div>
  );
}

export function ThreeDWorldNodeView({
  controller,
}: {
  controller: ThreeDWorldNodeController;
}) {
  const { t } = useTranslation();
  const {
    data,
    selected,
    size,
    title,
    nodeContexts,
    isGenerating,
    hasUpstream,
    referenceImages,
    selectedReferenceNodeId,
    referenceImage,
    referenceText,
    selectedImageSourceKind,
    historyRecords,
    historyLoading,
    preview,
    directorBusy,
    directorDialogOpen,
    directorManifest,
    beatContext,
    initialScene,
    initialScenesBySourceId,
  } = controller;

  return (
    <div
      className={`
        director-world-node group relative overflow-visible rounded-[var(--node-radius)] border bg-media p-0 transition-colors duration-150
        ${canvasNodeFrameClass({ selected, mainline: preview.hasMainlineContext })}
      `}
      style={{ width: size.width, height: size.height }}
      onClick={controller.select}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Orbit className="h-4 w-4" />}
        titleText={title}
        editable
        onTitleChange={controller.rename}
      />
      <NodeContextBadges contexts={nodeContexts} />

      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-[var(--node-radius)] bg-media text-media-foreground/55">
        {preview.previewUrl ? (
          <img
            src={resolveImageDisplayUrl(preview.previewUrl)}
            alt="导演世界缩略图"
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : null}
        {isGenerating ? (
          <NodeGenerationOverlay
            startedAt={data.generationStartedAt ?? null}
            hasBackground={preview.hasPreview}
          />
        ) : null}
      </div>

      {!preview.hasPreview ? (
        <div className="nodrag absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void controller.openDirector();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="director-entry-press-button inline-flex items-center justify-center bg-transparent p-0 disabled:opacity-70"
            style={{ width: 156 }}
            disabled={directorBusy}
            title={t('viewer.threeD.openDirectorWorldTitle')}
            aria-label={
              directorBusy
                ? t('viewer.threeD.openingDirectorWorld')
                : t('viewer.threeD.enterDirectorWorld')
            }
          >
            <video
              src="/images/btnmotion.mp4"
              className="block h-auto select-none"
              style={{ width: '100%' }}
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
            />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void controller.openDirector();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          className="nodrag absolute right-2 top-2 z-20 inline-flex h-6 items-center rounded-full bg-media/45 px-2.5 text-[10px] font-medium text-media-foreground/90 backdrop-blur-md transition-colors hover:bg-media/60 hover:text-media-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={directorBusy}
          title={t('viewer.threeD.openDirectorWorldTitle')}
          aria-label={
            directorBusy
              ? t('viewer.threeD.openingDirectorWorld')
              : t('viewer.threeD.enterDirectorWorld')
          }
        >
          {directorBusy ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : null}
          <span>进入导演世界</span>
        </button>
      )}

      {selected ? (
        <div
          className="absolute z-10 flex flex-col gap-3"
          style={{
            top: `calc(100% + ${PANEL_GAP_PX}px)`,
            left: -PANEL_OVERHANG_PX,
            right: -PANEL_OVERHANG_PX,
          }}
        >
          <OpsPanel
            isGenerating={isGenerating}
            hasUpstream={hasUpstream}
            errorMessage={data.errorMessage}
            sourceKind={selectedImageSourceKind}
            referenceImages={referenceImages}
            selectedReferenceNodeId={selectedReferenceNodeId}
            referenceImage={referenceImage}
            referenceText={referenceText}
            onReferenceImageChange={controller.changeReferenceImage}
            onSourceKindChange={controller.changeSourceKind}
            onSubmit={controller.submitGeneration}
            onFocusUpstream={controller.focusUpstream}
            onDetachUpstream={controller.detachUpstream}
          />
          <HistoryPanel
            records={historyRecords}
            isLoading={historyLoading}
            onRestore={controller.restoreHistory}
            currentPlyUrl={controller.currentPlyUrl}
            previewThumbnailUrl={controller.previewThumbnailUrl}
            onRefresh={controller.refreshHistory}
          />
        </div>
      ) : null}

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-surface-dark !bg-muted-foreground"
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-surface-dark !bg-muted-foreground"
      />
      <NodeResizeHandle
        minWidth={THREE_D_WORLD_NODE_SIZE_LIMITS.minWidth}
        minHeight={THREE_D_WORLD_NODE_SIZE_LIMITS.minHeight}
        maxWidth={THREE_D_WORLD_NODE_SIZE_LIMITS.maxWidth}
        maxHeight={THREE_D_WORLD_NODE_SIZE_LIMITS.maxHeight}
      />
      <ThreeDDirectorDialog
        open={directorDialogOpen}
        onOpenChange={controller.changeDirectorDialogOpen}
        manifest={directorManifest}
        title={t('viewer.threeD.directorWorld')}
        viewerPurpose={beatContext ? 'beat' : 'freezone'}
        onCaptureSelectedBackground={
          beatContext ? controller.captureSelectedBackground : undefined
        }
        onSubmitDirectorCombined={
          beatContext ? controller.submitDirectorCombined : undefined
        }
        onCaptureCanvasNode={controller.captureCanvasNode}
        initialScene={initialScene}
        initialScenesBySourceId={initialScenesBySourceId}
        onSaveScene={controller.saveScene}
        registerSaveSceneHandler={controller.registerSaveSceneHandler}
        onClearScene={controller.clearScene}
      />
    </div>
  );
}
