// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Slider } from "@/components/ui/slider";
import type {
  Seedance2SceneOptimize,
  VideoDurationBounds,
  VideoGenQuality,
} from "../domain/videoGenerationModel";
import {
  NODE_FLOATING_PANEL_SURFACE_CLASS,
  NODE_OPTION_ACTIVE_BUTTON_CLASS,
  NODE_TEXT_CONTROL_TRIGGER_CLASS,
} from "./canvasNodeControlStyles";

const VIDEO_PARAM_POPOVER_CLASS =
  `nodrag nowheel absolute bottom-full left-0 z-50 mb-2 w-[320px] p-4 ${NODE_FLOATING_PANEL_SURFACE_CLASS}`;
const VIDEO_PARAM_LABEL_CLASS =
  "mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-dark/72";
const VIDEO_PARAM_BUTTON_BASE_CLASS =
  "inline-flex items-center justify-center rounded px-2 py-2 text-xs transition-colors";
const VIDEO_PARAM_IDLE_BUTTON_CLASS =
  "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground";
const VIDEO_PARAM_ROW_CLASS = "mb-4 gap-2";

export interface VideoConfigPatch {
  readonly [key: string]: unknown;
  readonly aspectRatio?: string;
  readonly quality?: VideoGenQuality;
  readonly durationSec?: number;
  readonly sceneOptimize?: Seedance2SceneOptimize;
  readonly generateAudio?: boolean;
}

export interface VideoConfigChipProps {
  aspectRatio: string;
  aspectRatioOptions: ReadonlyArray<string>;
  quality: VideoGenQuality;
  qualityOptions: ReadonlyArray<VideoGenQuality>;
  durationSec: number;
  durationBounds: VideoDurationBounds;
  normalizeDuration: (value: number) => number;
  sceneOptimize?: Seedance2SceneOptimize;
  sceneOptimizeOptions: ReadonlyArray<Seedance2SceneOptimize>;
  generateAudio: boolean;
  onChange: (patch: VideoConfigPatch) => void;
}

