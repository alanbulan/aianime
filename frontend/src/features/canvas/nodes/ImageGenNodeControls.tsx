// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronDown, Palette } from 'lucide-react';

import {
  IMAGE_GEN_ASPECT_OPTIONS,
  IMAGE_GEN_COUNT_OPTIONS,
  IMAGE_GEN_QUALITY_OPTIONS,
  IMAGE_GEN_SIZE_OPTIONS,
  NODE_COUNT_POPOVER_CLASS,
  NODE_FLOATING_PANEL_SURFACE_CLASS,
  NODE_TEXT_CONTROL_ICON_CLASS,
  NODE_TEXT_CONTROL_TRIGGER_CLASS,
  CAMERA_PICKER_POPOVER_WIDTH,
  CameraPickerPopover,
  StylePickerPopover,
  resolveNearestImageGenAspectOption,
} from '@/modules/creative_canvas/public';
import type {
  ImageGenCount,
  ImageGenNodeData,
  ImageQuality,
  ImageSize,
} from '@/features/canvas/domain/canvasNodes';
import type { ImageGenCameraSelectionData } from '@/modules/creative_canvas/public';

const IMAGE_PARAM_POPOVER_CLASS =
  `nodrag nowheel absolute bottom-full left-0 z-50 mb-2 w-[300px] p-4 ${NODE_FLOATING_PANEL_SURFACE_CLASS}`;
const IMAGE_PARAM_LABEL_CLASS =
  'mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted/85';
const IMAGE_PARAM_BUTTON_BASE_CLASS =
  'inline-flex h-8 items-center justify-center rounded-md text-xs transition-colors';
const IMAGE_PARAM_ACTIVE_BUTTON_CLASS =
  'bg-accent text-accent-foreground ring-1 ring-primary/30';
const IMAGE_PARAM_IDLE_BUTTON_CLASS =
  'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground';
const IMAGE_PARAM_ROW_CLASS = 'mb-4 flex gap-2';
const NODE_COUNT_OPTION_BASE_CLASS =
  'flex w-full items-center justify-center rounded-[6px] px-3 py-1.5 text-xs transition-colors';

interface AspectSizeChipProps {
  aspectRatio: string;
  size: ImageSize;
  quality: ImageQuality;
  /** image2 系模型才显示「画质」选择器，并在标签里带上画质。 */
  showQuality: boolean;
  onChange: (patch: Partial<ImageGenNodeData>) => void;
}

