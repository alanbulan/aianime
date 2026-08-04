// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Music, Pause } from "lucide-react";
import { createPortal } from "react-dom";

import type {
  VideoReferenceCapEntry,
  VideoReferenceCaps,
  VideoReferenceItem,
} from "../domain/videoReferenceLimits";
import {
  NODE_REFERENCE_MEDIA_CHIP_CLASS,
  NODE_REFERENCE_MEDIA_DETACH_CLASS,
} from "./canvasNodeControlStyles";
import { ReferenceDetachButton } from "./ReferenceDetachButton";

export interface ReferenceMediaRowProps {
  items: ReadonlyArray<VideoReferenceCapEntry>;
  /** 当前生成模式的引用上限；没有上限时传 null。 */
  caps: VideoReferenceCaps | null;
  /** 是否将上限内的前两张图片标记为首帧和尾帧。 */
  showFrameSlotLabels: boolean;
  resolveUrl: (url: string) => string;
  onFocus: (nodeId: string) => void;
  onDetach: (nodeId: string) => void;
  onReorder: (orderedNodeIds: string[]) => void;
}

export function ReferenceMediaRow({
  items,
  caps,
  showFrameSlotLabels,
  resolveUrl,
  onFocus,
  onDetach,
  onReorder,
}: ReferenceMediaRowProps) {
  const [playingAudioNodeId, setPlayingAudioNodeId] = useState<string | null>(
    null,
  );
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [overNodeId, setOverNodeId] = useState<string | null>(null);

  const clearDrag = useCallback(() => {
    setDragNodeId(null);
    setOverNodeId(null);
  }, []);

  const handleDrop = useCallback(
    (targetNodeId: string) => {
      const sourceId = dragNodeId;
      clearDrag();
      if (!sourceId || sourceId === targetNodeId) return;
      const ids = items.map((entry) => entry.item.nodeId);
      const from = ids.indexOf(sourceId);
      const to = ids.indexOf(targetNodeId);
      if (from === -1 || to === -1) return;
      ids.splice(from, 1);
      ids.splice(to, 0, sourceId);
      onReorder(ids);
    },
    [clearDrag, dragNodeId, items, onReorder],
  );

  return (
    <div className="ml-4 flex shrink-0 items-center gap-1.5">
      {items.map((entry) => {
        const { item, typeIndex, withinCap } = entry;
        const overCap = caps !== null && !withinCap;
        const modeCap = caps?.[item.kind] ?? 0;
        const modeLabel = showFrameSlotLabels ? "首尾帧" : "全能参考";
        const overCapTitle = overCap
          ? `${
              item.kind === "image"
                ? "图片"
                : item.kind === "video"
                  ? "视频"
                  : "音频"
            }引用超出${modeLabel}上限（${modeCap}${
              item.kind === "image" ? "张" : "段"
            }），本次生成不会使用该素材`
          : undefined;
        const slotLabel =
          showFrameSlotLabels && item.kind === "image" && withinCap
            ? typeIndex === 1
              ? "首帧"
              : typeIndex === 2
                ? "尾帧"
                : undefined
            : undefined;
        let chip: ReactNode;
        if (item.kind === "image") {
          chip = (
            <ReferenceImageChip
              item={item}
              index={typeIndex - 1}
              slotLabel={slotLabel}
              resolveUrl={resolveUrl}
              onFocus={onFocus}
              onDetach={onDetach}
            />
          );
        } else if (item.kind === "video") {
          chip = (
            <ReferenceVideoChip
              item={item}
              index={typeIndex - 1}
              resolveUrl={resolveUrl}
              onFocus={onFocus}
              onDetach={onDetach}
            />
          );
        } else {
          chip = (
            <ReferenceAudioChip
              item={item}
              index={typeIndex - 1}
              isPlaying={playingAudioNodeId === item.nodeId}
              resolveUrl={resolveUrl}
              onToggle={(playing) =>
                setPlayingAudioNodeId(playing ? item.nodeId : null)
              }
              onFocus={onFocus}
              onDetach={onDetach}
            />
          );
        }

        const isDragging = dragNodeId === item.nodeId;
        const isDropTarget =
          overNodeId === item.nodeId && dragNodeId !== null && !isDragging;

        return (
          <div
            key={item.nodeId}
            title={overCapTitle}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.nodeId);
              setDragNodeId(item.nodeId);
            }}
            onDragOver={(event) => {
              if (!dragNodeId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (overNodeId !== item.nodeId) setOverNodeId(item.nodeId);
            }}
            onDragLeave={() => {
              setOverNodeId((current) =>
                current === item.nodeId ? null : current,
              );
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleDrop(item.nodeId);
            }}
            onDragEnd={clearDrag}
            className={`nodrag relative cursor-grab rounded-md transition active:cursor-grabbing ${
              isDragging ? "opacity-40" : ""
            } ${
              isDropTarget
                ? "ring-2 ring-accent ring-offset-1 ring-offset-surface-dark"
                : ""
            } ${
              overCap
                ? "opacity-50 grayscale ring-1 ring-warning/45 ring-offset-1 ring-offset-surface-dark"
                : ""
            }`}
          >
            {chip}
            {overCap && (
              <span className="pointer-events-none absolute -bottom-1 -left-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-warning/90 text-[10px] font-bold leading-none text-warning-foreground shadow ring-1 ring-surface-dark">
                !
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function useHoverPreviewPos(
  buttonRef: RefObject<HTMLElement | null>,
  width: number,
) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const previewOffset = 10;
  const show = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - width - 8,
        rect.left + rect.width / 2 - width / 2,
      ),
    );
    const top = rect.top - previewOffset;
    setPos({ left, top });
  }, [buttonRef, width]);
  const hide = useCallback(() => setPos(null), []);
  return { pos, show, hide };
}

interface ReferenceImageChipProps {
  item: Extract<VideoReferenceItem, { kind: "image" }>;
  index: number;
  slotLabel?: string;
  resolveUrl: (url: string) => string;
  onFocus: (nodeId: string) => void;
  onDetach: (nodeId: string) => void;
}

function ReferenceImageChip({
  item,
  index,
  slotLabel,
  resolveUrl,
  onFocus,
  onDetach,
}: ReferenceImageChipProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previewWidth = 140;
  const { pos, show, hide } = useHoverPreviewPos(buttonRef, previewWidth);
  const label = item.displayName?.trim() || slotLabel || `引用 ${index + 1}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onFocus(item.nodeId);
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={`nodrag ${NODE_REFERENCE_MEDIA_CHIP_CLASS}`}
        title={label}
      >
        <img
          src={resolveUrl(item.imageUrl)}
          alt={label}
          className="h-full w-full object-cover"
          draggable={false}
        />
        {slotLabel ? (
          <span
            className="pointer-events-none absolute bottom-1 left-1 z-10 text-[9px] font-medium leading-none text-media-foreground"
            style={{
              textShadow:
                "0 0 2px rgba(0,0,0,0.65), 0 1px 1px rgba(0,0,0,0.55)",
            }}
          >
            {slotLabel}
          </span>
        ) : null}
        <ReferenceDetachButton
          nodeId={item.nodeId}
          onDetach={onDetach}
          className={NODE_REFERENCE_MEDIA_DETACH_CLASS}
        />
      </button>
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[400] -translate-y-full"
            style={{ left: pos.left, top: pos.top, width: previewWidth }}
          >
            <div className="overflow-hidden rounded-xl border border-border bg-surface-dark/95 shadow-2xl backdrop-blur-sm">
              <img
                src={resolveUrl(item.imageUrl)}
                alt={label}
                className="block h-auto w-full object-contain"
                draggable={false}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

interface ReferenceVideoChipProps {
  item: Extract<VideoReferenceItem, { kind: "video" }>;
  index: number;
  resolveUrl: (url: string) => string;
  onFocus: (nodeId: string) => void;
  onDetach: (nodeId: string) => void;
}

function ReferenceVideoChip({
  item,
  index,
  resolveUrl,
  onFocus,
  onDetach,
}: ReferenceVideoChipProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previewWidth = 140;
  const { pos, show, hide } = useHoverPreviewPos(buttonRef, previewWidth);
  const label = item.displayName?.trim() || `视频引用 ${index + 1}`;
  const thumb = item.thumbUrl ? (
    <img
      src={resolveUrl(item.thumbUrl)}
      alt={label}
      className="h-full w-full object-cover"
      draggable={false}
    />
  ) : (
    <video
      src={resolveUrl(item.videoUrl)}
      className="h-full w-full object-cover"
      muted
      playsInline
      preload="metadata"
      draggable={false}
    />
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onFocus(item.nodeId);
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        className={`nodrag ${NODE_REFERENCE_MEDIA_CHIP_CLASS}`}
        title={label}
      >
        {thumb}
        <ReferenceDetachButton
          nodeId={item.nodeId}
          onDetach={onDetach}
          className={NODE_REFERENCE_MEDIA_DETACH_CLASS}
        />
      </button>
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[400] -translate-y-full"
            style={{ left: pos.left, top: pos.top, width: previewWidth }}
          >
            <div className="overflow-hidden rounded-xl border border-border bg-surface-dark/95 shadow-2xl backdrop-blur-sm">
              <video
                src={resolveUrl(item.videoUrl)}
                autoPlay
                loop
                muted
                playsInline
                className="block h-auto w-full object-contain"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

interface ReferenceAudioChipProps {
  item: Extract<VideoReferenceItem, { kind: "audio" }>;
  index: number;
  isPlaying: boolean;
  resolveUrl: (url: string) => string;
  onToggle: (playing: boolean) => void;
  onFocus: (nodeId: string) => void;
  onDetach: (nodeId: string) => void;
}

function ReferenceAudioChip({
  item,
  index,
  isPlaying,
  resolveUrl,
  onToggle,
  onFocus,
  onDetach,
}: ReferenceAudioChipProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const src = resolveUrl(item.audioUrl);
    if (audio.src !== src) {
      audio.src = src;
    }
  }, [item.audioUrl, resolveUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      void audio.play().catch(() => {
        onToggle(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, onToggle]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => onToggle(false);
    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [onToggle]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.src = "";
    };
  }, []);

  const label = item.displayName?.trim() || `音频引用 ${index + 1}`;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onFocus(item.nodeId);
        onToggle(!isPlaying);
      }}
      className={`group/refmedia nodrag relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border transition-colors ${
        isPlaying
          ? "border-primary/60 bg-primary/15"
          : "border-border bg-muted hover:border-foreground/30"
      }`}
      title={label}
    >
      {isPlaying ? (
        <Pause className="h-4 w-4 text-primary" />
      ) : (
        <Music className="h-4 w-4 text-text-dark/90" />
      )}
      <ReferenceDetachButton
        nodeId={item.nodeId}
        onDetach={onDetach}
        className={NODE_REFERENCE_MEDIA_DETACH_CLASS}
      />
    </button>
  );
}
