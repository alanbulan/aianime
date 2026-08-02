// Copyright (c) 2026 AI anime
import { type DragEvent as ReactDragEvent } from "react";
import { AudioLines, Video } from "lucide-react";

import { withImageCacheBust } from "@/features/canvas/application/imageData";
import {
  CANVAS_ASSET_DRAG_MIME,
  assetToDragPayload,
  assetToPushTarget,
  assetDropMediaType,
  isThreeDAsset,
  sceneAssetTypeBadge,
  type LibraryAsset,
} from "@/modules/creative_canvas/public";

export function AssetLibraryAssetCard({
  asset,
  index,
  onAdd,
  cacheToken,
  activeDragMediaType,
  hoverAssetId,
  isConfirming,
  isReplacing,
  onConfirm,
  onCancel,
}: {
  asset: LibraryAsset;
  index: number;
  cacheToken: string;
  onAdd: () => void;
  activeDragMediaType: ReturnType<typeof assetDropMediaType>;
  hoverAssetId: string | null;
  isConfirming: boolean;
  isReplacing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isThreeD = isThreeDAsset(asset);
  const isAudio = asset.mediaType === "audio";
  const isVideo = asset.mediaType === "video";
  const thumbUrl = isThreeD || isVideo ? asset.coverUrl : asset.url;
  const displayThumbUrl = thumbUrl
    ? withImageCacheBust(thumbUrl, cacheToken)
    : null;
  const showImage =
    !isAudio &&
    Boolean(thumbUrl) &&
    (!isThreeD || Boolean(asset.coverUrl)) &&
    (!isVideo || Boolean(asset.coverUrl));
  const videoPosterUrl =
    isVideo && !asset.coverUrl && asset.url
      ? `${withImageCacheBust(asset.url, cacheToken)}#t=0.1`
      : null;
  const disabled =
    !isThreeD && (asset.mediaType === "text" || asset.mediaType === "file");
  const dropMediaType = assetDropMediaType(asset);
  const target = assetToPushTarget(asset.source);
  const replaceable =
    asset.source.pushable !== false &&
    Boolean(dropMediaType) &&
    target !== null &&
    (target.kind !== "director_render" || activeDragMediaType === "image");
  const isDropHover = replaceable && hoverAssetId === asset.id;
  const dragPayload = disabled ? null : assetToDragPayload(asset);
  const typeBadge = sceneAssetTypeBadge(asset);

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dragPayload) return;
    event.dataTransfer.setData(
      CANVAS_ASSET_DRAG_MIME,
      JSON.stringify(dragPayload),
    );
    event.dataTransfer.effectAllowed = "copy";
    const preview = createAssetDragImage(event.currentTarget, asset);
    if (preview) {
      event.dataTransfer.setDragImage(preview, 24, 24);
      window.setTimeout(() => preview.remove(), 0);
    }
  };

  return (
    <div
      data-asset-id={replaceable ? asset.id : undefined}
      data-asset-media-type={replaceable ? dropMediaType ?? undefined : undefined}
      draggable={Boolean(dragPayload)}
      onDragStart={handleDragStart}
      className={`group relative flex items-center gap-3 rounded-[8px] border border-transparent px-1.5 py-2 cursor-pointer transition-all duration-200 hover:border-border hover:bg-accent ${
        dragPayload ? "active:cursor-grabbing" : ""
      } ${isDropHover ? "opacity-70" : ""}`}
      onClick={onAdd}
    >
      <div
        data-drag-thumb
        className="relative h-[80px] w-[60px] shrink-0 overflow-hidden rounded-[6px] bg-muted border border-border flex items-center justify-center transition-colors duration-200 group-hover:border-foreground/20"
      >
        {showImage ? (
          <img
            src={displayThumbUrl ?? ""}
            alt={asset.label}
            className="h-full w-full object-cover"
            loading={index < 8 ? "eager" : "lazy"}
            draggable={false}
          />
        ) : isAudio ? (
          <div className="flex h-full w-full items-center justify-center bg-primary/10">
            <AudioLines className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : videoPosterUrl ? (
          <div className="relative h-full w-full">
            <video
              src={videoPosterUrl}
              className="h-full w-full bg-media object-cover"
              preload="metadata"
              muted
              playsInline
              tabIndex={-1}
            />
            <div className="pointer-events-none absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-media/65 ring-1 ring-media-foreground/15">
              <Video className="h-2.5 w-2.5 text-media-foreground/90" />
            </div>
          </div>
        ) : isVideo ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-foreground/[0.08] to-transparent">
            <Video className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
            {isThreeD ? "3gs" : asset.mediaType}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            className="truncate text-sm font-medium text-foreground/85"
            title={asset.label}
          >
            {asset.label}
          </div>
          {typeBadge ? (
            <span
              className={`shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${typeBadge.className}`}
              title={typeBadge.title}
            >
              {typeBadge.label}
            </span>
          ) : null}
        </div>
        <div
          className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground/80"
          title={asset.sublabel}
        >
          {asset.sublabel || asset.role}
        </div>
      </div>
      <button
        type="button"
        className="tap-button h-6 rounded border border-border px-2 text-[11px] text-muted-foreground opacity-0 transition hover:border-foreground/25 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40"
        onClick={(event) => {
          event.stopPropagation();
          onAdd();
        }}
        title="加入画布"
        disabled={disabled}
      >
        加入
      </button>
      {isConfirming ? (
        <div className="absolute inset-0 z-10 flex flex-col justify-center gap-1.5 rounded-lg border border-border bg-popover/95 px-2.5 backdrop-blur-sm">
          <div className="line-clamp-2 text-[11px] leading-snug text-popover-foreground/85">
            用画布节点替换「{asset.label}」？
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="h-6 flex-1 rounded-md border border-border text-[11px] text-foreground/85 hover:bg-muted disabled:opacity-50"
              onClick={onConfirm}
              disabled={isReplacing}
            >
              {isReplacing ? "替换中…" : "替换"}
            </button>
            <button
              type="button"
              className="h-6 flex-1 rounded-md text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
              onClick={onCancel}
              disabled={isReplacing}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function createAssetDragImage(
  source: HTMLElement,
  asset: LibraryAsset,
): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const thumb = source.querySelector<HTMLElement>("[data-drag-thumb]");
  const preview = document.createElement("div");
  preview.style.position = "fixed";
  preview.style.left = "-1000px";
  preview.style.top = "-1000px";
  preview.style.zIndex = "2147483647";
  preview.style.display = "flex";
  preview.style.alignItems = "center";
  preview.style.gap = "10px";
  preview.style.width = "210px";
  preview.style.minHeight = "72px";
  preview.style.padding = "8px";
  preview.style.borderRadius = "10px";
  preview.style.border = "1px solid var(--border)";
  preview.style.background = "var(--popover)";
  preview.style.boxShadow = "var(--shadow-xl)";
  preview.style.backdropFilter = "blur(12px)";
  preview.style.pointerEvents = "none";

  if (thumb) {
    const thumbClone = thumb.cloneNode(true) as HTMLElement;
    thumbClone.removeAttribute("data-drag-thumb");
    thumbClone.style.width = "48px";
    thumbClone.style.height = "64px";
    thumbClone.style.flexShrink = "0";
    thumbClone.style.borderRadius = "7px";
    thumbClone.style.transform = "none";
    preview.appendChild(thumbClone);
  }

  const textWrap = document.createElement("div");
  textWrap.style.minWidth = "0";
  textWrap.style.flex = "1";

  const title = document.createElement("div");
  title.textContent = asset.label;
  title.style.overflow = "hidden";
  title.style.textOverflow = "ellipsis";
  title.style.whiteSpace = "nowrap";
  title.style.fontSize = "13px";
  title.style.fontWeight = "600";
  title.style.color = "var(--popover-foreground)";
  title.style.opacity = "0.88";

  const subtitle = document.createElement("div");
  subtitle.textContent = asset.sublabel || asset.role;
  subtitle.style.marginTop = "5px";
  subtitle.style.overflow = "hidden";
  subtitle.style.textOverflow = "ellipsis";
  subtitle.style.whiteSpace = "nowrap";
  subtitle.style.fontSize = "11px";
  subtitle.style.color = "var(--popover-foreground)";
  subtitle.style.opacity = "0.62";

  textWrap.append(title, subtitle);
  preview.appendChild(textWrap);
  document.body.appendChild(preview);
  return preview;
}
