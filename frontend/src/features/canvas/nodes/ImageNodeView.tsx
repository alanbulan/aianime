// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, Image as ImageIcon, Sparkles } from 'lucide-react';

import type { ImageNodeController } from '@/features/canvas/hooks/useImageNodeController';
import { CanvasNodeImage } from '@/features/canvas/ui/CanvasNodeImage';
import { DirectorControlBundleBadge } from '@/features/canvas/ui/DirectorControlBundleBadge';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import {
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  CandidateBindingBadges,
  NodeGenerationOverlay,
  NodeResizeHandle,
  RegenerateButton,
  canvasNodeFrameClass,
} from '@/modules/creative_canvas/public';

export function ImageNodeView({
  controller,
}: {
  controller: ImageNodeController;
}) {
  const frameClass = controller.hasGenerationError
    ? controller.selected
      ? 'border-destructive ring-1 ring-destructive/40'
      : 'border-destructive/70 bg-destructive/10 hover:border-destructive/80'
    : canvasNodeFrameClass({
        selected: controller.selected,
        mainline: controller.hasMainlineContext,
      });

  return (
    <div
      className={`group relative overflow-visible rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} p-0 transition-colors duration-150 ${frameClass}`}
      style={{ width: controller.size.width, height: controller.size.height }}
      onClick={controller.select}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={controller.isExportResultNode
          ? <ImageIcon className="h-4 w-4" />
          : <Sparkles className="h-4 w-4" />}
        titleText={controller.title}
        titleClassName="inline-block max-w-[220px] truncate whitespace-nowrap align-bottom"
        editable
        onTitleChange={controller.rename}
      />
      <CandidateBindingBadges roles={controller.candidateBindingRoles} />

      {controller.data.imageUrl && controller.naturalSize ? (
        <div
          className="absolute -top-7 right-1 z-20 flex items-center gap-1 rounded-md border border-media-foreground/10 bg-media/55 px-2 py-0.5 text-[11px] font-medium tabular-nums text-media-foreground/70 backdrop-blur-sm"
          title={controller.resolutionLabel}
        >
          <ImageIcon className="h-3 w-3 text-media-foreground/45" />
          {controller.naturalSize.width}×{controller.naturalSize.height}
        </div>
      ) : null}

      <div
        className={`relative h-full w-full overflow-hidden rounded-[var(--node-radius)] ${controller.hasGenerationError ? 'bg-destructive/10' : 'bg-media'}`}
      >
        <DirectorControlBundleBadge
          bundle={(controller.data as { director_control_bundle?: unknown })
            .director_control_bundle}
        />
        {controller.data.imageUrl ? (
          <CanvasNodeImage
            src={controller.imageSource ?? ''}
            alt={controller.imageAlt}
            viewerSourceUrl={controller.originalImageUrl}
            onLoad={controller.handleImageLoad}
            className="h-full w-full object-contain"
          />
        ) : controller.isGenerating ? (
          <div className="h-full w-full" />
        ) : controller.hasGenerationError ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-destructive">
            <AlertTriangle className="h-7 w-7 opacity-90" />
            <span className="text-center text-[12px] font-medium leading-5 text-destructive">
              {controller.generationFailedLabel}
            </span>
            <span className="max-h-[88px] overflow-y-auto break-words text-center text-[11px] leading-5 text-destructive [overflow-wrap:anywhere]">
              {controller.generationError}
            </span>
            {controller.generationErrorRequestId && (
              <div className="flex w-full max-w-[240px] items-center gap-1 rounded bg-destructive/10 px-2 py-1">
                <span className="shrink-0 text-[10px] text-destructive">
                  请求ID
                </span>
                <code
                  className="min-w-0 flex-1 truncate font-mono text-[10px] text-destructive"
                  title={controller.generationErrorRequestId}
                >
                  {controller.generationErrorRequestId}
                </code>
              </div>
            )}
            {controller.canRetry && (
              <div className="mt-1">
                <RegenerateButton
                  onClick={() => void controller.retry()}
                  busy={controller.isGenerating}
                />
              </div>
            )}
          </div>
        ) : controller.isGenerating ? (
          <div className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted/85">
            {controller.isExportResultNode ? (
              <ImageIcon className="h-7 w-7 opacity-60" />
            ) : (
              <Sparkles className="h-7 w-7 opacity-60" />
            )}
            <span className="px-4 text-center text-[12px] leading-6">
              {controller.waitingResultText}
            </span>
          </div>
        )}

        {controller.isGenerating && (
          <NodeGenerationOverlay
            startedAt={controller.generationStartedAt}
            durationMs={controller.generationDurationMs}
            hasBackground={Boolean(controller.data.imageUrl)}
          />
        )}
      </div>

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
        minWidth={controller.size.resizeMinWidth}
        minHeight={controller.size.resizeMinHeight}
        maxWidth={controller.size.maxWidth}
        maxHeight={controller.size.maxHeight}
        keepAspectRatio
      />
    </div>
  );
}
