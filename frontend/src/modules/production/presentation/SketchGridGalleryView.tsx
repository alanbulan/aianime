// Copyright (c) 2026 AI anime
import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Square,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { gridAspectCss } from "@/lib/aspect-ratio";
import { cn } from "@/lib/utils";
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";

const GRID_ACTION_BUTTON_CLASS =
  "justify-start gap-1 rounded-[5px] px-1 text-foreground/82 shadow-none transition-colors hover:bg-transparent hover:text-foreground disabled:text-muted-foreground/45";

export interface SketchGridGalleryViewProps {
  children: ReactNode;
  gridCount: number;
}

export function SketchGridGalleryView({
  children,
  gridCount,
}: SketchGridGalleryViewProps) {
  const { t } = useTranslation();

  if (gridCount === 0) return null;

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-background px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground">
          {t("episode.workbench.sketchGrid.titleWithCount", {
            count: gridCount,
          })}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {children}
        </div>
      </div>
    </section>
  );
}

export interface SketchGridFallbackCellViewModel {
  beatNumber: number;
  url: string | null;
}

export interface SketchGridCardViewProps {
  aspectRatio: SketchAspectRatio;
  beatNumbers: number[];
  cellCount: number;
  cols: number;
  exportPromptPending: boolean;
  fallbackCells: SketchGridFallbackCellViewModel[];
  generatedPreviewUrl: string | null;
  generationPending: boolean;
  generationStarted: boolean;
  generationStopping: boolean;
  gridIndex: number;
  gridUrl: string | null;
  promptOpen: boolean;
  promptText: string;
  rows: number;
  sceneId?: string;
  uploadPending: boolean;
  onCopyPrompt(): void | Promise<void>;
  onDownload(): void;
  onExportPrompt(): void | Promise<void>;
  onGenerate(): void | Promise<void>;
  onPromptOpenChange(open: boolean): void;
  onStopGeneration(): void | Promise<void>;
  onUpload(file: File): void | Promise<void>;
}

export function SketchGridCardView({
  aspectRatio,
  beatNumbers,
  cellCount,
  cols,
  exportPromptPending,
  fallbackCells,
  generatedPreviewUrl,
  generationPending,
  generationStarted,
  generationStopping,
  gridIndex,
  gridUrl,
  promptOpen,
  promptText,
  rows,
  sceneId,
  uploadPending,
  onCopyPrompt,
  onDownload,
  onExportPrompt,
  onGenerate,
  onPromptOpenChange,
  onStopGeneration,
  onUpload,
}: SketchGridCardViewProps) {
  const { t } = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const hasFallbackPreview = fallbackCells.some((cell) => cell.url);
  const hasPreview = Boolean(
    gridUrl || generatedPreviewUrl || hasFallbackPreview,
  );

  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-2">
      <button
        type="button"
        disabled={!hasPreview}
        onClick={() => {
          const url = gridUrl ?? generatedPreviewUrl;
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        }}
        className={cn(
          "overflow-hidden rounded bg-media/20 disabled:cursor-default",
          hasPreview && "border border-border",
        )}
        style={{ aspectRatio: gridAspectCss(cols, rows, aspectRatio) }}
      >
        {gridUrl ? (
          <img
            src={gridUrl}
            alt={t("episode.workbench.sketchGrid.gridLabel", {
              n: gridIndex,
            })}
            className="h-full w-full object-contain"
            loading="lazy"
            decoding="async"
          />
        ) : generatedPreviewUrl ? (
          <img
            src={generatedPreviewUrl}
            alt={t("episode.workbench.sketchGrid.gridLabel", {
              n: gridIndex,
            })}
            className="h-full w-full object-contain opacity-70"
            loading="lazy"
            decoding="async"
          />
        ) : hasFallbackPreview ? (
          <div
            className="grid h-full w-full gap-px bg-border"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
            aria-label={t("episode.workbench.sketchGrid.gridLabel", {
              n: gridIndex,
            })}
          >
            {Array.from({ length: rows * cols }, (_, index) => {
              const cell = fallbackCells[index];
              return (
                <div key={index} className="min-h-0 min-w-0 bg-background">
                  {cell?.url ? (
                    <img
                      src={cell.url}
                      alt=""
                      className="h-full w-full object-cover opacity-70"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t("episode.workbench.sketchGrid.noPreview")}
          </span>
        )}
      </button>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">
            {t("episode.workbench.sketchGrid.gridLabel", {
              n: gridIndex,
            })}
          </span>
          <span className="text-muted-foreground">
            {rows}x{cols}
          </span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {t("episode.workbench.sketchGrid.cellCount", {
            count: cellCount,
          })}
          {" · B"}
          {formatBeatRange(beatNumbers)}
        </p>
        {sceneId && (
          <p className="truncate text-[11px] text-muted-foreground">
            {sceneId}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {generationStarted ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => void onStopGeneration()}
            disabled={generationStopping}
            className={GRID_ACTION_BUTTON_CLASS}
          >
            {generationStopping ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Square className="size-3" />
            )}
            {t("common.stop")}
          </Button>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => void onGenerate()}
            disabled={generationPending}
            className={GRID_ACTION_BUTTON_CLASS}
          >
            {generationPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {t("episode.workbench.sketchGrid.generateGrid")}
          </Button>
        )}
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          aria-label={t("episode.workbench.sketchGrid.uploadGrid")}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void onUpload(file);
          }}
        />
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => uploadInputRef.current?.click()}
          disabled={uploadPending}
          className={GRID_ACTION_BUTTON_CLASS}
        >
          {uploadPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Upload className="size-3" />
          )}
          {t("episode.workbench.sketchGrid.uploadGrid")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => void onExportPrompt()}
          disabled={!gridUrl || exportPromptPending}
          className={GRID_ACTION_BUTTON_CLASS}
        >
          {exportPromptPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <FileText className="size-3" />
          )}
          {t("episode.workbench.sketchGrid.exportPrompt")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={onDownload}
          disabled={!gridUrl}
          className={GRID_ACTION_BUTTON_CLASS}
        >
          <Download className="size-3" />
          {t("common.download")}
        </Button>
      </div>
      <Dialog open={promptOpen} onOpenChange={onPromptOpenChange}>
        <DialogContent className="max-w-[min(calc(100vw-2rem),760px)] sm:max-w-[min(calc(100vw-2rem),760px)]">
          <DialogHeader>
            <DialogTitle>
              {t("episode.workbench.sketchGrid.promptTitle", {
                n: gridIndex,
              })}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            aria-label={t("episode.workbench.sketchGrid.promptContent")}
            value={promptText}
            readOnly
            className="min-h-[260px] resize-y font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onCopyPrompt()}
              className="gap-1 active:scale-95 transition-transform"
            >
              <Copy className="size-3" />
              {t("common.copy")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function formatBeatRange(beats: number[]): string {
  if (beats.length === 0) return "-";
  const sorted = [...new Set(beats)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const beat of sorted.slice(1)) {
    if (beat === previous + 1) {
      previous = beat;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = beat;
    previous = beat;
  }
  ranges.push(start === previous ? String(start) : `${start}-${previous}`);
  return ranges.join(",");
}
