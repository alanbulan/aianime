// Copyright (c) 2026 AI anime
import { useMemo } from 'react';
import {
  AlertCircle,
  Box as BoxIcon,
  Check,
  FileText,
  Film,
  History,
  Image as ImageIcon,
  Loader2,
  Music,
  RotateCw,
} from 'lucide-react';

import {
  historyRecordOutputUrl,
  historyRecordPreviewImageUrl,
  historyRecordPrompt,
  isCompletedHistoryRecord,
  type CanvasGenerationHistoryRecord,
} from '@/modules/creative_canvas/public';
import { resolveMediaUrl } from '@/lib/media-url';

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${Math.max(sec, 0)}秒前`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}天前`;
  return new Date(then).toLocaleDateString();
}

function MediaFallbackIcon({ mediaType }: { mediaType: string }) {
  const className = 'h-4 w-4 text-text-muted';
  if (mediaType === 'video') return <Film className={className} />;
  if (mediaType === 'audio') return <Music className={className} />;
  if (mediaType === '3d' || mediaType === 'ply') {
    return <BoxIcon className={className} />;
  }
  if (mediaType === 'text') return <FileText className={className} />;
  return <ImageIcon className={className} />;
}

interface NodeGenerationHistoryProps {
  records: CanvasGenerationHistoryRecord[];
  isLoading?: boolean;
  onRestore: (record: CanvasGenerationHistoryRecord) => void;
  onRefresh?: () => void;
  isActive?: (record: CanvasGenerationHistoryRecord) => boolean;
  fallbackThumbnailUrl?: string | null;
  className?: string;
}

export function NodeGenerationHistory({
  records,
  isLoading = false,
  onRestore,
  onRefresh,
  isActive,
  fallbackThumbnailUrl,
  className,
}: NodeGenerationHistoryProps) {
  const sorted = useMemo(
    () =>
      records
        .filter(isCompletedHistoryRecord)
        .sort(
          (left, right) =>
            new Date(right.recorded_at).getTime() -
            new Date(left.recorded_at).getTime(),
        ),
    [records],
  );

  if (!isLoading && sorted.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <div className="flex items-center justify-between px-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
          <History className="h-3 w-3" />
          历史记录{sorted.length > 0 ? ` · ${sorted.length}` : ''}
        </span>
        {onRefresh && (
          <button
            type="button"
            className="nodrag inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onRefresh();
            }}
            title="刷新历史"
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCw className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
      <div className="nodrag nowheel flex gap-1.5 overflow-x-auto pb-1">
        {sorted.map((record) => {
          const url = resolveMediaUrl(historyRecordOutputUrl(record));
          const completed = isCompletedHistoryRecord(record);
          const isImage =
            completed && Boolean(url) && record.media_type === 'image';
          const isVideo =
            completed && Boolean(url) && record.media_type === 'video';
          const previewImage =
            completed && !isImage && !isVideo
              ? resolveMediaUrl(
                  historyRecordPreviewImageUrl(record) ??
                    fallbackThumbnailUrl ??
                    null,
                )
              : null;
          const restorable = completed && (url || historyRecordPrompt(record));
          const active = completed && Boolean(isActive?.(record));
          return (
            <button
              key={record.id}
              type="button"
              disabled={!restorable}
              aria-pressed={active}
              onClick={(event) => {
                event.stopPropagation();
                if (restorable) onRestore(record);
              }}
              title={`${formatRelativeTime(record.recorded_at)}${
                completed ? '' : ` · ${record.status}`
              }${active ? ' · 当前' : ''}`}
              className={`group relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border transition ${
                active
                  ? 'border-primary'
                  : completed
                    ? 'border-border hover:border-primary'
                    : 'border-destructive/40'
              } ${restorable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {isImage ? (
                <img
                  src={url ?? undefined}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : isVideo ? (
                <video
                  src={url ?? undefined}
                  className="h-full w-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : previewImage ? (
                <img
                  src={previewImage}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-muted">
                  <MediaFallbackIcon mediaType={record.media_type} />
                </span>
              )}
              {!completed && (
                <span className="absolute right-0.5 top-0.5 rounded-full bg-destructive/90 p-0.5">
                  <AlertCircle className="h-2.5 w-2.5 text-destructive-foreground" />
                </span>
              )}
              {active && (
                <span className="pointer-events-none absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary shadow-sm ring-1 ring-surface-dark">
                  <Check
                    className="h-2.5 w-2.5 text-primary-foreground"
                    strokeWidth={3}
                  />
                </span>
              )}
              <span
                className={`pointer-events-none absolute inset-x-0 bottom-0 truncate px-1 py-0.5 text-[9px] leading-none ${
                  active
                    ? 'bg-primary/85 text-primary-foreground'
                    : 'bg-media/55 text-media-foreground/80'
                }`}
              >
                {formatRelativeTime(record.recorded_at)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
