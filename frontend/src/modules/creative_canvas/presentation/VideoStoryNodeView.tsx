// Copyright (c) 2026 AI anime
import { createPortal } from 'react-dom';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, Expand, FileVideo2, X } from 'lucide-react';

import { resolveImageDisplayUrl } from '../domain/imageData';
import type { VideoStoryRow } from '../domain/videoStory';
import { EditableTableCell } from './EditableTableCell';
import {
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  canvasNodeFrameClass,
} from './canvasNodeFrameStyles';
import { NodeGenerationOverlay } from './NodeGenerationOverlay';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from './NodeHeader';
import { NodeResizeHandle } from './NodeResizeHandle';
import type { VideoStoryNodeController } from './useVideoStoryNodeController';

interface ColumnDef {
  key: keyof VideoStoryRow;
  label: string;
  widthClass: string;
  wide?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: 'shotNumber', label: '镜号', widthClass: 'min-w-[60px]' },
  { key: 'startTime', label: '开始时间', widthClass: 'min-w-[90px]' },
  { key: 'endTime', label: '结束时间', widthClass: 'min-w-[90px]' },
  { key: 'duration', label: '时长', widthClass: 'min-w-[70px]' },
  { key: 'visualDescription', label: '画面描述', widthClass: 'min-w-[220px]', wide: true },
  { key: 'narrative', label: '叙事内容', widthClass: 'min-w-[220px]', wide: true },
  { key: 'shotSize', label: '景别', widthClass: 'min-w-[80px]' },
  { key: 'cameraAngle', label: '摄影机角度', widthClass: 'min-w-[100px]' },
  { key: 'cameraMovement', label: '摄影机运动', widthClass: 'min-w-[120px]' },
  { key: 'focalAndDof', label: '焦距与景深', widthClass: 'min-w-[120px]' },
  { key: 'lighting', label: '光线', widthClass: 'min-w-[120px]' },
  { key: 'backgroundMusic', label: '背景音乐', widthClass: 'min-w-[140px]' },
  { key: 'voiceAndSfx', label: '人声/音效', widthClass: 'min-w-[140px]' },
  { key: 'imagePrompt', label: '图像生成提示词', widthClass: 'min-w-[260px]', wide: true },
  { key: 'videoMotionPrompt', label: '视频运动提示词', widthClass: 'min-w-[240px]', wide: true },
  { key: 'keyframeUrl', label: '关键帧', widthClass: 'min-w-[120px]' },
];

function StoryCell({
  row,
  column,
  onCommit,
}: {
  row: VideoStoryRow;
  column: ColumnDef;
  onCommit?: (nextValue: string) => void;
}) {
  const value = row[column.key];
  if (column.key === 'keyframeUrl') {
    const url = typeof value === 'string' ? value : null;
    return url ? (
      <img
        src={resolveImageDisplayUrl(url)}
        alt="keyframe"
        className="h-16 w-auto rounded border border-border object-cover"
        draggable={false}
      />
    ) : <span className="text-text-muted/80">—</span>;
  }

  const text = value == null
    ? ''
    : typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : JSON.stringify(value);
  if (onCommit) {
    return (
      <EditableTableCell
        value={text}
        onCommit={onCommit}
        emptyPlaceholder="—"
      />
    );
  }
  return text.length > 0
    ? <span className={column.wide ? 'whitespace-pre-wrap' : ''}>{text}</span>
    : <span className="text-text-muted/80">—</span>;
}

