// Copyright (c) 2026 AI anime
import { useAnchoredOverlay } from "@/components/ui/use-anchored-overlay";
import { OverlayPortal } from "@/components/ui/overlay";
import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";

import {
  NODE_TEXT_CONTROL_ICON_CLASS,
  NODE_TEXT_CONTROL_TRIGGER_CLASS,
} from "./canvasNodeControlStyles";
import {
  findCameraMovementPreset,
  type CameraMovementPreset,
} from "../domain/cameraMovementPresets";
import { CameraMovementPickerPopover } from "./CameraMovementPickerPopover";


export interface CameraMovementChipProps {
  templates: ReadonlyArray<CameraMovementPreset>;
  isLoading: boolean;
  selectedId: string | null;
  onChange: (next: string | null) => void;
}

export function CameraMovementChip({
  templates,
  isLoading,
  selectedId,
  onChange,
}: CameraMovementChipProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const popoverStyle = useAnchoredOverlay({ anchor: triggerRef, panel: popoverRef, open: isOpen, side: "top", maxHeight: 560 });

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

  const selectedPreset = findCameraMovementPreset(templates, selectedId);
  const label = selectedPreset?.label ?? "运镜";
  const isActive = Boolean(selectedPreset);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((previous) => !previous);
        }}
        className={`${NODE_TEXT_CONTROL_TRIGGER_CLASS} group/camera px-1.5 ${isActive ? "text-text-dark" : ""}`}
      >
        <Film
          className={`${NODE_TEXT_CONTROL_ICON_CLASS} group-hover/camera:text-text-dark`}
        />
        <span>{label}</span>
      </button>
      {isOpen &&
        <OverlayPortal kind="popover"><div
            ref={popoverRef}
            className="fixed overflow-auto overscroll-contain"
            style={popoverStyle}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <CameraMovementPickerPopover
              templates={templates}
              isLoading={isLoading}
              selectedId={selectedId}
              onConfirm={(nextId) => {
                onChange(nextId);
                setIsOpen(false);
              }}
              onClose={() => setIsOpen(false)}
            />
          </div></OverlayPortal>}
    </>
  );
}
