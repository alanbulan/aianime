// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position } from '@xyflow/react';
import {
  AlignJustify,
  ArrowUp,
  AlertCircle,
  ChevronDown,
  Expand,
  FileText,
  ImageIcon,
  Languages,
  Loader2,
  User,
  Video,
  X,
} from 'lucide-react';

import { CreditCostPill } from '@/components/credit-visual';
import type { ScriptGenAction } from '../application/scriptNodeModel';
import {
  CANVAS_NODE_INPUT_FRAME_CLASS,
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS,
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
} from './canvasNodeFrameStyles';
import {
  NODE_CREDIT_PILL_FLAT_CLASS,
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_DISABLED_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
  NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS,
  NODE_INLINE_ICON_BUTTON_CLASS,
} from './canvasNodeControlStyles';
import { EditableTableCell } from './EditableTableCell';
import { hasCompletedHistoryRecords } from '../domain/generationHistoryRecord';
import { NodeGenerationHistory } from './NodeGenerationHistory';
import { NodeGenerationOverlay } from './NodeGenerationOverlay';
import { NodeResizeHandle } from './NodeResizeHandle';
import { OperationPanelShell } from './OperationPanelShell';
import { PanelExpandButton } from './PanelExpandButton';
import { RegenerateButton } from './RegenerateButton';
import { SCRIPT_NODE_SIZE_LIMITS } from '../application/scriptNodeModel';
import { canvasNodeFrameClass } from './canvasNodeFrameStyles';
import type {
  CanvasStoryScriptReference,
  CanvasStoryScriptRow,
} from '../application/generateCanvasStoryScript';
import { isRenderableImageSrc, resolveImageDisplayUrl } from '../domain/imageData';
import type { ScriptNodeController } from './useScriptNodeController';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from './NodeHeader';

const PANEL_GAP_PX = 12;
const PANEL_OVERHANG_PX = 60;
const OPS_PANEL_EXPANDED_WIDTH = 880;
const OPS_PANEL_EXPANDED_HEIGHT = 560;

type ScriptCellRender = 'text' | 'image';

interface ScriptColumnDef {
  key: string;
  label: string;
  widthPx: number;
  render?: ScriptCellRender;
}

const SCRIPT_COLUMNS: ScriptColumnDef[] = [
  { key: 'shot_no', label: '镜号', widthPx: 60 },
  { key: 'duration', label: '时长', widthPx: 80 },
  { key: 'visual_description', label: '画面描述', widthPx: 200 },
  { key: 'character', label: '角色1', widthPx: 120 },
  { key: 'character_desc_1', label: '角色描述1', widthPx: 180 },
  { key: 'character_image_1', label: '角色图1', widthPx: 80, render: 'image' },
  { key: 'character_2', label: '角色2', widthPx: 120 },
  { key: 'character_desc_2', label: '角色描述2', widthPx: 180 },
  { key: 'character_image_2', label: '角色图2', widthPx: 80, render: 'image' },
  { key: 'reference', label: '参考', widthPx: 80, render: 'image' },
  { key: 'shot', label: '景别', widthPx: 120 },
  { key: 'action', label: '角色动作', widthPx: 120 },
  { key: 'emotion', label: '情绪', widthPx: 120 },
  { key: 'scene_tags', label: '场景标签', widthPx: 120 },
  { key: 'lighting_mood', label: '光影氛围', widthPx: 120 },
  { key: 'sound', label: '音效', widthPx: 120 },
  { key: 'dialogue', label: '对白', widthPx: 120 },
  { key: 'shot_prompt', label: '分镜提示词', widthPx: 200 },
  { key: 'video_motion_prompt', label: '视频运动提示词', widthPx: 200 },
];

