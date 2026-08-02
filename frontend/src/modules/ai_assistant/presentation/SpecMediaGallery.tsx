// Copyright (c) 2026 AI anime
import { Play, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  extractKeyframeVideoPreviewItems,
  extractPendingKeyframeVideoItem,
  extractUnifiedMediaItems,
  type KeyframeVideoPreviewItem,
  type UnifiedMediaItem,
} from "@/modules/ai_assistant/domain/specMediaProjection";
import type { UiSpec } from "@/modules/ai_assistant/domain/structuredContent";
import {
  VideoDetailModal,
  type SpecMediaDetail,
} from "@/modules/ai_assistant/presentation/SpecMediaModals";
import { JsonNode } from "@/modules/ai_assistant/presentation/StructuredJsonView";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";

function resolveSpecMediaUrl(src: string): Promise<string> {
  if (src.startsWith("ai-anime-unresolved:")) return Promise.resolve(src);
  return Promise.resolve(resolveMediaUrl(src) ?? src);
}

function useResolvedSpecUrl(src?: string): string | undefined {
  const [resolved, setResolved] = useState(src);

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setResolved(undefined);
      return undefined;
    }

    resolveSpecMediaUrl(src).then((url) => {
      if (!cancelled) setResolved(url);
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return resolved;
}

function useVideoFirstFrame(
  src?: string,
  explicitPoster?: string,
): string | undefined {
  const [poster, setPoster] = useState(explicitPoster);

  useEffect(() => {
    if (explicitPoster) {
      setPoster(explicitPoster);
      return undefined;
    }

    setPoster(undefined);
    if (!src) return undefined;

    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;

    const capture = () => {
      if (cancelled || video.videoWidth <= 0 || video.videoHeight <= 0) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        setPoster(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        setPoster(undefined);
      }
    };

    const seekToFirstFrame = () => {
      if (cancelled) return;
      const target =
        Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(0.12, Math.max(video.duration / 100, 0.01))
          : 0.01;
      try {
        video.currentTime = target;
      } catch {
        capture();
      }
    };

    video.addEventListener("loadeddata", seekToFirstFrame, { once: true });
    video.addEventListener("seeked", capture, { once: true });
    video.load();

    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, explicitPoster]);

  return poster;
}

function KeyframeVideoPreviewCard({
  item,
}: {
  item: KeyframeVideoPreviewItem;
}) {
  const [open, setOpen] = useState(false);
  const poster = useResolvedSpecUrl(item.poster);
  const videoSrc = useResolvedSpecUrl(item.videoSrc);
  const previewPoster = useVideoFirstFrame(videoSrc, poster);
  const playable = Boolean(videoSrc);
  const cardStyle = { width: "158px", height: "211px" };

  return (
    <>
      <div style={{ perspective: 800, ...cardStyle }} className="shrink-0">
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-border p-[1.5px]">
          <div className="relative z-10 h-full w-full overflow-hidden rounded-[14px] bg-media">
            <button
              type="button"
              className={cn(
                "relative h-full w-full cursor-pointer text-left",
                !playable && "cursor-default",
              )}
              onClick={() => {
                if (playable) setOpen(true);
              }}
              aria-label={item.title}
            >
              {previewPoster ? (
                <img
                  className="block h-full w-full select-none object-cover"
                  src={previewPoster}
                  alt={item.title}
                  loading="lazy"
                  draggable={false}
                />
              ) : (
                <span className="ai-anime-keyframe-video-placeholder block h-full w-full" />
              )}
              {playable && (
                <span className="ai-anime-keyframe-video-play">
                  <Play className="size-5 fill-media-foreground text-media-foreground" />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 bg-gradient-to-t from-media/85 via-media/35 to-transparent px-3 pb-3 pt-8 text-media-foreground">
                <span className="truncate text-sm font-semibold">{item.title}</span>
                {item.description && (
                  <span className="line-clamp-2 text-[11px] leading-4 text-media-foreground/80">
                    {item.description}
                  </span>
                )}
                {item.status && (
                  <span className="ai-anime-keyframe-video-status">
                    {item.status}
                  </span>
                )}
                {item.progress !== undefined && (
                  <span className="ai-anime-keyframe-video-progress">
                    <span style={{ width: `${item.progress}%` }} />
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      </div>
      {videoSrc && (
        <VideoDetailModal
          src={videoSrc}
          poster={poster}
          title={item.title}
          description={item.description}
          open={open}
          setOpen={setOpen}
        />
      )}
    </>
  );
}

function UnifiedMediaCard({
  item,
  onOpenMedia,
}: {
  item: UnifiedMediaItem;
  onOpenMedia?: (detail: SpecMediaDetail) => void;
}) {
  const [videoOpen, setVideoOpen] = useState(false);
  const src = useResolvedSpecUrl(item.src);
  const poster = useResolvedSpecUrl(item.poster);
  const previewPoster = useVideoFirstFrame(
    item.kind === "video" ? src : undefined,
    poster,
  );
  const imageSrc =
    item.kind === "video"
      ? previewPoster
      : item.kind === "image"
        ? src
        : poster;
  const playable = Boolean(src);

  const openPreview = () => {
    if (!src) return;
    if (item.kind === "video") {
      setVideoOpen(true);
      return;
    }
    if (item.kind === "image") {
      onOpenMedia?.({
        kind: "image",
        src,
        poster,
        title: item.title,
        description: item.description,
      });
    }
  };

  return (
    <>
      <div className="ai-anime-unified-media-card">
        <div className="relative h-full w-full overflow-hidden rounded-2xl bg-border p-[1.5px]">
          <div className="relative z-10 h-full w-full overflow-hidden rounded-[14px] bg-media">
            {item.kind === "audio" ? (
              <div className="relative flex h-full w-full flex-col justify-center gap-4 px-3 pb-16 pt-5">
                <span className="mx-auto flex size-14 items-center justify-center rounded-full border border-media-foreground/15 bg-media-foreground/10 text-media-foreground shadow-xl">
                  <Volume2 className="size-7" />
                </span>
                {src && (
                  <audio
                    className="ai-anime-unified-media-audio w-full"
                    src={src}
                    controls
                    preload="metadata"
                  />
                )}
                {!src && (
                  <span className="ai-anime-keyframe-video-placeholder absolute inset-0" />
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 bg-gradient-to-t from-media/85 via-media/35 to-transparent px-3 pb-3 pt-8 text-media-foreground">
                  <span className="truncate text-sm font-semibold">
                    {item.title}
                  </span>
                  {item.description && (
                    <span className="line-clamp-2 text-[11px] leading-4 text-media-foreground/80">
                      {item.description}
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <button
                type="button"
                className={cn(
                  "relative h-full w-full text-left",
                  playable ? "cursor-pointer" : "cursor-default",
                )}
                onClick={openPreview}
                aria-label={item.title}
              >
                {imageSrc ? (
                  <img
                    className="block h-full w-full select-none object-cover"
                    src={imageSrc}
                    alt={item.title}
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <span className="ai-anime-keyframe-video-placeholder block h-full w-full" />
                )}
                {item.kind === "video" && playable && (
                  <span className="ai-anime-keyframe-video-play">
                    <Play className="size-5 fill-media-foreground text-media-foreground" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1 bg-gradient-to-t from-media/85 via-media/35 to-transparent px-3 pb-3 pt-8 text-media-foreground">
                  <span className="truncate text-sm font-semibold">
                    {item.title}
                  </span>
                  {item.description && (
                    <span className="line-clamp-2 text-[11px] leading-4 text-media-foreground/80">
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      {item.kind === "video" && src && (
        <VideoDetailModal
          src={src}
          poster={poster}
          title={item.title}
          description={item.description}
          open={videoOpen}
          setOpen={setVideoOpen}
        />
      )}
    </>
  );
}

function UnifiedMediaGrid({
  spec,
  onOpenMedia,
}: {
  spec: UiSpec;
  onOpenMedia?: (detail: SpecMediaDetail) => void;
}) {
  const items = extractUnifiedMediaItems(spec);
  if (items.length === 0) return null;

  return (
    <div className="ai-anime-unified-media-grid">
      {items.map((item) => (
        <UnifiedMediaCard key={item.id} item={item} onOpenMedia={onOpenMedia} />
      ))}
    </div>
  );
}

function KeyframeVideoPreview({ spec }: { spec: UiSpec }) {
  const videoItems = extractKeyframeVideoPreviewItems(spec);
  const pendingItem =
    videoItems.length === 0 ? extractPendingKeyframeVideoItem(spec) : null;
  const items =
    videoItems.length > 0 ? videoItems : pendingItem ? [pendingItem] : [];

  if (items.length === 0) {
    return <JsonNode value={spec} />;
  }

  return (
    <div className="ai-anime-keyframe-video-preview">
      <div className="ai-anime-keyframe-video-grid">
        {items.map((item) => (
          <KeyframeVideoPreviewCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

export function UiSpecRenderer({
  spec,
  onOpenMedia,
}: {
  spec: UiSpec;
  onOpenMedia?: (detail: SpecMediaDetail) => void;
}) {
  const mediaItems = extractUnifiedMediaItems(spec);
  return (
    <div
      className="chat-spec-renderer w-full min-w-0 max-w-full overflow-visible [contain:layout]"
      data-spec-type={spec.type ?? "auto"}
    >
      {mediaItems.length > 0 ? (
        <UnifiedMediaGrid spec={spec} onOpenMedia={onOpenMedia} />
      ) : spec.type === "keyframe_video" ? (
        <KeyframeVideoPreview spec={spec} />
      ) : (
        <JsonNode value={spec} />
      )}
    </div>
  );
}
