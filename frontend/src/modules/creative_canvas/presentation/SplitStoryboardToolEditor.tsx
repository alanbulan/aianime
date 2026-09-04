// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { resolveImageDisplayUrl } from '../domain/imageData';
import {
  resolveImageSplitLayout,
  resolveImageSplitLineThicknessPx,
  resolveMaxAllowedLineThickness,
  type ImageSplitRect,
} from '../domain/toolImageGeometry';
import { UiInput } from '@/components/ui';
import type { VisualToolEditorProps } from './canvasToolEditorContracts';

const MIN_GRID_SIZE = 1;
const MAX_GRID_SIZE = 8;
const DEFAULT_LINE_THICKNESS_PERCENT = 0.5;
const MAX_LINE_THICKNESS_PERCENT = 20;
const LEGACY_DEFAULT_LINE_THICKNESS_PX = 6;
const SPLIT_RANGE_CLASS =
  'h-0.5 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-none [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary';

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return fallback;
}

function clampInteger(value: number, min: number, max: number, fallback = min): number {
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(safeValue)));
}

function clampDecimal(value: number, min: number, max: number, fallback = min, precision = 2): number {
  const safeValue = Number.isFinite(value) ? value : fallback;
  const clamped = Math.max(min, Math.min(max, safeValue));
  const factor = 10 ** precision;
  return Math.round(clamped * factor) / factor;
}

