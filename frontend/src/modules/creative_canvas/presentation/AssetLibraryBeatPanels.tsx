// Copyright (c) 2026 AI anime
import {
  useEffect,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  AudioLines,
  ChevronDown,
  ImageOff,
  Video,
} from "lucide-react";

import { withMediaVariant } from "@/lib/media-url";
import { assetToDragPayload } from "../application/assetLibraryCanvasInsertion";
import { CANVAS_ASSET_DRAG_MIME } from "../domain/assetDrag";
import {
  isThreeDAsset,
  type CanvasKind,
  type LibraryAsset,
} from "../domain/assetLibraryModel";
import type { FreezoneBeatContextResponse } from "../domain/beatContext";
import { beatAssetItems, groupBeatAssets } from "./assetLibraryViewModel";

type AddAsset = (asset: LibraryAsset, index: number) => void;
type CacheBustImage = (imageUrl: string, token: string) => string;

function MiniThumb({
  asset,
  index,
  onAdd,
  cacheToken,
  cacheBustImage,
}: {
  asset: LibraryAsset;
  index: number;
  onAdd: () => void;
  cacheToken: string;
  cacheBustImage: CacheBustImage;
}) {
  const isThreeD = isThreeDAsset(asset);
  const isAudio = asset.mediaType === "audio";
  const isVideo = asset.mediaType === "video";
  const [imageFailed, setImageFailed] = useState(false);
  const thumbUrl = isThreeD || isVideo ? asset.coverUrl : asset.url;
  const displayThumbUrl = thumbUrl
    ? cacheBustImage(withMediaVariant(thumbUrl, "thumb"), cacheToken)
    : null;
  const showImage =
    !imageFailed &&
    !isAudio &&
    Boolean(thumbUrl) &&
    (!isThreeD || Boolean(asset.coverUrl)) &&
    (!isVideo || Boolean(asset.coverUrl));
  const videoPosterUrl =
    isVideo && !imageFailed && !asset.coverUrl && asset.url
      ? `${cacheBustImage(asset.url, cacheToken)}#t=0.1`
      : null;
  const disabled =
    !isThreeD && (asset.mediaType === "text" || asset.mediaType === "file");
  const dragPayload = disabled ? null : assetToDragPayload(asset);

  useEffect(() => {
    setImageFailed(false);
  }, [asset.id, thumbUrl]);

  const handleDragStart = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dragPayload) return;
    event.dataTransfer.setData(
      CANVAS_ASSET_DRAG_MIME,
      JSON.stringify(dragPayload),
    );
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleContextMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    onAdd();
  };

  return (
    <div
      draggable={Boolean(dragPayload)}
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      onClick={onAdd}
      className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded bg-muted border border-border hover:border-foreground/20 hover:bg-accent/60 hover:scale-[1.02] transition-all duration-350"
      data-ui-tooltip={asset.label}
    >
      {showImage ? (
        <img
          src={displayThumbUrl ?? ""}
          alt={asset.label}
          className="h-full w-full rounded object-contain"
          loading={index < 20 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : isAudio ? (
        <div className="flex h-full w-full items-center justify-center rounded bg-primary/10">
          <AudioLines className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : videoPosterUrl ? (
        <div className="relative h-full w-full">
          <video
            src={videoPosterUrl}
            className="h-full w-full rounded bg-media object-contain"
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            onError={() => setImageFailed(true)}
          />
          <div className="pointer-events-none absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded bg-media/65 ring-1 ring-media-foreground/15">
            <Video className="h-2.5 w-2.5 text-media-foreground/90" />
          </div>
        </div>
      ) : isVideo ? (
        <div className="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-foreground/[0.08] to-transparent">
          <Video className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded">
          {imageFailed ? (
            <ImageOff className="h-5 w-5 text-muted-foreground" />
          ) : (
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">
              {isThreeD ? "3gs" : asset.mediaType}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BeatSectionHeader({
  primary,
  secondary,
  action,
}: {
  primary: string;
  secondary: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-between py-2">
      <span className="flex min-w-0 items-baseline gap-3">
        <span className="text-[13px] font-semibold text-foreground/70">
          {primary}
        </span>
        <span className="text-[12px] font-medium text-muted-foreground">
          {secondary}
        </span>
      </span>
      {action}
    </div>
  );
}

function BeatRow({
  beat,
  assets,
  allAssets,
  cacheToken,
  cacheBustImage,
  onAddAsset,
}: {
  beat: number;
  assets: LibraryAsset[];
  allAssets: LibraryAsset[];
  cacheToken: string;
  cacheBustImage: CacheBustImage;
  onAddAsset: AddAsset;
}) {
  const [open, setOpen] = useState(false);
  const items = beatAssetItems(assets);
  if (items.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
        />
        <span className="font-medium">Beat {beat}</span>
        <span className="text-[10px] text-muted-foreground/70">
          ({items.length})
        </span>
      </button>
      {open ? (
        <div className="grid grid-cols-3 gap-1.5 pt-1.5">
          {items.map(({ role, label, asset }) => {
            const index = allAssets.indexOf(asset);
            return (
              <div key={role} className="space-y-1.5">
                <MiniThumb
                  asset={asset}
                  index={index}
                  onAdd={() => onAddAsset(asset, index)}
                  cacheToken={cacheToken}
                  cacheBustImage={cacheBustImage}
                />
                <span className="block text-left text-[12px] text-foreground/70">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function EpisodeSection({
  episode,
  assets,
  allAssets,
  cacheToken,
  cacheBustImage,
  onAddAsset,
}: {
  episode: number;
  assets: LibraryAsset[];
  allAssets: LibraryAsset[];
  cacheToken: string;
  cacheBustImage: CacheBustImage;
  onAddAsset: AddAsset;
}) {
  const [open, setOpen] = useState(true);
  const beatMap = new Map<number, LibraryAsset[]>();
  for (const asset of assets) {
    const assetEpisode = asset.source.episode as number | undefined;
    const beat = asset.source.beat as number | undefined;
    if (assetEpisode === episode && typeof beat === "number") {
      const list = beatMap.get(beat) ?? [];
      list.push(asset);
      beatMap.set(beat, list);
    }
  }

  const beats = [...beatMap.entries()].sort(([left], [right]) => left - right);
  if (beats.length === 0) return null;

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full text-left transition-colors hover:[&_span:first-child]:text-foreground/80"
      >
        <BeatSectionHeader
          primary={`第${episode}集`}
          secondary={`${beats.length} Beat`}
          action={(
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
            />
          )}
        />
      </button>
      {open ? (
        <div className="pb-2">
          {beats.map(([beat, beatAssets]) => (
            <BeatRow
              key={beat}
              beat={beat}
              assets={beatAssets}
              allAssets={allAssets}
              cacheToken={cacheToken}
              cacheBustImage={cacheBustImage}
              onAddAsset={onAddAsset}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DefaultCanvasBeatPanel({
  beatContext,
  assets,
  cacheToken,
  cacheBustImage,
  onAddAsset,
}: {
  beatContext: FreezoneBeatContextResponse | null;
  assets: LibraryAsset[];
  cacheToken: string;
  cacheBustImage: CacheBustImage;
  onAddAsset: AddAsset;
}) {
  const episodes = beatContext?.episodes ?? [];
  if (assets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground/70">
        暂无镜头上下文素材
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-y-auto px-3 pt-1">
      {episodes.map((episode) => {
        const episodeAssets = assets.filter(
          (asset) =>
            (asset.source.episode as number | undefined) === episode.episode,
        );
        if (episodeAssets.length === 0) return null;
        return (
          <EpisodeSection
            key={episode.episode}
            episode={episode.episode}
            assets={episodeAssets}
            allAssets={assets}
            cacheToken={cacheToken}
            cacheBustImage={cacheBustImage}
            onAddAsset={onAddAsset}
          />
        );
      })}
    </div>
  );
}

function PresetBeatPanel({
  metadata,
  assets,
  cacheToken,
  cacheBustImage,
  onAddAsset,
}: {
  metadata: Record<string, unknown> | null;
  assets: LibraryAsset[];
  cacheToken: string;
  cacheBustImage: CacheBustImage;
  onAddAsset: AddAsset;
}) {
  const groups = groupBeatAssets(assets);
  const preset = (metadata?.preset ?? {}) as Record<string, unknown>;
  const defaultTarget = (metadata?.default_push_target ?? null) as
    | Record<string, unknown>
    | null;
  const episode =
    typeof preset.episode === "number"
      ? preset.episode
      : typeof defaultTarget?.episode === "number"
        ? defaultTarget.episode
        : null;
  const beat =
    typeof preset.beat === "number"
      ? preset.beat
      : typeof defaultTarget?.beat === "number"
        ? defaultTarget.beat
        : null;

  return (
    <div className="min-h-0 overflow-y-auto px-3 pt-1 pb-3 space-y-3">
      <BeatSectionHeader
        primary={episode !== null ? `第${episode}集` : "第?集"}
        secondary={beat !== null ? `Beat ${beat}` : "Beat ?"}
      />
      {assets.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-xs text-muted-foreground/70">
          当前镜头没有可用上下文素材
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.id}>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {group.label}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {group.assets.map((asset) => {
                const index = assets.indexOf(asset);
                return (
                  <MiniThumb
                    key={asset.id}
                    asset={asset}
                    index={index}
                    onAdd={() => onAddAsset(asset, index)}
                    cacheToken={cacheToken}
                    cacheBustImage={cacheBustImage}
                  />
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function BeatContextPanel({
  metadata,
  assets,
  canvasKind,
  beatContext,
  cacheToken,
  cacheBustImage,
  onAddAsset,
}: {
  metadata: Record<string, unknown> | null;
  assets: LibraryAsset[];
  canvasKind: CanvasKind;
  beatContext: FreezoneBeatContextResponse | null;
  cacheToken: string;
  cacheBustImage: CacheBustImage;
  onAddAsset: AddAsset;
}) {
  if (
    canvasKind === "default" ||
    canvasKind === "blank" ||
    canvasKind === "episode"
  ) {
    return (
      <DefaultCanvasBeatPanel
        beatContext={beatContext}
        assets={assets}
        cacheToken={cacheToken}
        cacheBustImage={cacheBustImage}
        onAddAsset={onAddAsset}
      />
    );
  }
  if (canvasKind !== "beat") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12 text-center text-xs text-muted-foreground/70">
        当前画布没有镜头上下文
      </div>
    );
  }
  return (
    <PresetBeatPanel
      metadata={metadata}
      assets={assets}
      cacheToken={cacheToken}
      cacheBustImage={cacheBustImage}
      onAddAsset={onAddAsset}
    />
  );
}
