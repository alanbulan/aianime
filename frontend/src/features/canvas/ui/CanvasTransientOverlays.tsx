// Copyright (c) 2026 AI anime
import { MousePointerClick, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface CanvasOverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface CanvasPlacementPreview extends CanvasOverlayRect {
  label: string;
}

interface CanvasConnectionPreview extends CanvasOverlayRect {
  d: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'butt' | 'round' | 'square';
}

export interface CanvasTransientOverlaysProps {
  isCanvasEmpty: boolean;
  marqueeSelectionRect: CanvasOverlayRect | null;
  nodePlacementPreview: CanvasPlacementPreview | null;
  isCanvasDropActive: boolean;
}

export interface CanvasConnectionPreviewOverlayProps {
  preview: CanvasConnectionPreview | null;
}

export function CanvasTransientOverlays({
  isCanvasEmpty,
  marqueeSelectionRect,
  nodePlacementPreview,
  isCanvasDropActive,
}: CanvasTransientOverlaysProps) {
  const { t } = useTranslation();

  return (
    <>
      {marqueeSelectionRect && (
        <div
          data-testid="canvas-marquee-selection"
          className="pointer-events-none absolute z-[130] rounded-md border border-dashed border-foreground/55 bg-foreground/[0.04]"
          style={marqueeSelectionRect}
        />
      )}

      {nodePlacementPreview && (
        <div
          data-testid="canvas-node-placement-preview"
          className="pointer-events-none absolute z-[135] select-none rounded-2xl border border-primary/45 bg-popover/90 shadow-xl backdrop-blur-md"
          style={{
            left: nodePlacementPreview.left,
            top: nodePlacementPreview.top,
            width: nodePlacementPreview.width,
            height: nodePlacementPreview.height,
          }}
        >
          <div className="absolute inset-0 rounded-2xl bg-primary/10" />
          <div className="relative flex h-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium leading-5 text-popover-foreground/90">
                  {nodePlacementPreview.label}
                </div>
                <div className="mt-1 text-[12px] leading-4 text-muted-foreground">
                  {t('canvas.nodePlacement.previewHint')}
                </div>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MousePointerClick className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] leading-4 text-muted-foreground/80">
              <span>{t('canvas.nodePlacement.confirmHint')}</span>
              <span>{t('canvas.nodePlacement.cancelHint')}</span>
            </div>
          </div>
        </div>
      )}

      {isCanvasEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-muted-foreground shadow-sm">
            <MousePointerClick
              className="h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm">
              {t('canvas.emptyHintBeforeTab')}
              <span className="text-primary">Tab</span>
              {t('canvas.emptyHintAfterTab')}
            </span>
          </div>
        </div>
      )}

      {isCanvasDropActive && (
        <div
          data-testid="canvas-drop-overlay"
          className="pointer-events-none absolute inset-0 z-[120] flex items-center justify-center"
        >
          <div className="absolute inset-3 rounded-2xl border-2 border-dashed border-primary/70 bg-primary/[0.06]" />
          <div className="relative flex flex-col items-center gap-3 rounded-2xl bg-surface-dark/90 px-8 py-6 text-center shadow-2xl ring-1 ring-border">
            <Upload className="h-8 w-8 text-primary" />
            <div className="text-sm font-medium text-text-dark">
              释放以添加到画布
            </div>
            <div className="text-xs text-text-muted">
              支持图片、视频、音频，自动生成对应节点
            </div>
          </div>
        </div>
      )}

    </>
  );
}

export function CanvasConnectionPreviewOverlay({
  preview,
}: CanvasConnectionPreviewOverlayProps) {
  if (!preview) {
    return null;
  }
  return (
    <svg
      data-testid="canvas-connection-preview"
      className="pointer-events-none absolute z-40 overflow-visible"
      style={{
        left: preview.left,
        top: preview.top,
        width: preview.width,
        height: preview.height,
      }}
      width={preview.width}
      height={preview.height}
    >
      <path
        className="pointer-events-none"
        d={preview.d}
        fill="none"
        stroke={preview.stroke}
        strokeWidth={preview.strokeWidth}
        strokeLinecap={preview.strokeLinecap}
      />
    </svg>
  );
}
