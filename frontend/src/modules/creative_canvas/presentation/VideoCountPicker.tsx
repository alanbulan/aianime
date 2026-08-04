// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  NODE_COUNT_POPOVER_CLASS,
  NODE_OPTION_ACTIVE_BUTTON_CLASS,
  NODE_TEXT_CONTROL_TRIGGER_CLASS,
} from "./canvasNodeControlStyles";

export type VideoGenerationCount = 1 | 2 | 4;

const VIDEO_COUNT_OPTION_BASE_CLASS =
  "block w-full rounded-[6px] px-3 py-1.5 text-left text-xs transition-colors";

export interface VideoCountPickerProps {
  value: VideoGenerationCount;
  options: ReadonlyArray<VideoGenerationCount>;
  onChange: (next: VideoGenerationCount) => void;
}

export function VideoCountPicker({
  value,
  options,
  onChange,
}: VideoCountPickerProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

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
        <span>{t("node.videoNode.count.format", { count: value })}</span>
        <ChevronUp className="h-3 w-3 text-text-muted/90" />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className={NODE_COUNT_POPOVER_CLASS}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {options.map((option) => {
            const isActive = option === value;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`${VIDEO_COUNT_OPTION_BASE_CLASS} ${
                  isActive
                    ? NODE_OPTION_ACTIVE_BUTTON_CLASS
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t("node.videoNode.count.format", { count: option })}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