export function VideoConfigChip({
  aspectRatio,
  aspectRatioOptions,
  quality,
  qualityOptions,
  durationSec,
  durationBounds,
  normalizeDuration,
  sceneOptimize,
  sceneOptimizeOptions,
  generateAudio,
  onChange,
}: VideoConfigChipProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [durationDraft, setDurationDraft] = useState(String(durationSec));

  useEffect(() => {
    setDurationDraft(String(durationSec));
  }, [durationSec]);

  const handleDurationInput = (raw: string) => {
    setDurationDraft(raw);
    const parsed = Number(raw);
    if (
      raw.trim() !== "" &&
      Number.isInteger(parsed) &&
      parsed >= durationBounds.min &&
      parsed <= durationBounds.max &&
      parsed !== durationSec
    ) {
      onChange({ durationSec: parsed });
    }
  };

  const commitDuration = () => {
    const parsed = Number(durationDraft);
    if (durationDraft.trim() === "" || !Number.isFinite(parsed)) {
      setDurationDraft(String(durationSec));
      return;
    }
    const normalized = normalizeDuration(parsed);
    setDurationDraft(String(normalized));
    if (normalized !== durationSec) onChange({ durationSec: normalized });
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (
        triggerRef.current?.contains(event.target as Node) ||
        popoverRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown, true);
    return () => document.removeEventListener("mousedown", onPointerDown, true);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((previous) => !previous);
        }}
        className={NODE_TEXT_CONTROL_TRIGGER_CLASS}
      >
        <span>
          {aspectRatio === "auto"
            ? t("node.videoNode.aspect.auto")
            : aspectRatio}
        </span>
        <span className="text-text-muted/80">·</span>
        <span>{quality}</span>
        <span className="text-text-muted/80">·</span>
        <span>{durationSec}s</span>
        {generateAudio ? (
          <Volume2 className="ml-0.5 h-3.5 w-3.5 text-text-muted/90" />
        ) : (
          <VolumeX className="ml-0.5 h-3.5 w-3.5 text-text-muted/90" />
        )}
        <ChevronDown className="h-3 w-3 text-text-muted/90" />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className={VIDEO_PARAM_POPOVER_CLASS}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className={VIDEO_PARAM_LABEL_CLASS}>
            {t("node.videoNode.aspect.title")}
          </div>
          <div className={`grid grid-cols-5 ${VIDEO_PARAM_ROW_CLASS}`}>
            {aspectRatioOptions.map((ratio) => {
              const isActive = aspectRatio === ratio;
              return (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => onChange({ aspectRatio: ratio })}
                  className={`${VIDEO_PARAM_BUTTON_BASE_CLASS} ${
                    isActive
                      ? NODE_OPTION_ACTIVE_BUTTON_CLASS
                      : VIDEO_PARAM_IDLE_BUTTON_CLASS
                  }`}
                >
                  {ratio === "auto"
                    ? t("node.videoNode.aspect.auto")
                    : ratio}
                </button>
              );
            })}
          </div>

          <div className={VIDEO_PARAM_LABEL_CLASS}>
            {t("node.videoNode.quality.title")}
          </div>
          <div className={`grid grid-cols-3 ${VIDEO_PARAM_ROW_CLASS}`}>
            {qualityOptions.map((option) => {
              const isActive = quality === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange({ quality: option })}
                  className={`${VIDEO_PARAM_BUTTON_BASE_CLASS} ${
                    isActive
                      ? NODE_OPTION_ACTIVE_BUTTON_CLASS
                      : VIDEO_PARAM_IDLE_BUTTON_CLASS
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className={VIDEO_PARAM_LABEL_CLASS}>
            {t("node.videoNode.duration.title")}
          </div>
          <div className="mb-4 flex items-center gap-3">
            <Slider
              min={durationBounds.min}
              max={durationBounds.max}
              step={1}
              value={[durationSec]}
              onValueChange={([value]) =>
                onChange({
                  durationSec: normalizeDuration(value ?? durationSec),
                })
              }
              className="min-w-0 flex-1"
              trackClassName="h-1"
              thumbClassName="size-3"
              aria-label={t("node.videoNode.duration.title")}
            />
            <div className="flex shrink-0 items-center gap-1">
              <input
                type="number"
                inputMode="numeric"
                min={durationBounds.min}
                max={durationBounds.max}
                step={1}
                value={durationDraft}
                onChange={(event) => handleDurationInput(event.target.value)}
                onBlur={commitDuration}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitDuration();
                    event.currentTarget.blur();
                  }
                }}
                aria-label={t("node.videoNode.duration.title")}
                className="h-7 w-12 rounded border border-border bg-muted px-1.5 text-center text-xs tabular-nums text-foreground outline-none transition-colors focus:border-primary/45 focus:bg-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-[11px] text-text-muted/80">s</span>
            </div>
          </div>

          {sceneOptimizeOptions.length > 0 && (
            <>
              <div className={VIDEO_PARAM_LABEL_CLASS}>
                {t("node.videoNode.sceneOptimize.title")}
              </div>
              <div className={`grid grid-cols-2 ${VIDEO_PARAM_ROW_CLASS}`}>
                {sceneOptimizeOptions.map((option) => {
                  const isActive = sceneOptimize === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onChange({ sceneOptimize: option })}
                      className={`${VIDEO_PARAM_BUTTON_BASE_CLASS} ${
                        isActive
                          ? NODE_OPTION_ACTIVE_BUTTON_CLASS
                          : VIDEO_PARAM_IDLE_BUTTON_CLASS
                      }`}
                    >
                      {t(`node.videoNode.sceneOptimize.options.${option}`)}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className={VIDEO_PARAM_LABEL_CLASS}>
            {t("node.videoNode.audio.title")}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted px-2.5 py-1.5">
            <span className="text-xs font-medium text-text-dark/88">
              {generateAudio
                ? t("node.videoNode.audio.on")
                : t("node.videoNode.audio.off")}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={generateAudio}
              aria-label={t("node.videoNode.audio.title")}
              onClick={() => onChange({ generateAudio: !generateAudio })}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
                generateAudio
                  ? "border-primary/45 bg-primary"
                  : "border-border bg-input"
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-text-dark shadow-sm transition-transform ${
                  generateAudio ? "translate-x-[18px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
