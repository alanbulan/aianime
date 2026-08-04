// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import type { VideoGenerationModeOption } from "@/features/canvas/nodes/videoGenerationModeOptions";
import {
  NODE_CONTEXT_CONTROL_TRIGGER_CLASS,
  NODE_FLOATING_PANEL_SURFACE_CLASS,
  NODE_OPTION_ACTIVE_BUTTON_CLASS,
  type VideoGenMode,
} from "@/modules/creative_canvas/public";

const VIDEO_MODE_POPOVER_WIDTH = 132;
const VIDEO_MODE_POPOVER_CLASS =
  `nodrag nowheel fixed z-[10000] w-[132px] overflow-visible p-1 ${NODE_FLOATING_PANEL_SURFACE_CLASS}`;
const VIDEO_MODE_TOOLTIP_CLASS =
  "pointer-events-none absolute left-full top-1/2 z-[10001] ml-2 -translate-y-1/2 " +
  "whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] font-medium " +
  "text-popover-foreground/90 shadow-lg";

export interface VideoGenerationModeSelectProps {
  value: VideoGenMode;
  options: ReadonlyArray<VideoGenerationModeOption>;
  onChange: (next: VideoGenMode) => void;
}

export function VideoGenerationModeSelect({
  value,
  options,
  onChange,
}: VideoGenerationModeSelectProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<VideoGenMode | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const activeOption =
    options.find((option) => option.key === value) ?? options[0];

  const syncPopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    setPopoverPosition({
      left: Math.min(
        Math.max(margin, rect.left),
        window.innerWidth - VIDEO_MODE_POPOVER_WIDTH - margin,
      ),
      top: rect.bottom + 8,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setHoveredKey(null);
      return;
    }
    syncPopoverPosition();
    const onPointerDown = (event: MouseEvent) => {
      if (
        triggerRef.current?.contains(event.target as Node) ||
        popoverRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };
    const onViewportChange = () => syncPopoverPosition();
    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [isOpen, syncPopoverPosition]);

  if (!activeOption) return null;

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((previous) => !previous);
        }}
        className={NODE_CONTEXT_CONTROL_TRIGGER_CLASS}
      >
        <span>{t(activeOption.labelKey)}</span>
        <ChevronDown className="h-3 w-3 text-text-muted/90" />
      </button>
      {isOpen &&
        popoverPosition &&
        createPortal(
          <div
            ref={popoverRef}
            className={VIDEO_MODE_POPOVER_CLASS}
            style={{
              left: popoverPosition.left,
              top: popoverPosition.top,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {options.map((option) => {
              const isActive = option.key === value;
              const isDisabled = option.disabledReason != null && !isActive;
              return (
                <div
                  key={option.key}
                  className="relative"
                  onMouseEnter={() =>
                    isDisabled
                      ? setHoveredKey(option.key)
                      : setHoveredKey(null)
                  }
                  onMouseLeave={() =>
                    setHoveredKey((previous) =>
                      previous === option.key ? null : previous,
                    )
                  }
                >
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      onChange(option.key);
                      setIsOpen(false);
                    }}
                    className={`block w-full rounded-[6px] px-3 py-1.5 text-left text-xs transition-colors ${
                      isActive
                        ? NODE_OPTION_ACTIVE_BUTTON_CLASS
                        : isDisabled
                          ? "cursor-not-allowed text-text-muted/40"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {t(option.labelKey)}
                  </button>
                  {isDisabled &&
                    hoveredKey === option.key &&
                    option.disabledReason && (
                      <div className={VIDEO_MODE_TOOLTIP_CLASS}>
                        {option.disabledReason}
                      </div>
                    )}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
