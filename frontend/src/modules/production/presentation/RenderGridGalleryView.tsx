// Copyright (c) 2026 AI anime
import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Scissors,
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
import type {
  RenderGridCardController,
  RenderGridGalleryController,
} from "@/modules/production/application/use-render-grid-gallery-controller";

const GRID_ACTION_BUTTON_CLASS =
  "justify-start gap-1 rounded-[5px] px-1 text-foreground/82 shadow-none transition-colors hover:bg-transparent hover:text-foreground disabled:text-muted-foreground/45";

export interface RenderGridGalleryViewProps {
  children: ReactNode;
  controller: RenderGridGalleryController;
}

export function RenderGridGalleryView({
  children,
  controller,
}: RenderGridGalleryViewProps) {
  const { t } = useTranslation();

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-background px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground">
          {t("episode.workbench.renderGrid.titleWithCount", {
            count: controller.gridCount,
          })}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={controller.rebuildPending}
            onClick={() => void controller.onRebuild()}
            className="h-6 gap-1 px-1.5 text-[10px]"
          >
            {controller.rebuildPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {t("episode.workbench.renderGrid.rebuildIndex")}
          </Button>
        </div>
      </div>
      {controller.gridCount === 0 ? (
        <p className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          {t("episode.workbench.renderGrid.noIndexedGrids")}
        </p>
      ) : (
        <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
          {children}
        </div>
      )}
    </section>
  );
}

export interface RenderGridCardViewProps {
  controller: RenderGridCardController;
}

export function RenderGridCardView({ controller }: RenderGridCardViewProps) {
  const { t } = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-2">
      <button
        type="button"
        disabled={!controller.gridUrl}
        onClick={() =>
          controller.gridUrl &&
          window.open(controller.gridUrl, "_blank", "noopener,noreferrer")
        }
        className="overflow-hidden rounded border border-border bg-media/20 disabled:cursor-default"
        style={{
          aspectRatio: gridAspectCss(
            controller.cols,
            controller.rows,
            controller.cellAspect,
          ),
        }}
      >
        {controller.gridUrl ? (
          <img
            src={controller.gridUrl}
            alt={t("episode.workbench.renderGrid.gridLabel", {
              n: controller.gridIndex,
            })}
            className="h-full w-full object-contain"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t("episode.workbench.renderGrid.noPreview")}
          </span>
        )}
      </button>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium">
            {t("episode.workbench.renderGrid.gridLabel", {
              n: controller.gridIndex,
            })}
          </span>
          <span className="text-muted-foreground">
            {controller.rows}x{controller.cols}
          </span>
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {t("episode.workbench.renderGrid.cellCount", {
            count: controller.cellCount,
          })}
          {" · B"}
          {formatBeatRange(controller.beatNumbers)}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {controller.regenerationStarted ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => void controller.onStopRegeneration()}
            disabled={controller.regenerationStopping}
            className={GRID_ACTION_BUTTON_CLASS}
          >
            {controller.regenerationStopping ? (
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
            onClick={() => void controller.onRegenerate()}
            disabled={controller.regenerationPending}
            className={GRID_ACTION_BUTTON_CLASS}
          >
            {controller.regenerationPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {t("common.regenerate")}
          </Button>
        )}
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          aria-label={t("episode.workbench.renderGrid.uploadGrid")}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void controller.onUpload(file);
          }}
        />
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => uploadInputRef.current?.click()}
          disabled={controller.uploadPending}
          className={GRID_ACTION_BUTTON_CLASS}
        >
          {controller.uploadPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Upload className="size-3" />
          )}
          {t("episode.workbench.renderGrid.uploadGrid")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => void controller.onExportPrompt()}
          disabled={controller.exportPromptPending}
          className={GRID_ACTION_BUTTON_CLASS}
        >
          {controller.exportPromptPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <FileText className="size-3" />
          )}
          {t("episode.workbench.renderGrid.exportPrompt")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => void controller.onCut()}
          disabled={controller.cutPending}
          className={GRID_ACTION_BUTTON_CLASS}
        >
          {controller.cutPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Scissors className="size-3" />
          )}
          {t("episode.workbench.renderGrid.cut")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={controller.onDownload}
          disabled={!controller.gridUrl}
          className={GRID_ACTION_BUTTON_CLASS}
        >
          <Download className="size-3" />
          {t("common.download")}
        </Button>
      </div>
      <Dialog
        open={controller.promptOpen}
        onOpenChange={controller.onPromptOpenChange}
      >
        <DialogContent className="max-w-[min(calc(100vw-2rem),760px)] sm:max-w-[min(calc(100vw-2rem),760px)]">
          <DialogHeader>
            <DialogTitle>
              {t("episode.workbench.renderGrid.promptTitle", {
                n: controller.gridIndex,
              })}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            aria-label={t("episode.workbench.renderGrid.promptContent")}
            value={controller.promptText}
            readOnly
            className="min-h-[260px] resize-y font-mono text-xs"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void controller.onCopyPrompt()}
              className="gap-1 transition-transform active:scale-95"
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