function splitSizeLabel(min: number, max: number): string {
  if (min === max) {
    return `${min}`;
  }
  return `${min} - ${max}`;
}

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function NumberStepper({ label, value, min, max, onChange }: NumberStepperProps) {
  const decreaseDisabled = value <= min;
  const increaseDisabled = value >= max;

  return (
    <div className="space-y-1.5">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="h-8 w-7 text-lg font-semibold leading-none text-text-dark/68 transition-colors hover:text-text-dark disabled:cursor-not-allowed disabled:opacity-35"
          onClick={() => onChange(value - 1)}
          disabled={decreaseDisabled}
        >
          -
        </button>
        <UiInput
          type="number"
          value={value}
          min={min}
          max={max}
          step={1}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-8 rounded-[8px] border-border bg-muted text-center"
        />
        <button
          type="button"
          className="h-8 w-7 text-lg font-semibold leading-none text-text-dark/68 transition-colors hover:text-text-dark disabled:cursor-not-allowed disabled:opacity-35"
          onClick={() => onChange(value + 1)}
          disabled={increaseDisabled}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function SplitStoryboardToolEditor({ sourceImageUrl, options, onOptionsChange }: VisualToolEditorProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const [loadedImage, setLoadedImage] = useState<{
    sourceImageUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [previewAreaSize, setPreviewAreaSize] = useState<{ width: number; height: number } | null>(null);
  const displaySourceImageUrl = useMemo(() => resolveImageDisplayUrl(sourceImageUrl), [sourceImageUrl]);
  const naturalSize = loadedImage?.sourceImageUrl === displaySourceImageUrl
    ? loadedImage
    : null;

  useEffect(() => {
    const previewArea = previewAreaRef.current;
    if (!previewArea) {
      return;
    }

    const updatePreviewAreaSize = () => {
      const rect = previewArea.getBoundingClientRect();
      setPreviewAreaSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
    };

    updatePreviewAreaSize();
    const observer = new ResizeObserver(updatePreviewAreaSize);
    observer.observe(previewArea);
    return () => observer.disconnect();
  }, []);

  const rows = clampInteger(toFiniteNumber(options.rows, 3), MIN_GRID_SIZE, MAX_GRID_SIZE);
  const cols = clampInteger(toFiniteNumber(options.cols, 3), MIN_GRID_SIZE, MAX_GRID_SIZE);

  const legacyLineThicknessPx = Math.max(0, toFiniteNumber(options.lineThickness, LEGACY_DEFAULT_LINE_THICKNESS_PX));
  const maxLineThicknessPercent = useMemo(() => {
    if (!naturalSize) {
      return MAX_LINE_THICKNESS_PERCENT;
    }

    const maxLinePx = resolveMaxAllowedLineThickness(
      naturalSize.width,
      naturalSize.height,
      rows,
      cols,
    );
    const basis = Math.max(1, Math.min(naturalSize.width, naturalSize.height));
    return clampDecimal((maxLinePx / basis) * 100, 0, MAX_LINE_THICKNESS_PERCENT);
  }, [cols, naturalSize, rows]);

  const fallbackLineThicknessPercent = useMemo(() => {
    if (!naturalSize) {
      return DEFAULT_LINE_THICKNESS_PERCENT;
    }

    const basis = Math.max(1, Math.min(naturalSize.width, naturalSize.height));
    return clampDecimal(
      (legacyLineThicknessPx / basis) * 100,
      0,
      maxLineThicknessPercent,
      DEFAULT_LINE_THICKNESS_PERCENT
    );
  }, [legacyLineThicknessPx, maxLineThicknessPercent, naturalSize]);

  const rawLineThicknessPercent = Math.max(
    0,
    toFiniteNumber(options.lineThicknessPercent, fallbackLineThicknessPercent)
  );
  const lineThicknessPercent = clampDecimal(
    rawLineThicknessPercent,
    0,
    maxLineThicknessPercent,
    fallbackLineThicknessPercent
  );

  const lineThicknessPx = useMemo(() => {
    if (!naturalSize) {
      return 0;
    }

    return resolveImageSplitLineThicknessPx(
      naturalSize.width,
      naturalSize.height,
      rows,
      cols,
      lineThicknessPercent,
    );
  }, [cols, lineThicknessPercent, naturalSize, rows]);

  const layout = useMemo(() => {
    if (!naturalSize) {
      return null;
    }

    return resolveImageSplitLayout(
      naturalSize.width,
      naturalSize.height,
      rows,
      cols,
      lineThicknessPx
    );
  }, [cols, lineThicknessPx, naturalSize, rows]);

  const displaySize = useMemo(() => {
    if (!naturalSize || !previewAreaSize) {
      return null;
    }

    const scale = Math.min(
      previewAreaSize.width / naturalSize.width,
      previewAreaSize.height / naturalSize.height,
      1
    );

    return {
      width: Math.max(1, Math.round(naturalSize.width * scale)),
      height: Math.max(1, Math.round(naturalSize.height * scale)),
    };
  }, [naturalSize, previewAreaSize]);

  const toCellStyle = useCallback(
    (rect: ImageSplitRect): CSSProperties => {
      if (!naturalSize || !displaySize) {
        return {};
      }

      return {
        left: (rect.x / naturalSize.width) * displaySize.width,
        top: (rect.y / naturalSize.height) * displaySize.height,
        width: (rect.width / naturalSize.width) * displaySize.width,
        height: (rect.height / naturalSize.height) * displaySize.height,
      };
    },
    [displaySize, naturalSize]
  );

  const toLineStyle = useCallback(
    (rect: ImageSplitRect): CSSProperties => {
      if (!naturalSize || !displaySize) {
        return {};
      }

      const isVerticalLine = rect.height > rect.width;
      return {
        left: (rect.x / naturalSize.width) * displaySize.width,
        top: (rect.y / naturalSize.height) * displaySize.height,
        width: isVerticalLine
          ? Math.max(2, (rect.width / naturalSize.width) * displaySize.width)
          : (rect.width / naturalSize.width) * displaySize.width,
        height: isVerticalLine
          ? (rect.height / naturalSize.height) * displaySize.height
          : Math.max(2, (rect.height / naturalSize.height) * displaySize.height),
      };
    },
    [displaySize, naturalSize]
  );

  const updateOptions = useCallback(
    (patch: Partial<Record<'rows' | 'cols' | 'lineThicknessPercent', number>>) => {
      const nextRows = clampInteger(
        patch.rows ?? rows,
        MIN_GRID_SIZE,
        MAX_GRID_SIZE
      );
      const nextCols = clampInteger(
        patch.cols ?? cols,
        MIN_GRID_SIZE,
        MAX_GRID_SIZE
      );

      const unresolvedLineThicknessPercent = Math.max(
        0,
        patch.lineThicknessPercent ?? lineThicknessPercent
      );

      const nextMaxLineThicknessPercent = naturalSize
        ? clampDecimal(
            (resolveMaxAllowedLineThickness(
              naturalSize.width,
              naturalSize.height,
              nextRows,
              nextCols,
            ) /
              Math.max(1, Math.min(naturalSize.width, naturalSize.height))) *
              100,
            0,
            MAX_LINE_THICKNESS_PERCENT
          )
        : MAX_LINE_THICKNESS_PERCENT;

      const nextLineThicknessPercent = clampDecimal(
        unresolvedLineThicknessPercent,
        0,
        nextMaxLineThicknessPercent
      );

      onOptionsChange({
        ...options,
        rows: nextRows,
        cols: nextCols,
        lineThicknessPercent: nextLineThicknessPercent,
      });
    },
    [cols, lineThicknessPercent, naturalSize, onOptionsChange, options, rows]
  );

  const hasLayoutError = Boolean(naturalSize && !layout);

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-h-0">
        <div
          className="relative flex h-full min-h-[420px] items-center justify-center overflow-hidden rounded-[10px] border border-border bg-media p-3"
        >
          <div ref={previewAreaRef} className="relative flex h-full w-full items-center justify-center">
            <div
              className="relative"
              style={displaySize ? { width: displaySize.width, height: displaySize.height } : undefined}
            >
              <img
                ref={imageRef}
                src={displaySourceImageUrl}
                alt="split-preview"
                className={
                  displaySize
                    ? 'block h-full w-full rounded-lg border border-media-foreground/10 object-contain'
                    : 'block max-h-full max-w-full rounded-lg border border-media-foreground/10 object-contain'
                }
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setLoadedImage({
                    sourceImageUrl: displaySourceImageUrl,
                    width: Math.max(1, target.naturalWidth),
                    height: Math.max(1, target.naturalHeight),
                  });
                }}
              />

              {naturalSize && layout && displaySize && (
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
                  style={{
                    width: displaySize.width,
                    height: displaySize.height,
                  }}
                >
                  {layout.lineRects.map((rect, index) => (
                    <div
                      key={`line-${index}`}
                      className="absolute bg-red-400/70"
                      style={toLineStyle(rect)}
                    />
                  ))}

                  {layout.cellRects.map((cell, index) => (
                    <div
                      key={`cell-${index}`}
                      className="absolute border border-media-foreground/55"
                      style={toCellStyle(cell)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="h-full space-y-4 rounded-[10px] border border-border bg-card p-3.5">
        <div className="text-sm font-medium text-text-dark">分格参数</div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <NumberStepper
            label="行数"
            value={rows}
            min={MIN_GRID_SIZE}
            max={MAX_GRID_SIZE}
            onChange={(value) => updateOptions({ rows: value })}
          />
          <NumberStepper
            label="列数"
            value={cols}
            min={MIN_GRID_SIZE}
            max={MAX_GRID_SIZE}
            onChange={(value) => updateOptions({ cols: value })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>分隔线粗细</span>
            <span>
              {formatPercent(lineThicknessPercent)}
              {naturalSize ? ` (${lineThicknessPx}px)` : ''}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, maxLineThicknessPercent)}
            step={0.1}
            value={lineThicknessPercent}
            onChange={(event) => updateOptions({ lineThicknessPercent: Number(event.target.value) })}
            className={SPLIT_RANGE_CLASS}
            style={{
              background: `linear-gradient(to right, rgb(var(--accent-rgb)) 0%, rgb(var(--accent-rgb)) ${
                maxLineThicknessPercent > 0
                  ? (lineThicknessPercent / maxLineThicknessPercent) * 100
                  : 0
              }%, rgb(var(--text-rgb) / 0.24) ${
                maxLineThicknessPercent > 0
                  ? (lineThicknessPercent / maxLineThicknessPercent) * 100
                  : 0
              }%, rgb(var(--text-rgb) / 0.24) 100%)`,
            }}
          />
          <UiInput
            type="number"
            value={lineThicknessPercent}
            min={0}
            max={Math.max(0, maxLineThicknessPercent)}
            step={0.1}
            onChange={(event) => updateOptions({ lineThicknessPercent: Number(event.target.value) })}
            className="h-8 rounded-[8px] border-border bg-muted"
          />
        </div>

        <div className="rounded-[8px] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>输出小格数量</span>
            <span className="font-medium text-text-dark">{rows * cols}</span>
          </div>
          {layout && (
            <>
              <div className="mt-1 flex items-center justify-between">
                <span>单格宽度(px)</span>
                <span>{splitSizeLabel(layout.minCellWidth, layout.maxCellWidth)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>单格高度(px)</span>
                <span>{splitSizeLabel(layout.minCellHeight, layout.maxCellHeight)}</span>
              </div>
            </>
          )}
        </div>

        {hasLayoutError && (
          <div className="rounded-[8px] border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            当前分隔线过粗，导致可抽取区域不足。请减少线宽或降低行列数。
          </div>
        )}
      </div>
    </div>
  );
}
