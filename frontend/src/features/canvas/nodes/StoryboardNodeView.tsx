// Copyright (c) 2026 AI anime
import { memo } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position } from '@xyflow/react';
import {
  Download,
  FolderOpen,
  ImagePlus,
  SlidersHorizontal,
  SquareArrowOutUpRight,
} from 'lucide-react';

import {
  CanvasNodeImage,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  NODE_CONTROL_CHIP_CLASS,
  NODE_CONTROL_ICON_CLASS,
  NODE_CONTROL_PRIMARY_BUTTON_CLASS,
  NodeResizeHandle,
  STORYBOARD_GRID_GAP_PX,
  STORYBOARD_NODE_SIZE_LIMITS,
  canvasNodeFrameClass,
  resolveImageDisplayUrl,
  type StoryboardExportOptions,
  type StoryboardFrameItem,
} from '@/modules/creative_canvas/public';
import type { StoryboardNodeController } from '@/features/canvas/hooks/useStoryboardNodeController';
import { UiButton, UiCheckbox, UiChipButton, UiInput, UiPanel, UiSelect } from '@/components/ui';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/modules/creative_canvas/public';

const STORYBOARD_SPLIT_HEADER_ADJUST = { x: 0, y: 0, scale: 1 };
const STORYBOARD_SPLIT_ICON_ADJUST = { x: 0, y: 0, scale: 1 };
const STORYBOARD_SPLIT_TITLE_ADJUST = { x: 0, y: 0, scale: 1 };
const STORYBOARD_EXPORT_PANEL_CLASS =
  '!border-border !bg-popover/96 shadow-xl';
const STORYBOARD_EXPORT_FIELD_CLASS =
  '!rounded-[6px] !border-border focus:!border-primary hover:!border-foreground/30';
const STORYBOARD_EXPORT_CHECKBOX_CLASS =
  '!h-6 !w-6 !rounded-[6px] !border-border aria-checked:!border-primary/55 aria-checked:!bg-primary/12 aria-checked:!text-primary shadow-sm';
const STORYBOARD_EXPORT_TRIGGER_CLASS =
  '!h-7 !rounded-md !border !px-2.5 !text-[12px]';
const STORYBOARD_EXPORT_TRIGGER_INACTIVE_CLASS =
  '!border-transparent !bg-transparent !text-foreground/86 hover:!bg-muted hover:!text-foreground';
const STORYBOARD_EXPORT_TRIGGER_ACTIVE_CLASS =
  '!border-primary/36 !bg-primary/14 !text-foreground shadow-sm';
const STORYBOARD_EXPORT_BUTTON_CLASS =
  '!h-6 !rounded-md !border-border !bg-muted !px-2.5 !text-[11px] !text-foreground/90 hover:!border-foreground/25 hover:!bg-accent hover:!text-foreground';
const STORYBOARD_EXPORT_PRIMARY_BUTTON_CLASS =
  '!h-7 !rounded-md !border-transparent !bg-transparent !px-1.5 !text-[12px] !text-foreground/92 hover:!bg-transparent hover:!text-foreground';

function SplitResultIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M10 0c1.66 0 3 1.34 3 3v3l2.4-1.5a3.003 3.003 0 0 1 3 5.2a3.003 3.003 0 0 1-4.452-2.051l-.952.55v6.8h-2v-5.65l-4.01 2.32l-.988-1.73l5-2.94v-1.17a2.996 2.996 0 0 1-4-2.829c0-1.66 1.34-3 3-3zM9 3a1 1 0 0 0 2 0a1 1 0 0 0-2 0m7 4a1 1 0 0 0 2 0a1 1 0 0 0-2 0M2.97 19h2v-2h-2V9h3V7h-3c-1.1 0-2 .895-2 2v8c0 1.1.895 2 2 2m6 0h-2v-2h2zm4-2c0 1.1-.895 2-2 2v-2z" />
    </svg>
  );
}

interface FrameCardProps {
  frame: StoryboardFrameItem;
  index: number;
  frameAspectRatioCss: string;
  imageFit: StoryboardExportOptions['imageFit'];
  viewerImageList: string[];
  preferOriginalImage: boolean;
  draggedFrameId: string | null;
  dropTargetFrameId: string | null;
  onSortStart(frameId: string): void;
  onSortHover(frameId: string): void;
  onTogglePicker(frameId: string, x: number, y: number): void;
  onEditFrame(frame: StoryboardFrameItem): void;
  onNoteChange(frameId: string, note: string): void;
}

