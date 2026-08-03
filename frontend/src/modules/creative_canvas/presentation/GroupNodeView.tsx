// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  FileText,
  Film,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Music,
  Play,
  Plus,
  RefreshCw,
  Upload,
} from 'lucide-react';

import {
  groupColorBackground,
  groupColorBorder,
} from '@/modules/creative_canvas/domain/groupColors';
import type { StoryboardCellKind } from '@/modules/creative_canvas/domain/storyboardCellPreview';
import type {
  GroupNodeController,
} from '@/modules/creative_canvas/presentation/useGroupNodeController';

const CELL_PLACEHOLDER_ICON: Record<StoryboardCellKind, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  script: FileText,
  empty: ImageIcon,
};

export interface GroupNodeHeaderRenderOptions {
  className: string;
  icon: ReactNode;
  titleText: string;
  editable: boolean;
  onTitleChange: (value: string) => void;
}

export interface GroupNodeResizeHandleRenderOptions {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  visible: boolean;
}

export interface GroupNodeViewBindings {
  nodeFrameClass: string;
  headerPositionClass: string;
  historyModal: ReactNode;
  renderHeader: (options: GroupNodeHeaderRenderOptions) => ReactNode;
  renderResizeHandle: (
    options: GroupNodeResizeHandleRenderOptions,
  ) => ReactNode;
}

export interface GroupNodeViewProps {
  controller: GroupNodeController;
  bindings: GroupNodeViewBindings;
}

export function GroupNodeView({
  controller,
  bindings,
}: GroupNodeViewProps) {
  return (
    <div
      className={`group relative h-full w-full overflow-visible rounded-[18px] border ${bindings.nodeFrameClass} ${
        controller.projectionIsStale ? 'projection-stale-frame' : ''
      }`}
      style={{
        backgroundColor:
          (!controller.isStoryboard &&
            groupColorBackground(controller.data.backgroundColor)) ||
          'var(--group-node-bg)',
        borderColor:
          !controller.isStoryboard && !controller.selected
            ? groupColorBorder(controller.data.backgroundColor)
            : undefined,
      }}
    >
      {bindings.renderHeader({
        className: `${bindings.headerPositionClass}${
          controller.isStoryboard ? ' storyboard-group-drag-handle' : ''
        }`,
        icon: <LayoutGrid className="h-4 w-4" />,
        titleText: controller.headerTitle,
        editable: !controller.isStoryboard,
        onTitleChange: controller.rename,
      })}

      {controller.isStoryboard
        ? controller.emptyCells.map((rect, index) => (
            <button
              key={`empty-${index}`}
              type="button"
              className="nodrag nopan absolute flex items-center justify-center rounded-lg border border-dashed border-border bg-card transition-colors hover:border-foreground/30 hover:bg-muted"
              style={{
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                controller.openAddMenu({
                  cx: rect.x + rect.width / 2,
                  cy: rect.y + rect.height / 2,
                });
              }}
            >
              {controller.uploading ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground/60" />
              ) : (
                <Plus className="h-7 w-7 text-muted-foreground/70" />
              )}
            </button>
          ))
        : null}

      {controller.isStoryboard &&
      controller.addMenuOpen &&
      controller.addMenuAnchor ? (
        <div
          ref={controller.addMenuRef}
          className="nodrag nopan nowheel absolute z-[60] flex w-52 flex-col overflow-hidden rounded-xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-2xl"
          style={{
            left: controller.addMenuAnchor.cx,
            top: controller.addMenuAnchor.cy,
            transform: 'translate(-50%, -50%)',
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-left text-sm hover:bg-muted"
            onClick={(event) => {
              event.stopPropagation();
              controller.requestLocalUpload();
            }}
          >
            <Upload className="h-4 w-4 text-text-muted" />
            <span>{controller.t('canvas.storyboardGroup.localUpload')}</span>
          </button>
          <button
            type="button"
            className="flex h-10 items-center gap-2.5 rounded-[10px] px-3 text-left text-sm hover:bg-muted"
            onClick={(event) => {
              event.stopPropagation();
              controller.openHistory();
            }}
          >
            <History className="h-4 w-4 text-text-muted" />
            <span>{controller.t('canvas.storyboardGroup.fromHistory')}</span>
          </button>
        </div>
      ) : null}

      {controller.isStoryboard ? (
        <input
          ref={controller.fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            void controller.uploadLocalFiles(event.target.files);
            event.target.value = '';
          }}
        />
      ) : null}

      {bindings.historyModal}

      {controller.isStoryboard
        ? controller.storyboardCells.map(({ index, slot, preview, rect }) => {
            const PlaceholderIcon = CELL_PLACEHOLDER_ICON[preview.kind];
            return (
              <div
                key={preview.nodeId}
                className="nodrag nopan absolute cursor-grab overflow-hidden rounded-lg border border-media-foreground/10 bg-media/35 active:cursor-grabbing"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  transition: controller.isDragging
                    ? 'left 150ms ease, top 150ms ease'
                    : undefined,
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.stopPropagation();
                  controller.startStoryboardDrag(index, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                {preview.imageUrl ? (
                  <img
                    src={preview.imageUrl}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-media-foreground/25">
                    <PlaceholderIcon className="h-7 w-7" />
                  </div>
                )}
                {preview.kind === 'video' && preview.imageUrl ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-media/45 backdrop-blur-sm">
                      <Play className="h-4 w-4 fill-media-foreground text-media-foreground" />
                    </span>
                  </div>
                ) : null}
                {controller.showIndex ? (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded bg-media/55 px-1 text-[11px] font-semibold text-media-foreground/90 backdrop-blur-sm">
                    {slot + 1}
                  </span>
                ) : null}
              </div>
            );
          })
        : null}

      {controller.floating ? (
        <div
          className="pointer-events-none absolute z-50 overflow-hidden rounded-lg border border-media-foreground/20 bg-media/35 shadow-xl"
          style={{
            left: controller.floating.left,
            top: controller.floating.top,
            width: controller.floating.width,
            height: controller.floating.height,
          }}
        >
          {controller.floating.preview.imageUrl ? (
            <img
              src={controller.floating.preview.imageUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-media-foreground/25">
              <ImageIcon className="h-7 w-7" />
            </div>
          )}
        </div>
      ) : null}

      {controller.projectionIsStale ? (
        <div className="projection-stale-banner pointer-events-none absolute left-3 top-3 z-20 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-warning/45 bg-popover/95 px-3 py-1.5 text-xs font-semibold text-warning shadow-lg backdrop-blur-md">
          <RefreshCw className="h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="truncate">
            {controller.t('freezone.projections.staleBadge')}
          </span>
        </div>
      ) : null}

      {controller.isStoryboard ? (
        <>
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
        </>
      ) : null}

      {!controller.isStoryboard ? (
        bindings.renderResizeHandle({
          minWidth: 220,
          minHeight: 140,
          maxWidth: 2200,
          maxHeight: 1600,
          visible: Boolean(controller.selected),
        })
      ) : null}
    </div>
  );
}
