// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import {
  NODE_FLOATING_PANEL_SURFACE_CLASS,
  type CameraMovementPreset,
  resolveCameraPresetVideoUrl,
} from '@/modules/creative_canvas/public';

const CAMERA_MOVEMENT_PANEL_CLASS =
  `nodrag nowheel flex w-[640px] flex-col ${NODE_FLOATING_PANEL_SURFACE_CLASS}`;

interface CameraMovementPickerPopoverProps {
  templates: ReadonlyArray<CameraMovementPreset>;
  isLoading: boolean;
  selectedId: string | null;
  onConfirm: (id: string | null) => void;
  onClose: () => void;
}

export function CameraMovementPickerPopover({
  templates,
  isLoading,
  selectedId,
  onConfirm,
  onClose,
}: CameraMovementPickerPopoverProps) {
  const [draftId, setDraftId] = useState<string | null>(selectedId);

  return (
    <div
      className={CAMERA_MOVEMENT_PANEL_CLASS}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex h-10 items-center justify-between px-4">
        <span className="text-sm font-medium text-foreground">运镜</span>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="关闭"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-[12px] text-muted-foreground">
          {isLoading ? '加载中…' : '暂无可用运镜模板'}
        </div>
      ) : (
        <div className="ui-scrollbar grid max-h-[420px] grid-cols-4 gap-3 overflow-y-auto px-4 pb-4 pt-2">
          {templates.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={draftId === preset.id}
              onSelect={() => setDraftId(preset.id)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-1">
        <button
          type="button"
          onClick={() => onConfirm(null)}
          className="h-8 rounded-md px-3 text-[12px] font-medium text-foreground/78 transition-colors hover:bg-muted hover:text-foreground"
        >
          清除
        </button>
        <button
          type="button"
          onClick={() => onConfirm(draftId)}
          disabled={!draftId}
          className="h-8 min-w-[50px] rounded-md bg-primary px-3 text-[13px] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          使用
        </button>
      </div>
    </div>
  );
}

interface PresetCardProps {
  preset: CameraMovementPreset;
  isSelected: boolean;
  onSelect: () => void;
}

function PresetCard({ preset, isSelected, onSelect }: PresetCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const videoSrc = resolveCameraPresetVideoUrl(preset);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isHovering) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
      try {
        el.currentTime = 0;
      } catch {
        // ignored
      }
    }
  }, [isHovering]);

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      className={`group/card relative flex flex-col overflow-hidden rounded-[8px] border text-left transition-colors ${
        isSelected
          ? 'border-primary bg-primary/10 shadow-lg ring-1 ring-primary/45'
          : 'border-border bg-card hover:border-foreground/25 hover:bg-muted'
      }`}
    >
      {isSelected ? (
        <span className="pointer-events-none absolute right-2 top-2 z-10 h-2 w-2 rounded-full bg-primary shadow-md" />
      ) : null}
      <div className="relative aspect-video w-full overflow-hidden bg-media">
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] text-media-foreground/65">
            无预览
          </div>
        )}
      </div>
      <div className={`flex h-7 items-center justify-center px-2 text-[12px] ${isSelected ? 'text-primary' : 'text-foreground'}`}>
        {preset.label}
      </div>
    </button>
  );
}
