// Copyright (c) 2026 AI anime
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import {
  ChevronDown,
  Download,
  Loader2,
  Upload as UploadIcon,
  Video as VideoIcon,
} from "lucide-react";

export interface VideoAlbumDeckProps {
  totalSlots: number;
  onExpand: () => void;
}

export function VideoAlbumDeck({
  totalSlots,
  onExpand,
}: VideoAlbumDeckProps) {
  return (
    <>
      {Array.from({ length: Math.min(totalSlots - 1, 3) }, (_, index) => {
        const step = index + 1;
        return (
          <div
            key={`album-deck-${index}`}
            role="button"
            tabIndex={-1}
            data-ui-tooltip="展开画册"
            onClick={(event) => {
              event.stopPropagation();
              onExpand();
            }}
            className="absolute cursor-pointer rounded-[var(--node-radius)] border border-border bg-gradient-to-b from-muted to-card shadow-lg"
            style={{
              top: step * 7,
              bottom: step * 7,
              left: step * 6,
              right: -step * 7,
              transform: `rotate(${step * 1.1}deg)`,
              transformOrigin: "center right",
              opacity: 1 - step * 0.18,
            }}
          />
        );
      })}
    </>
  );
}

export interface VideoAlbumToggleButtonProps {
  totalSlots: number;
  completedCount: number;
  pendingTotal: number;
  pendingCount: number;
  expanded: boolean;
  onToggle: () => void;
}

export function VideoAlbumToggleButton({
  totalSlots,
  completedCount,
  pendingTotal,
  pendingCount,
  expanded,
  onToggle,
}: VideoAlbumToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      data-ui-tooltip={`展开 ${totalSlots} 条生成结果`}
      className="nodrag group/albumpill absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-full bg-media/65 px-2.5 py-1 text-[12px] font-medium tabular-nums text-media-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-media/85 group-hover:inline-flex"
    >
      {pendingCount > 0
        ? `${completedCount}/${pendingTotal}`
        : completedCount}
      <ChevronDown
        className={`h-3.5 w-3.5 transition-transform duration-200 ${
          expanded
            ? "rotate-180 group-hover/albumpill:-translate-y-[2px]"
            : "group-hover/albumpill:translate-y-[2px]"
        }`}
      />
    </button>
  );
}

export interface VideoAlbumGalleryProps {
  width: number;
  height: number;
  totalSlots: number;
  urls: ReadonlyArray<string>;
  mainVideoUrl: string | null;
  pendingCount: number;
  resolveUrl: (url: string) => string;
  onSetMain: (url: string) => void;
  onApply: (url: string) => void;
  onDownload: (url: string, index: number) => void | Promise<void>;
}

export function VideoAlbumGallery({
  width,
  height,
  totalSlots,
  urls,
  mainVideoUrl,
  pendingCount,
  resolveUrl,
  onSetMain,
  onApply,
  onDownload,
}: VideoAlbumGalleryProps) {
  const pointerDownPositionRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerDownPositionRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  return (
    <div
      className="nowheel absolute -left-3 -top-3 z-[80] cursor-grab rounded-2xl border border-border bg-card p-3 shadow-xl active:cursor-grabbing"
      style={{ width: width * 2 + 12 + 24 }}
      onClick={(event) => event.stopPropagation()}
      onPointerDownCapture={handlePointerDown}
    >
      <div className="mb-2 flex items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground">
        <VideoIcon className="h-3.5 w-3.5 text-muted-foreground" />
        画册 · {totalSlots} 条
      </div>
      <div className="grid grid-cols-2 gap-3">
        {urls.map((url, index) => {
          const isMain = url === mainVideoUrl;
          return (
            <div
              key={`album-cell-${index}`}
              role="button"
              tabIndex={-1}
              data-ui-tooltip="点击设为主视频"
              onClick={(event) => {
                event.stopPropagation();
                const start = pointerDownPositionRef.current;
                if (
                  start &&
                  Math.hypot(
                    event.clientX - start.x,
                    event.clientY - start.y,
                  ) > 5
                ) {
                  return;
                }
                onSetMain(url);
              }}
              className={`group/albumcell relative cursor-pointer overflow-hidden rounded-[var(--node-radius)] border bg-media shadow-xl transition-colors ${
                isMain
                  ? "border-primary/80 ring-2 ring-primary/40"
                  : "border-border hover:border-foreground/35"
              }`}
              style={{ width, height }}
            >
              <video
                src={resolveUrl(url)}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
                onMouseEnter={(event) => {
                  void event.currentTarget.play().catch(() => undefined);
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.pause();
                  event.currentTarget.currentTime = 0;
                }}
              />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onApply(url);
                }}
                data-ui-tooltip="把这条视频作为独立视频节点放到画布上"
                className="nodrag absolute left-2 top-2 z-10 hidden h-7 items-center gap-1 rounded-md bg-media/70 px-2.5 text-[12px] font-medium text-media-foreground backdrop-blur-sm transition-colors hover:bg-media/90 group-hover/albumcell:inline-flex"
              >
                <UploadIcon className="h-3.5 w-3.5" />
                应用到画布
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  void onDownload(url, index);
                }}
                data-ui-tooltip="下载这条视频"
                className="nodrag absolute right-2 top-2 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-media/70 text-media-foreground backdrop-blur-sm transition-colors hover:bg-media/90 group-hover/albumcell:inline-flex"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              {isMain && (
                <span className="absolute bottom-2 left-2 z-10 rounded-md bg-media/65 px-2 py-0.5 text-[11px] font-medium text-media-foreground backdrop-blur-sm">
                  主视频
                </span>
              )}
            </div>
          );
        })}
        {Array.from({ length: pendingCount }, (_, index) => (
          <div
            key={`album-pending-${index}`}
            className="relative flex items-center justify-center overflow-hidden rounded-[var(--node-radius)] border border-border bg-media shadow-xl"
            style={{ width, height }}
          >
            <div className="flex flex-col items-center gap-2 text-text-muted/70">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-[12px]">生成中…</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
