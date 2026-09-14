// Copyright (c) 2026 AI anime
import { useAnchoredOverlay } from "@/components/ui/use-anchored-overlay";
import { OverlayPortal } from "@/components/ui/overlay";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  NODE_CONTEXT_CONTROL_TRIGGER_CLASS,
  NODE_FLOATING_PANEL_SURFACE_CLASS,
  NODE_OPTION_ACTIVE_BUTTON_CLASS,
} from "./canvasNodeControlStyles";
import type { VideoGenerationModeOption } from "../domain/videoGenerationModeOptions";
import type { VideoGenMode } from "../domain/videoGenerationMode";

const VIDEO_MODE_POPOVER_CLASS =
  `nodrag nowheel fixed w-[132px] overflow-visible p-1 ${NODE_FLOATING_PANEL_SURFACE_CLASS}`;
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
  const popoverStyle = useAnchoredOverlay({ anchor: triggerRef, panel: popoverRef, open: isOpen, side: "bottom", maxHeight: 280 });
  const activeOption =
    options.find((option) => option.key === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) {
      setHoveredKey(null);
      return;
    }
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
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [isOpen]);

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
        <OverlayPortal kind="popover"><div
            ref={popoverRef}
            className={VIDEO_MODE_POPOVER_CLASS}
            style={popoverStyle}
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
          </div></OverlayPortal>}
    </div>
  );
}
