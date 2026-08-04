// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { createPortal } from "react-dom";

import {
  NODE_TEXT_CONTROL_ICON_CLASS,
  NODE_TEXT_CONTROL_TRIGGER_CLASS,
} from "./canvasNodeControlStyles";
import {
  findCameraMovementPreset,
  type CameraMovementPreset,
} from "../domain/cameraMovementPresets";
import { CameraMovementPickerPopover } from "./CameraMovementPickerPopover";

const CAMERA_MOVEMENT_POPOVER_WIDTH = 640;
const CAMERA_MOVEMENT_POPOVER_MAX_HEIGHT = 560;
const CAMERA_MOVEMENT_POPOVER_GAP = 8;

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
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen) return;
    const updateAnchor = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const popHeight = Math.min(
        CAMERA_MOVEMENT_POPOVER_MAX_HEIGHT,
        rect.top - CAMERA_MOVEMENT_POPOVER_GAP - 8,
      );
      const wantTop = rect.top - popHeight - CAMERA_MOVEMENT_POPOVER_GAP;
      const top =
        wantTop < 8 ? rect.bottom + CAMERA_MOVEMENT_POPOVER_GAP : wantTop;
      const left = Math.max(
        8,
        Math.min(
          rect.left,
          window.innerWidth - CAMERA_MOVEMENT_POPOVER_WIDTH - 8,
        ),
      );
      setAnchor({ left, top });
    };
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [isOpen]);

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
        anchor &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[10000]"
            style={{ left: anchor.left, top: anchor.top }}
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
          </div>,
          document.body,
        )}
    </>
  );
}