const SCRIPT_TABLE_MIN_WIDTH = SCRIPT_COLUMNS.reduce(
  (sum, column) => sum + column.widthPx,
  0,
);
const NUMERIC_COLUMN_KEYS = new Set(['shot_no', 'duration']);
const CELL_MAX_HEIGHT_PX = 196;
const SCRIPT_ACTION_ICONS: Record<ScriptGenAction, typeof AlignJustify> = {
  fromScript: AlignJustify,
  fromVideoRef: Video,
  fromCharacter: User,
};

export function ScriptNodeView({
  controller,
}: {
  controller: ScriptNodeController;
}) {
  const cardToneClass = canvasNodeFrameClass({
    selected: controller.selected,
  });

  return (
    <div
      className="group relative h-full w-full overflow-visible"
      style={{ width: controller.size.width, height: controller.size.height }}
      onClick={controller.select}
    >
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

      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<FileText className="h-4 w-4" />}
        titleText={controller.title}
        editable
        onTitleChange={controller.rename}
      />

      <NodeResizeHandle
        minWidth={SCRIPT_NODE_SIZE_LIMITS.minWidth}
        minHeight={SCRIPT_NODE_SIZE_LIMITS.minHeight}
        maxWidth={SCRIPT_NODE_SIZE_LIMITS.maxWidth}
        maxHeight={SCRIPT_NODE_SIZE_LIMITS.maxHeight}
      />

      <div
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} transition-colors ${cardToneClass}`}
      >
        {controller.isGenerating ? (
          <NodeGenerationOverlay
            progress={controller.generationProgress}
          />
        ) : null}
        {controller.hasResult ? (
          <>
            <ScriptResultHeader
              title={controller.headerSubtitle}
              onFullscreen={controller.openFullscreen}
            />
            {controller.data.generationError && !controller.isGenerating ? (
              <div className="flex items-center gap-2 border-b border-destructive/25 bg-destructive/10 px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <span
                  className="min-w-0 flex-1 truncate text-[12px] leading-5 text-destructive"
                  data-ui-tooltip={controller.data.generationError}
                >
                  {controller.data.generationError}
                </span>
                <RegenerateButton
                  label="重试"
                  onClick={() => void controller.submit()}
                />
              </div>
            ) : null}
            <div className="flex-1 overflow-hidden p-2">
              <ScriptResultTable
                rows={controller.rows}
                onCellCommit={controller.commitCell}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <div
              className="flex h-full flex-col justify-center gap-2 py-4"
              style={{ marginInline: 32 }}
            >
              {!controller.hasUpstream ? (
                <>
                  <div className="text-xs text-[var(--canvas-node-input-helper)]">
                    试试：
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {controller.actions.map((action) => {
                      const Icon = SCRIPT_ACTION_ICONS[action.key];
                      return (
                        <button
                          key={action.key}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            controller.pickAction(action.key);
                          }}
                          className="-mx-2 inline-flex items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-text-muted/90" />
                          <span className="truncate">{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
              {controller.data.generationError && !controller.isGenerating ? (
                <div className="flex flex-col items-center gap-2 text-destructive">
                  <AlertCircle className="h-6 w-6 opacity-90" />
                  <span className="max-h-[72px] overflow-y-auto break-words text-center text-[12px] leading-5 text-destructive">
                    {controller.data.generationError}
                  </span>
                  <RegenerateButton
                    label="重试"
                    onClick={() => void controller.submit()}
                    busy={controller.isGenerating}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {controller.showOperationsPanel ? (
        <ScriptOperationsPanel controller={controller} />
      ) : null}

      {controller.hasResult &&
      controller.isFullscreen &&
      typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex flex-col bg-background/95 p-6 backdrop-blur-sm"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between text-foreground">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5" />
                  <span className="text-base font-medium">
                    {controller.title}
                  </span>
                  {controller.headerSubtitle ? (
                    <span className="text-sm text-text-muted">
                      {controller.headerSubtitle}
                    </span>
                  ) : null}
                  <span className="text-sm text-text-muted">
                    共 {controller.rows.length} 个分镜
                  </span>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded border border-border bg-muted px-3 text-sm text-foreground hover:border-foreground/30"
                  onClick={controller.closeFullscreen}
                >
                  <X className="h-4 w-4" />
                  关闭
                </button>
              </div>
              <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card/95">
                <ScriptResultTable
                  rows={controller.rows}
                  onCellCommit={controller.commitCell}
                />
              </div>
            </div>,
            document.body,
          )
        : null}

      {controller.referencePreview && typeof document !== 'undefined'
        ? createPortal(
            <ScriptReferencePreview preview={controller.referencePreview} />,
            document.body,
          )
        : null}
    </div>
  );
}

function ScriptResultHeader({
  title,
  onFullscreen,
}: {
  title: string;
  onFullscreen(): void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] font-medium text-foreground">
          {title || '分镜脚本'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded border border-border bg-muted px-2 text-[11px] text-foreground hover:border-foreground/30"
          onClick={(event) => event.stopPropagation()}
        >
          脚本视图
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded border border-border bg-muted px-2 text-[11px] text-foreground hover:border-foreground/30"
          onClick={(event) => {
            event.stopPropagation();
            onFullscreen();
          }}
        >
          <Expand className="h-3 w-3" />
          全屏
        </button>
      </div>
    </div>
  );
}

function ScriptResultTable({
  rows,
  onCellCommit,
}: {
  rows: CanvasStoryScriptRow[];
  onCellCommit?: (
    rowIndex: number,
    columnKey: string,
    nextValue: string,
  ) => void;
}) {
  return (
    <div className="ui-scrollbar h-full w-full overflow-auto rounded-lg border border-border bg-background">
      <table
        className="border-collapse text-left text-[12px] text-foreground"
        style={{ minWidth: SCRIPT_TABLE_MIN_WIDTH, tableLayout: 'fixed' }}
      >
        <thead className="sticky top-0 z-10">
          <tr>
            {SCRIPT_COLUMNS.map((column) => (
              <th
                key={column.key}
                style={{ width: column.widthPx, minWidth: column.widthPx }}
                className={`border-b border-r border-border bg-muted px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur last:border-r-0 ${
                  NUMERIC_COLUMN_KEYS.has(column.key) ? 'text-center' : ''
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={`align-top transition-colors hover:bg-primary/5 ${
                rowIndex % 2 === 1 ? 'bg-muted' : ''
              }`}
            >
              {SCRIPT_COLUMNS.map((column) => {
                const numeric = NUMERIC_COLUMN_KEYS.has(column.key);
                return (
                  <td
                    key={column.key}
                    style={{
                      width: column.widthPx,
                      minWidth: column.widthPx,
                    }}
                    className={`border-b border-r border-border px-3 py-2 align-top last:border-r-0 ${
                      numeric
                        ? 'text-center tabular-nums text-foreground/90'
                        : ''
                    }`}
                  >
                    <div
                      className="ui-scrollbar nowheel overflow-y-auto overflow-x-hidden"
                      style={{ maxHeight: CELL_MAX_HEIGHT_PX }}
                    >
                      <ScriptResultCell
                        row={row}
                        column={column}
                        onCommit={
                          onCellCommit
                            ? (nextValue) =>
                                onCellCommit(
                                  rowIndex,
                                  column.key,
                                  nextValue,
                                )
                            : undefined
                        }
                      />
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScriptResultCell({
  row,
  column,
  onCommit,
}: {
  row: CanvasStoryScriptRow;
  column: ScriptColumnDef;
  onCommit?: (nextValue: string) => void;
}) {
  const raw = row[column.key];

  if (column.render === 'image') {
    const url =
      typeof raw === 'string' && isRenderableImageSrc(raw) ? raw : null;
    if (!url) {
      return (
        <div className="flex h-14 w-14 items-center justify-center rounded border border-dashed border-border bg-muted text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
        </div>
      );
    }
    return (
      <img
        src={resolveImageDisplayUrl(url)}
        alt=""
        className="h-14 w-14 rounded border border-border object-cover"
        draggable={false}
      />
    );
  }

  const initialText =
    raw == null
      ? ''
      : typeof raw === 'string' || typeof raw === 'number'
        ? String(raw)
        : JSON.stringify(raw);
  if (!onCommit) {
    if (initialText.length === 0) {
      return <span className="text-text-muted">-</span>;
    }
    return (
      <span className="block whitespace-pre-wrap break-words leading-snug">
        {initialText}
      </span>
    );
  }
  return <EditableTableCell value={initialText} onCommit={onCommit} />;
}

function ScriptOperationsPanel({
  controller,
}: {
  controller: ScriptNodeController;
}) {
  return (
    <OperationPanelShell
      expanded={controller.panelExpanded}
      onCollapse={controller.collapsePanel}
      inlineClassName={`nodrag absolute z-10 flex flex-col rounded-[var(--node-radius)] border ${CANVAS_NODE_INPUT_SURFACE_CLASS} ${CANVAS_NODE_INPUT_FRAME_CLASS}`}
      inlineStyle={{
        top: `calc(100% + ${PANEL_GAP_PX}px)`,
        left: -PANEL_OVERHANG_PX,
        right: -PANEL_OVERHANG_PX,
      }}
      modalStyle={{
        width: `min(${OPS_PANEL_EXPANDED_WIDTH}px, 92vw)`,
        height: `min(${OPS_PANEL_EXPANDED_HEIGHT}px, 86vh)`,
      }}
    >
      <PanelExpandButton
        expanded={controller.panelExpanded}
        onToggle={controller.togglePanel}
        className="absolute right-2 top-2 z-20"
      />
      {controller.references.length > 0 ? (
        <div className="px-3 pr-10 pt-3">
          <ScriptReferencesRow controller={controller} />
        </div>
      ) : null}

      <div
        className={`px-3 pt-3 ${
          controller.panelExpanded ? 'flex-1 overflow-hidden' : ''
        }`}
      >
        <textarea
          value={controller.prompt}
          onChange={(event) => controller.changePrompt(event.target.value)}
          placeholder="描述剧情或添加角色参考、视频参考等，为你生成分镜脚本"
          rows={3}
          className={`nodrag nowheel ui-scrollbar w-full resize-none bg-transparent text-[14px] leading-[1.6] text-text-dark outline-none ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS} ${
            controller.panelExpanded ? 'h-full' : 'min-h-[72px]'
          }`}
          disabled={controller.isGenerating}
        />
      </div>

      {controller.data.generationError && !controller.isGenerating ? (
        <div className="break-words px-3 pb-1 text-[11px] text-destructive [overflow-wrap:anywhere]">
          {controller.data.generationError}
        </div>
      ) : null}

      <div className="flex shrink-0 items-center justify-end gap-2 px-3 pb-3 pt-1">
        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            title="翻译（中英文互译）"
            onClick={() => void controller.translate()}
            disabled={
              controller.isGenerating ||
              controller.isTranslating ||
              controller.prompt.trim().length === 0
            }
            active={controller.isTranslating}
          >
            {controller.isTranslating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Languages className="h-4 w-4" />
            )}
          </IconButton>
          <CreditCostPill
            display={controller.scriptCostDisplay}
            disabled={controller.submitDisabled}
            className={NODE_CREDIT_PILL_FLAT_CLASS}
          />
          <button
            type="button"
            disabled={controller.submitDisabled}
            data-ui-tooltip="生成"
            onClick={() => void controller.submit()}
            className={`${NODE_GENERATE_BUTTON_BASE_CLASS} ${
              controller.submitDisabled
                ? NODE_GENERATE_BUTTON_DISABLED_CLASS
                : NODE_GENERATE_BUTTON_ENABLED_CLASS
            }`}
          >
            {controller.isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {hasCompletedHistoryRecords(controller.historyRecords) ? (
        <div className="border-t border-border px-3 py-2">
          <NodeGenerationHistory
            records={controller.historyRecords}
            isLoading={controller.historyLoading}
            onRestore={controller.restoreHistory}
            onRefresh={() => void controller.refreshHistory()}
            isActive={controller.isHistoryRecordActive}
            resolveMediaUrl={resolveImageDisplayUrl}
          />
        </div>
      ) : null}
    </OperationPanelShell>
  );
}

function ScriptReferencesRow({
  controller,
}: {
  controller: ScriptNodeController;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {controller.references.map((reference, index) => (
        <ScriptReferenceChip
          key={reference.nodeId}
          reference={reference}
          index={index}
          controller={controller}
        />
      ))}
    </div>
  );
}

function referenceTitle(reference: CanvasStoryScriptReference, index: number) {
  return reference.displayName?.trim()
    ? reference.displayName.trim()
    : `引用 ${index + 1}`;
}

function ScriptReferenceChip({
  reference,
  index,
  controller,
}: {
  reference: CanvasStoryScriptReference;
  index: number;
  controller: ScriptNodeController;
}) {
  const title = referenceTitle(reference, index);
  let body: ReactNode;
  if (reference.kind === 'image' && reference.thumbUrl) {
    body = (
      <img
        src={resolveImageDisplayUrl(reference.thumbUrl)}
        alt={title}
        className="h-full w-full object-cover"
      />
    );
  } else if (reference.kind === 'video' && reference.thumbUrl) {
    body = (
      <img
        src={resolveImageDisplayUrl(reference.thumbUrl)}
        alt={title}
        className="h-full w-full object-cover"
      />
    );
  } else if (reference.kind === 'video' && reference.videoUrl) {
    body = (
      <video
        src={resolveImageDisplayUrl(reference.videoUrl)}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    );
  } else if (reference.kind === 'video') {
    body = <Video className="h-4 w-4 text-text-muted" />;
  } else if (reference.kind === 'text') {
    body = <span className="text-[11px] font-semibold text-text-muted">T</span>;
  } else {
    body = <span className="text-[11px] text-text-muted">A</span>;
  }

  return (
    <button
      type="button"
      onMouseEnter={(event) =>
        controller.showReferencePreview(
          reference,
          event.currentTarget.getBoundingClientRect(),
        )
      }
      onMouseLeave={controller.hideReferencePreview}
      className="nodrag relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[7px] border border-border bg-muted transition-colors hover:border-foreground/30"
      data-ui-tooltip={title}
    >
      {body}
      <span className="absolute right-1 top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-media/30 px-0.5 text-[9px] font-medium leading-none text-media-foreground/90 backdrop-blur-sm">
        {index + 1}
      </span>
    </button>
  );
}

function ScriptReferencePreview({
  preview,
}: {
  preview: NonNullable<ScriptNodeController['referencePreview']>;
}) {
  const title = referenceTitle(preview.reference, preview.index);
  return (
    <div
      className="pointer-events-none fixed z-[400] -translate-y-full"
      style={{ left: preview.left, top: preview.top, width: preview.width }}
    >
      <div className="overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl backdrop-blur-sm">
        {preview.reference.kind === 'video' && preview.reference.videoUrl ? (
          <video
            src={resolveImageDisplayUrl(preview.reference.videoUrl)}
            autoPlay
            loop
            muted
            playsInline
            className="block h-auto w-full object-contain"
          />
        ) : preview.reference.thumbUrl ? (
          <img
            src={resolveImageDisplayUrl(preview.reference.thumbUrl)}
            alt={title}
            className="block h-auto w-full object-contain"
            draggable={false}
          />
        ) : null}
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  active,
  children,
}: {
  title: string;
  onClick(): void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-ui-tooltip={title}
      onClick={onClick}
      disabled={disabled}
      className={`${NODE_INLINE_ICON_BUTTON_CLASS} ${
        active ? NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS : ''
      }`}
    >
      {children}
    </button>
  );
}
