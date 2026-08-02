// Copyright (c) 2026 AI anime
import type { ElementType } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, Volume2, VolumeX, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  VIDEO_COMPOSE_MAX_SPEED,
  VIDEO_COMPOSE_MIN_SPEED,
} from "@/modules/creative_canvas/public";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function VideoComposeZoomInGlyph(props: { className?: string }) {
  return <Plus {...props} />;
}

export function VideoComposeZoomOutGlyph(props: { className?: string }) {
  return <Minus {...props} />;
}

export function VideoComposeToolDivider() {
  return <div className="mx-1 h-5 w-px bg-border-dark" />;
}

export function VideoComposeToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active
          ? "bg-primary/20 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function VideoComposeStepper({
  value,
  onStep,
}: {
  value: string;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1">
      <span className="min-w-[48px] text-right font-mono text-xs tabular-nums text-text-dark">
        {value}
      </span>
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onStep(1)}
          className="text-text-muted transition-colors hover:text-text-dark"
          aria-label="+"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onStep(-1)}
          className="text-text-muted transition-colors hover:text-text-dark"
          aria-label="−"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function VideoComposeSpeedPopover({
  speed,
  sourceSpanMs,
  onChange,
  onClose,
}: {
  speed: number;
  sourceSpanMs: number;
  onChange: (speed: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const safeSpan = sourceSpanMs > 0 ? sourceSpanMs : 1;
  const lengthMs = safeSpan / (speed > 0 ? speed : 1);
  const minLengthMs = safeSpan / VIDEO_COMPOSE_MAX_SPEED;
  const maxLengthMs = safeSpan / VIDEO_COMPOSE_MIN_SPEED;

  const setSpeed = (next: number) =>
    onChange(
      clamp(
        Math.round(next * 100) / 100,
        VIDEO_COMPOSE_MIN_SPEED,
        VIDEO_COMPOSE_MAX_SPEED,
      ),
    );
  const setLength = (nextMs: number) => {
    const clampedLength = clamp(nextMs, minLengthMs, maxLengthMs);
    onChange(
      clamp(
        safeSpan / clampedLength,
        VIDEO_COMPOSE_MIN_SPEED,
        VIDEO_COMPOSE_MAX_SPEED,
      ),
    );
  };

  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-80 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-dark">
          {t("videoCompose.speed")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-text-muted hover:text-text-dark"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3">
        <div className="mb-1 text-xs text-text-muted">
          {t("videoCompose.speedMultiplier")}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={VIDEO_COMPOSE_MIN_SPEED}
            max={VIDEO_COMPOSE_MAX_SPEED}
            step={0.01}
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            list="video-compose-speed-ticks"
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
          <datalist id="video-compose-speed-ticks">
            <option value="0.5" />
            <option value="1" />
            <option value="2" />
            <option value="3" />
            <option value="4" />
          </datalist>
          <VideoComposeStepper
            value={`${speed.toFixed(2)}x`}
            onStep={(direction) => setSpeed(speed + direction * 0.05)}
          />
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs text-text-muted">
          {t("videoCompose.duration")}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={minLengthMs}
            max={maxLengthMs}
            step={10}
            value={lengthMs}
            onChange={(event) => setLength(Number(event.target.value))}
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
          <VideoComposeStepper
            value={`${(lengthMs / 1000).toFixed(1)}s`}
            onStep={(direction) => setLength(lengthMs + direction * 100)}
          />
        </div>
      </div>
    </div>
  );
}

export function VideoComposeVolumePopover({
  volume,
  muted,
  onChange,
  onGestureStart,
  onToggleMute,
  onClose,
}: {
  volume: number;
  muted: boolean;
  onChange: (volume: number) => void;
  onGestureStart: () => void;
  onToggleMute: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const effectiveVolume = muted ? 0 : volume;
  const percent = Math.round(effectiveVolume * 100);
  return (
    <div className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-text-dark">
          {t("videoCompose.volume")}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-text-muted hover:text-text-dark"
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMute}
          className="shrink-0 rounded p-1 text-text-muted transition-colors hover:text-text-dark"
          aria-label={muted ? t("videoCompose.unmute") : t("videoCompose.mute")}
          title={muted ? t("videoCompose.unmute") : t("videoCompose.mute")}
        >
          {muted || volume <= 0 ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effectiveVolume}
          onPointerDown={onGestureStart}
          onKeyDown={(event) => {
            if (!event.repeat && event.key.startsWith("Arrow")) {
              onGestureStart();
            }
          }}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-1 flex-1 cursor-pointer accent-primary"
        />
        <span className="min-w-[40px] text-right font-mono text-xs tabular-nums text-text-dark">
          {percent}%
        </span>
      </div>
    </div>
  );
}