function StoryTable({
  rows,
  compact = false,
  onCellCommit,
}: {
  rows: VideoStoryRow[];
  compact?: boolean;
  onCellCommit?: (
    rowIndex: number,
    column: keyof VideoStoryRow,
    nextValue: string,
  ) => void;
}) {
  return (
    <div className="ui-scrollbar h-full w-full overflow-auto rounded border border-border">
      <table className="min-w-full border-collapse text-left text-[12px] text-text-dark">
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key as string}
                className={`${column.widthClass} border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-text-muted`}
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
              className="border-b border-border align-top hover:bg-muted"
            >
              {COLUMNS.map((column) => (
                <td
                  key={column.key as string}
                  className={`${column.widthClass} px-3 ${compact ? 'py-2' : 'py-3'} align-top`}
                >
                  <StoryCell
                    row={row}
                    column={column}
                    onCommit={onCellCommit
                      ? (nextValue) => onCellCommit(
                          rowIndex,
                          column.key,
                          nextValue,
                        )
                      : undefined}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyStoryState({
  rawResult,
}: {
  rawResult: Record<string, unknown> | null;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex max-w-[460px] flex-col items-center gap-3 text-center">
        <div className="text-sm font-medium text-text-dark">未识别出分镜</div>
        <div className="text-[12px] leading-5 text-text-muted/80">
          返回内容中没有可用分镜行。原始返回已保留为辅助信息，可用于排查接口结果。
        </div>
        <details className="w-full rounded-md border border-border bg-muted text-left">
          <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium text-text-dark/82 transition-colors hover:text-text-dark">
            查看原始返回
          </summary>
          <pre className="ui-scrollbar max-h-[120px] overflow-auto border-t border-border p-3 text-[11px] leading-5 text-muted-foreground">{rawResult ? JSON.stringify(rawResult, null, 2) : '(空)'}</pre>
        </details>
      </div>
    </div>
  );
}

function ErrorStoryState({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <AlertTriangle className="h-7 w-7 text-destructive" />
        <div className="text-sm font-medium text-destructive">解析失败</div>
        <div className="max-h-[88px] overflow-auto break-words text-[12px] leading-5 text-destructive [overflow-wrap:anywhere]">
          {message}
        </div>
      </div>
    </div>
  );
}

export function VideoStoryNodeView({
  controller,
}: {
  controller: VideoStoryNodeController;
}) {
  const toneClass = canvasNodeFrameClass({ selected: controller.selected });
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
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<FileVideo2 className="h-4 w-4" />}
        titleText={controller.title}
        editable
        onTitleChange={controller.rename}
      />
      <NodeResizeHandle
        minWidth={controller.size.minWidth}
        minHeight={controller.size.minHeight}
        maxWidth={controller.size.maxWidth}
        maxHeight={controller.size.maxHeight}
      />

      <div
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} transition-colors ${toneClass}`}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 text-[12px] text-text-muted">
            {controller.status === 'analyzing' ? (
              <span>解析中…</span>
            ) : controller.status === 'error' ? (
              <span className="text-destructive">解析失败</span>
            ) : controller.status === 'ready' ? (
              <span>{controller.rows.length} 条分镜</span>
            ) : (
              <span>未识别出分镜</span>
            )}
          </div>
          <button
            type="button"
            className="inline-flex h-6 items-center gap-1 rounded border border-border bg-muted px-2 text-[11px] text-foreground hover:border-foreground/30 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border"
            onClick={(event) => {
              event.stopPropagation();
              controller.openFullscreen();
            }}
            disabled={controller.rows.length === 0}
          >
            <Expand className="h-3 w-3" />
            全屏
          </button>
        </div>
        <div className="flex-1 overflow-hidden p-2">
          {controller.status === 'analyzing' ? (
            <div className="h-full w-full" />
          ) : controller.status === 'error' ? (
            <ErrorStoryState message={controller.errorMessage} />
          ) : controller.status === 'ready' ? (
            <StoryTable
              rows={controller.rows}
              compact
              onCellCommit={controller.commitCell}
            />
          ) : (
            <EmptyStoryState rawResult={controller.rawResult} />
          )}
        </div>
        {controller.status === 'analyzing' && (
          <NodeGenerationOverlay
            startedAt={controller.analysisStartedAt}
            durationMs={90000}
            hasBackground={false}
            messageKey="canvas.analysisProgress"
          />
        )}
      </div>

      {typeof document !== 'undefined' && controller.isFullscreen && createPortal(
        <div
          className="fixed inset-0 z-[220] flex flex-col bg-background/95 p-6 backdrop-blur-sm"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between text-foreground">
            <div className="flex items-center gap-3">
              <FileVideo2 className="h-5 w-5" />
              <span className="text-base font-medium">{controller.title}</span>
              <span className="text-sm text-text-muted">
                共 {controller.rows.length} 条分镜
              </span>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1 rounded border border-border bg-muted px-3 text-sm text-foreground hover:border-foreground/30 hover:bg-accent"
              onClick={controller.closeFullscreen}
            >
              <X className="h-4 w-4" />
              关闭
            </button>
          </div>
          <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card">
            <StoryTable
              rows={controller.rows}
              onCellCommit={controller.commitCell}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
