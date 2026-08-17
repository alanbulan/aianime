// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box as BoxIcon,
  Check,
  Pause,
  Play,
  Trash2,
  Volume2,
} from 'lucide-react';

import type { CanvasAsset } from '../domain/canvasAsset';

export interface CanvasHistoryAssetCardProps {
  asset: CanvasAsset;
  sizePx: number;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onView: () => void;
  onUse: () => void;
  onDelete: () => void;
  onOpenPrompt?: () => void;
}

function formatClock(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = Math.floor(safe);
  const minutes = Math.floor(total / 60);
  const remainingSeconds = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

export function CanvasHistoryAssetCard({
  asset,
  sizePx,
  selectionMode,
  selected,
  onToggleSelect,
  onView,
  onUse,
  onDelete,
  onOpenPrompt,
}: CanvasHistoryAssetCardProps) {
  const { t } = useTranslation();
  const isAudio = asset.kind === 'audio';
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  useEffect(() => {
    if (!audioPlaying) return;
    let frame = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setAudioTime(audio.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audioPlaying]);

  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  };

  const seekToClientX = (clientX: number, bar: HTMLElement) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = ratio * audioDuration;
    audio.currentTime = next;
    setAudioTime(next);
  };

  const progressPercent =
    audioDuration > 0 ? Math.min(100, (audioTime / audioDuration) * 100) : 0;
  const showProgress = isAudio && !selectionMode && (audioPlaying || audioTime > 0);

  return (
    <div
      style={{ width: sizePx, height: sizePx }}
      className={`group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors ${
        selected ? 'border-primary' : 'border-border hover:border-foreground/25'
      }`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isAudio ? (
          <div className="relative flex h-full w-full items-center justify-center bg-muted">
            <Volume2 className="h-7 w-7 text-primary" />
            <audio
              ref={audioRef}
              src={asset.url}
              preload="none"
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration;
                if (Number.isFinite(duration) && duration > 0) {
                  setAudioDuration(duration);
                }
              }}
              onPlay={() => setAudioPlaying(true)}
              onPause={() => setAudioPlaying(false)}
              onEnded={() => {
                setAudioPlaying(false);
                setAudioTime(0);
              }}
            />
          </div>
        ) : asset.kind === 'model' ? (
          asset.previewUrl ? (
            <img
              src={asset.previewUrl}
              alt={asset.label ?? ''}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <BoxIcon className="h-7 w-7 text-primary" />
            </div>
          )
        ) : asset.kind === 'video' && !asset.previewUrl ? (
          <video
            src={asset.url.includes('#') ? asset.url : `${asset.url}#t=0.1`}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            tabIndex={-1}
          />
        ) : (
          <img
            src={asset.previewUrl ?? asset.url}
            alt={asset.label ?? ''}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}

        {selectionMode ? (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-pressed={selected}
            className="absolute inset-0"
          >
            <span
              className={`absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full border ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-media-foreground/60 bg-media/40'
              }`}
            >
              {selected && <Check className="h-3 w-3" />}
            </span>
          </button>
        ) : isAudio ? (
          <>
            <button
              type="button"
              onClick={onDelete}
              aria-label={t('canvas.history.delete')}
              data-ui-tooltip={t('canvas.history.delete')}
              className="absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-md bg-media/50 text-media-foreground/85 opacity-0 transition group-hover:opacity-100 hover:bg-destructive/80 hover:text-destructive-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onUse}
              className="absolute left-2 top-2 z-30 rounded-md bg-media/50 px-2 py-1 text-[12px] font-medium text-media-foreground/90 opacity-0 transition group-hover:opacity-100 hover:bg-media/70 hover:text-media-foreground"
            >
              {t('canvas.history.use')}
            </button>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-media/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <button
              type="button"
              onClick={onDelete}
              aria-label={t('canvas.history.delete')}
              data-ui-tooltip={t('canvas.history.delete')}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-media/45 text-media-foreground/85 transition-colors hover:bg-destructive/80 hover:text-destructive-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onView}
                className="text-[13px] font-medium text-media-foreground/90 transition-colors hover:text-media-foreground"
              >
                {t('canvas.history.view')}
              </button>
              <span className="h-3 w-px bg-media-foreground/25" aria-hidden />
              <button
                type="button"
                onClick={onUse}
                className="text-[13px] font-medium text-media-foreground/90 transition-colors hover:text-media-foreground"
              >
                {t('canvas.history.use')}
              </button>
            </div>
          </div>
        )}

        {isAudio && !selectionMode && (
          <button
            type="button"
            onClick={toggleAudio}
            aria-label={
              audioPlaying
                ? t('canvas.history.pause')
                : t('canvas.history.play')
            }
            className="absolute left-1/2 top-1/2 z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-media-foreground/90 text-media shadow-lg ring-1 ring-media/10 transition hover:scale-105 hover:bg-media-foreground"
          >
            {audioPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="ml-0.5 h-5 w-5" />
            )}
          </button>
        )}
        {showProgress && (
          <div className="absolute inset-x-2 bottom-2 z-20 flex items-center gap-1.5">
            <div
              role="slider"
              aria-label={t('canvas.history.play')}
              aria-valuemin={0}
              aria-valuemax={Math.round(audioDuration)}
              aria-valuenow={Math.round(audioTime)}
              tabIndex={0}
              onClick={(event) =>
                seekToClientX(event.clientX, event.currentTarget)
              }
              className="relative h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-media-foreground/25"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] font-medium tabular-nums text-media-foreground/75">
              {formatClock(audioTime)}
            </span>
          </div>
        )}
      </div>

      {(asset.kind === 'image' || asset.kind === 'video') &&
        !selectionMode &&
        asset.prompt && (
          <div
            data-ui-tooltip={asset.prompt}
            onDoubleClick={onOpenPrompt}
            className="line-clamp-[6] flex-none cursor-pointer select-none px-2.5 py-2 text-[12px] leading-snug text-foreground/75 transition-colors hover:text-foreground"
          >
            {asset.prompt}
          </div>
        )}

      {asset.kind === 'model' && !selectionMode && (
        <div
          data-ui-tooltip={asset.label ?? t('viewer.threeD.directorWorld')}
          onDoubleClick={asset.label ? onOpenPrompt : undefined}
          className="line-clamp-2 flex-none cursor-pointer select-none px-2.5 py-2 text-[12px] leading-snug text-foreground/75 transition-colors hover:text-foreground"
        >
          {asset.label ?? t('viewer.threeD.directorWorld')}
        </div>
      )}
    </div>
  );
}