const FrameCard = memo(function FrameCard({
  frame,
  index,
  frameAspectRatioCss,
  imageFit,
  viewerImageList,
  preferOriginalImage,
  draggedFrameId,
  dropTargetFrameId,
  onSortStart,
  onSortHover,
  onTogglePicker,
  onEditFrame,
  onNoteChange,
}: FrameCardProps) {
  const displaySource = preferOriginalImage
    ? frame.imageUrl || frame.previewImageUrl
    : frame.previewImageUrl || frame.imageUrl;
  const viewerSource = frame.imageUrl || frame.previewImageUrl;
  const dragging = draggedFrameId === frame.id;
  const isDropTarget = dropTargetFrameId === frame.id && !dragging;

  return (
    <div
      onPointerEnter={(event) => {
        event.stopPropagation();
        onSortHover(frame.id);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        onSortHover(frame.id);
      }}
      onMouseDown={(event) => event.stopPropagation()}
      className={`nodrag relative bg-background/85 transition-colors ${
        dragging
          ? 'z-10 opacity-55 ring-1 ring-accent/65'
          : isDropTarget
            ? 'z-10 ring-1 ring-emerald-400/70'
            : ''
      }`}
    >
      <div
        className={`group/frame relative overflow-hidden bg-card ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ aspectRatio: frameAspectRatioCss }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          onSortStart(frame.id);
        }}
      >
        {frame.imageUrl ? (
          <CanvasNodeImage
            src={displaySource ? resolveImageDisplayUrl(displaySource) : ''}
            alt={`Frame ${index + 1}`}
            viewerSourceUrl={
              viewerSource ? resolveImageDisplayUrl(viewerSource) : null
            }
            viewerImageList={viewerImageList}
            className={`h-full w-full ${imageFit === 'contain' ? 'object-contain' : 'object-cover'}`}
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] text-text-muted">
            空格
          </div>
        )}

        <button
          type="button"
          className="absolute right-1 top-1 rounded bg-media/60 p-1 text-media-foreground opacity-0 transition-all duration-150 hover:bg-media/75 group-hover/frame:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onEditFrame(frame);
          }}
          title="单独编辑此格"
        >
          <SquareArrowOutUpRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="absolute bottom-1 right-1 rounded bg-media/60 p-1 text-media-foreground opacity-0 transition-all duration-150 hover:bg-media/75 group-hover/frame:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onTogglePicker(frame.id, event.clientX, event.clientY);
          }}
          title="从输入图片替换"
        >
          <ImagePlus className="h-3 w-3" />
        </button>
      </div>

      <textarea
        value={frame.note}
        onChange={(event) => onNoteChange(frame.id, event.target.value)}
        onMouseDown={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
        placeholder={`格 ${String(index + 1).padStart(2, '0')} 描述`}
        className="ui-scrollbar nodrag nowheel h-10 w-full resize-none overflow-y-auto border-0 border-t border-border bg-background/90 px-2 py-1 text-[10px] text-foreground outline-none focus:border-primary"
      />
    </div>
  );
});

export function StoryboardNodeView({
  controller,
}: {
  controller: StoryboardNodeController;
}) {
  const { projection } = controller;
  return (
    <div
      ref={controller.rootRef}
      className={`group relative flex h-full flex-col overflow-visible rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} p-2 transition-colors duration-150 ${canvasNodeFrameClass({ selected: controller.selected })}`}
      style={{
        width: `${projection.size.width}px`,
        height: `${projection.size.height}px`,
      }}
      onClick={controller.select}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<SplitResultIcon className="h-3.5 w-3.5" />}
        titleText={controller.title}
        headerAdjust={STORYBOARD_SPLIT_HEADER_ADJUST}
        iconAdjust={STORYBOARD_SPLIT_ICON_ADJUST}
        titleAdjust={STORYBOARD_SPLIT_TITLE_ADJUST}
        editable
        onTitleChange={controller.rename}
      />

      <div
        className="ui-scrollbar nowheel min-h-0 flex-1 overflow-auto"
        onWheelCapture={(event) => event.stopPropagation()}
      >
        <div
          className="grid overflow-hidden rounded-lg border border-border bg-muted"
          style={{
            gap: `${STORYBOARD_GRID_GAP_PX}px`,
            gridTemplateColumns: `repeat(${projection.gridCols}, minmax(0, 1fr))`,
          }}
        >
          {projection.orderedFrames.map((frame, index) => (
            <FrameCard
              key={frame.id}
              frame={frame}
              index={index}
              frameAspectRatioCss={projection.frameAspectRatioCss}
              imageFit={projection.exportOptions.imageFit}
              viewerImageList={controller.frameViewerImageList}
              preferOriginalImage={controller.preferOriginalImage}
              draggedFrameId={controller.draggedFrameId}
              dropTargetFrameId={controller.dropTargetFrameId}
              onSortStart={controller.startSort}
              onSortHover={controller.hoverSortTarget}
              onTogglePicker={controller.togglePicker}
              onEditFrame={(targetFrame) => void controller.editFrame(targetFrame)}
              onNoteChange={controller.updateFrameNote}
            />
          ))}
        </div>
      </div>

      {controller.pickerState && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={controller.pickerMenuRef}
              className="nowheel fixed z-[140] w-[120px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
              style={{
                left: `${controller.pickerState.x}px`,
                top: `${controller.pickerState.y}px`,
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onWheelCapture={(event) => event.stopPropagation()}
            >
              {controller.incomingImageItems.length > 0 ? (
                <div
                  className="ui-scrollbar nowheel max-h-[180px] overflow-y-auto"
                  onWheelCapture={(event) => event.stopPropagation()}
                >
                  {controller.incomingImageItems.map((item) => (
                    <button
                      key={`${controller.pickerState?.frameId}-${item.imageUrl}`}
                      type="button"
                      className="flex w-full items-center gap-2 border border-transparent bg-popover px-2 py-2 text-left text-sm text-popover-foreground transition-colors hover:border-foreground/25 hover:bg-muted"
                      onClick={(event) => {
                        event.stopPropagation();
                        controller.replaceFromInput(
                          controller.pickerState!.frameId,
                          item.imageUrl,
                        );
                      }}
                      title={item.label}
                    >
                      <CanvasNodeImage
                        src={item.displayUrl}
                        alt={item.label}
                        viewerSourceUrl={item.viewerUrl}
                        viewerImageList={controller.incomingImageViewerList}
                        className="h-8 w-8 rounded object-cover"
                        draggable={false}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-2 py-2 text-sm text-text-muted">
                  暂无输入图片
                </div>
              )}
            </div>,
            document.body,
          )
        : null}

      {controller.isExportPanelOpen ? (
        <ExportSettingsPanel controller={controller} />
      ) : null}

      <div className="mt-2 flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="nodrag relative flex">
            <UiChipButton
              active={controller.isExportPanelOpen}
              className={`${NODE_CONTROL_CHIP_CLASS} ${STORYBOARD_EXPORT_TRIGGER_CLASS} ${
                controller.isExportPanelOpen
                  ? STORYBOARD_EXPORT_TRIGGER_ACTIVE_CLASS
                  : STORYBOARD_EXPORT_TRIGGER_INACTIVE_CLASS
              }`}
              onClick={(event) => {
                event.stopPropagation();
                controller.toggleExportPanel();
              }}
            >
              <SlidersHorizontal
                className={`${NODE_CONTROL_ICON_CLASS} shrink-0`}
              />
              <span>导出设置</span>
            </UiChipButton>
          </div>
          <div className="truncate text-[11px] text-text-muted/80">
            {projection.gridRows} x {projection.gridCols} |{' '}
            {projection.totalFrames} 格
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <UiButton
            size="sm"
            variant="muted"
            className={`nodrag ${NODE_CONTROL_PRIMARY_BUTTON_CLASS} ${STORYBOARD_EXPORT_BUTTON_CLASS}`}
            onClick={(event) => {
              event.stopPropagation();
              void controller.packSingleImages();
            }}
            disabled={controller.isAnyExporting}
          >
            <FolderOpen className={NODE_CONTROL_ICON_CLASS} />
            {controller.isPackingSingleImages ? '打包中...' : '打包下载'}
          </UiButton>
          <UiButton
            size="sm"
            variant="primary"
            className={`nodrag ${NODE_CONTROL_PRIMARY_BUTTON_CLASS} ${STORYBOARD_EXPORT_PRIMARY_BUTTON_CLASS}`}
            onClick={(event) => {
              event.stopPropagation();
              void controller.exportGrid();
            }}
            disabled={controller.isAnyExporting}
          >
            <Download className={NODE_CONTROL_ICON_CLASS} />
            {controller.isExporting ? '导出中...' : '合并宫格'}
          </UiButton>
        </div>
      </div>

      {controller.exportError ? (
        <div className="mt-2 shrink-0 break-words text-xs text-destructive [overflow-wrap:anywhere]">
          {controller.exportError}
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
        minWidth={STORYBOARD_NODE_SIZE_LIMITS.minWidth}
        minHeight={STORYBOARD_NODE_SIZE_LIMITS.minHeight}
        maxWidth={STORYBOARD_NODE_SIZE_LIMITS.maxWidth}
        maxHeight={STORYBOARD_NODE_SIZE_LIMITS.maxHeight}
      />
    </div>
  );
}

function ExportSettingsPanel({
  controller,
}: {
  controller: StoryboardNodeController;
}) {
  const options = controller.projection.exportOptions;
  return (
    <UiPanel
      className={`nodrag nowheel mt-2 shrink-0 p-2.5 ${STORYBOARD_EXPORT_PANEL_CLASS}`}
      onMouseDown={(event) => event.stopPropagation()}
      onWheelCapture={(event) => event.stopPropagation()}
    >
      <div className="grid gap-2 text-xs text-text-muted/82">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 whitespace-nowrap text-foreground/90">
            <UiCheckbox
              className={STORYBOARD_EXPORT_CHECKBOX_CLASS}
              checked={options.showFrameIndex}
              onCheckedChange={(checked) =>
                controller.patchExportOptions({ showFrameIndex: checked })
              }
            />
            显示格序号
          </label>
          <label className="flex items-center gap-2 whitespace-nowrap text-foreground/90">
            <UiCheckbox
              className={STORYBOARD_EXPORT_CHECKBOX_CLASS}
              checked={options.showFrameNote}
              onCheckedChange={(checked) =>
                controller.patchExportOptions({ showFrameNote: checked })
              }
            />
            显示格描述
          </label>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="grid min-w-0 gap-1">
            <span className="truncate">图片填充</span>
            <UiSelect
              className={STORYBOARD_EXPORT_FIELD_CLASS}
              value={options.imageFit}
              onChange={(event) =>
                controller.patchExportOptions({
                  imageFit:
                    event.target.value === 'contain' ? 'contain' : 'cover',
                })
              }
            >
              <option value="cover">填充满格子</option>
              <option value="contain">完整显示</option>
            </UiSelect>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="truncate">描述位置</span>
            <UiSelect
              className={STORYBOARD_EXPORT_FIELD_CLASS}
              value={options.notePlacement}
              onChange={(event) =>
                controller.patchExportOptions({
                  notePlacement:
                    event.target.value === 'bottom' ? 'bottom' : 'overlay',
                })
              }
            >
              <option value="overlay">图上遮罩</option>
              <option value="bottom">图下文字</option>
            </UiSelect>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="truncate">序号前缀</span>
            <UiInput
              value={options.frameIndexPrefix}
              maxLength={4}
              className={`h-8 ${STORYBOARD_EXPORT_FIELD_CLASS}`}
              onChange={(event) =>
                controller.patchExportOptions({
                  frameIndexPrefix: event.target.value,
                })
              }
            />
          </label>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <label className="grid min-w-0 gap-1">
            <span className="truncate">间距</span>
            <UiInput
              type="number"
              min={0}
              max={120}
              value={options.cellGap}
              className={`h-8 ${STORYBOARD_EXPORT_FIELD_CLASS}`}
              onChange={(event) =>
                controller.patchExportOptions({
                  cellGap: Number(event.target.value) || 0,
                })
              }
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="truncate">字号(%)</span>
            <UiInput
              type="number"
              min={1}
              max={20}
              value={options.fontSize}
              className={`h-8 ${STORYBOARD_EXPORT_FIELD_CLASS}`}
              onChange={(event) =>
                controller.patchExportOptions({
                  fontSize: Number(event.target.value) || 4,
                })
              }
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="truncate">背景</span>
            <input
              type="color"
              value={options.backgroundColor}
              onChange={(event) =>
                controller.patchExportOptions({
                  backgroundColor: event.target.value,
                })
              }
              className="h-8 w-full rounded-[6px] border border-border bg-transparent p-0.5 hover:border-foreground/35"
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="truncate">文字</span>
            <input
              type="color"
              value={options.textColor}
              onChange={(event) =>
                controller.patchExportOptions({
                  textColor: event.target.value,
                })
              }
              className="h-8 w-full rounded-[6px] border border-border bg-transparent p-0.5 hover:border-foreground/35"
            />
          </label>
        </div>
      </div>
    </UiPanel>
  );
}