export function AspectSizeChip({ aspectRatio, size, quality, showQuality, onChange }: AspectSizeChipProps) {
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
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [isOpen]);

  const nearestAspect = resolveNearestImageGenAspectOption(aspectRatio);
  const aspectLabel = nearestAspect.label;
  const qualityLabel = IMAGE_GEN_QUALITY_OPTIONS.find((option) => option.value === quality)?.label
    ?? quality;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={NODE_TEXT_CONTROL_TRIGGER_CLASS}
      >
        <span>{aspectLabel}</span>
        {showQuality && (
          <>
            <span className="text-text-muted/80">·</span>
            <span>{qualityLabel}</span>
          </>
        )}
        <span className="text-text-muted/80">·</span>
        <span>{size}</span>
        <ChevronDown className="h-3 w-3 text-text-muted/90" />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className={IMAGE_PARAM_POPOVER_CLASS}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {showQuality && (
            <>
              <div className={IMAGE_PARAM_LABEL_CLASS}>画质</div>
              <div className={IMAGE_PARAM_ROW_CLASS}>
                {IMAGE_GEN_QUALITY_OPTIONS.map((option) => {
                  const isActive = quality === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onChange({ quality: option.value })}
                      className={`${IMAGE_PARAM_BUTTON_BASE_CLASS} flex-1 ${
                        isActive
                          ? IMAGE_PARAM_ACTIVE_BUTTON_CLASS
                          : IMAGE_PARAM_IDLE_BUTTON_CLASS
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className={IMAGE_PARAM_LABEL_CLASS}>分辨率</div>
          <div className={IMAGE_PARAM_ROW_CLASS}>
            {IMAGE_GEN_SIZE_OPTIONS.map((option) => {
              const isActive = size === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChange({ size: option })}
                  className={`${IMAGE_PARAM_BUTTON_BASE_CLASS} flex-1 ${
                    isActive
                      ? IMAGE_PARAM_ACTIVE_BUTTON_CLASS
                      : IMAGE_PARAM_IDLE_BUTTON_CLASS
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className={IMAGE_PARAM_LABEL_CLASS}>比例</div>
          <div className="grid grid-cols-4 gap-2">
            {IMAGE_GEN_ASPECT_OPTIONS.map((option) => {
              const isActive = nearestAspect.value === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange({ aspectRatio: option.value })}
                  className={`${IMAGE_PARAM_BUTTON_BASE_CLASS} ${
                    isActive
                      ? IMAGE_PARAM_ACTIVE_BUTTON_CLASS
                      : IMAGE_PARAM_IDLE_BUTTON_CLASS
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface StyleChipProps {
  projectId: string;
  selectedId: string | null;
  selectedLabel: string | null;
  onChange: (nextId: string | null) => void;
  onOpenChange?: (open: boolean) => void;
}

export function StyleChip({ projectId, selectedId, selectedLabel, onChange, onOpenChange }: StyleChipProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    return () => onOpenChange?.(false);
  }, [onOpenChange]);

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
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [isOpen]);

  const isActive = Boolean(selectedId);
  const label = isActive ? selectedLabel ?? '风格' : '风格';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        title={isActive ? selectedLabel ?? undefined : '风格'}
        className={`${NODE_TEXT_CONTROL_TRIGGER_CLASS} max-w-[160px]`}
      >
        <Palette className={`${NODE_TEXT_CONTROL_ICON_CLASS} shrink-0`} />
        <span className="truncate">{label}</span>
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 z-50 mt-2"
          onClick={(event) => event.stopPropagation()}
        >
          <StylePickerPopover
            projectId={projectId}
            selectedId={selectedId}
            onSelect={(nextId) => {
              onChange(nextId);
              setIsOpen(false);
            }}
            onClose={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

interface CameraChipProps {
  projectId: string;
  selection: ImageGenCameraSelectionData | null;
  summary: string | null;
  onChange: (next: ImageGenCameraSelectionData | null) => void;
}

export function CameraChip({ projectId, selection, summary, onChange }: CameraChipProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const syncPopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 12;
    setPopoverPosition({
      left: Math.min(
        Math.max(margin, rect.left),
        window.innerWidth - CAMERA_PICKER_POPOVER_WIDTH - margin,
      ),
      top: Math.max(margin, rect.top - 8),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
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
    document.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [isOpen, syncPopoverPosition]);

  const isActive = Boolean(selection) && summary != null;
  const label = isActive && summary ? summary : '摄像机';

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        title={isActive ? summary ?? undefined : '摄像机'}
        className={`${NODE_TEXT_CONTROL_TRIGGER_CLASS} max-w-[220px]`}
      >
        <Camera className={`${NODE_TEXT_CONTROL_ICON_CLASS} shrink-0`} />
        <span className="truncate">{label}</span>
      </button>
      {isOpen && popoverPosition && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[10000]"
          style={{
            left: popoverPosition.left,
            top: popoverPosition.top,
            transform: 'translateY(-100%)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <CameraPickerPopover
            projectId={projectId}
            selection={selection}
            onConfirm={(next) => {
              onChange(next);
              setIsOpen(false);
            }}
            onClose={() => setIsOpen(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

interface CountSelectProps {
  value: ImageGenCount;
  onChange: (value: ImageGenCount) => void;
}

export function CountSelect({ value, onChange }: CountSelectProps) {
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
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={NODE_TEXT_CONTROL_TRIGGER_CLASS}
      >
        <span>{value}张</span>
        <ChevronDown className="h-3 w-3 text-text-muted/90" />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className={NODE_COUNT_POPOVER_CLASS}
        >
          {IMAGE_GEN_COUNT_OPTIONS.map((option) => {
            const isActive = option === value;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`${NODE_COUNT_OPTION_BASE_CLASS} ${
                  isActive
                    ? IMAGE_PARAM_ACTIVE_BUTTON_CLASS
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {option}张
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
