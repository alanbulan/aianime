// Copyright (c) 2026 AI anime
import { TaskProgress } from '@/components/task-progress';
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Accessibility,
  Crop,
  Download,
  ExternalLink,
  ImageIcon,
  Loader2,
  Package,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MEDIA_PRIMARY_ACTION_BUTTON_CLASS,
  MEDIA_THUMB_DELETE_CLASS,
  MEDIA_THUMB_ACTIVE_CLASS,
  MEDIA_THUMB_ACTIVE_MARK_CLASS,
  MEDIA_THUMB_CLASS,
  MEDIA_THUMB_IDLE_CLASS,
  MEDIA_THUMB_MODEL_CLASS,
  MEDIA_THUMB_NEW_CLASS,
  MEDIA_THUMB_TIME_CLASS,
} from "@/modules/production/presentation/media-styles";
import { GLASS_DIALOG_CONTENT_CLASS } from "@/lib/dialog-styles";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import type { SketchSectionController } from "@/modules/production/application/use-sketch-section-controller";

const SKETCH_GRID_CLASS =
  "grid grid-cols-[auto_minmax(260px,1fr)] items-start gap-x-4 gap-y-3";
const SKETCH_PREVIEW_CLASS =
  "flex h-[220px] w-auto max-w-full justify-self-start cursor-zoom-in items-center justify-center overflow-hidden rounded-[10px] border border-border bg-card transition-[border-color,background-color,opacity] hover:border-foreground/25 hover:bg-muted hover:opacity-95";
const SKETCH_PREVIEW_IMAGE_CLASS = "h-full w-full object-cover";
const SKETCH_EMPTY_CLASS =
  "flex h-[220px] w-auto max-w-full justify-self-start items-center justify-center rounded-[10px] border border-dashed border-border bg-muted text-xs text-muted-foreground";
const SKETCH_CANDIDATES_CLASS =
  "flex max-h-[220px] flex-wrap content-start gap-2 overflow-y-auto pr-1";
const BACKGROUND_ANCHOR_PREVIEW_ASPECT = "16 / 9";
const BACKGROUND_ANCHOR_LABEL_KEYS: Record<string, string> = {
  director_env_only:
    "episode.workbench.render.backgroundAnchorLabels.directorEnvOnly",
  master: "episode.workbench.render.backgroundAnchorLabels.master",
  reverse: "episode.workbench.render.backgroundAnchorLabels.reverse",
  selected_background:
    "episode.workbench.sketch.backgroundAnchorLabels.selectedBackground",
};

export interface SketchSectionViewProps {
  controller: SketchSectionController;
  extraDialogs: ReactNode;
  onPreview?(url: string): void;
}

export function SketchSectionView({
  controller,
  extraDialogs,
  onPreview,
}: SketchSectionViewProps) {
  const { t } = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const {
    backgroundAnchors,
    backgroundDialogOpen,
    backgroundLoading,
    backgroundSaving,
    backgroundSceneId,
    beatNumber,
    candidates,
    castedEntries,
    directorControlUrl,
    directorConvertPending,
    directorTask,
    directorWorldPending,
    downloadEnabled,
    editable,
    freezonePending,
    hasSketch,
    markedPropEntries,
    poolDeletePending,
    poolSelectPending,
    previewUrl,
    propEntries,
    regenConfirmOpen,
    regenPending,
    regenTask,
    sketchActive,
    sketchAspectRatio,
    sketchTask,
    stalePromptOpen,
    uploadPending,
    onBackgroundDialogOpenChange,
    onChooseBackground,
    onConfirmRegen,
    onConvertDirectorControl,
    onDownload,
    onForceStale,
    onNavigateToAsset,
    onOpenBackgroundDialog,
    onOpenDirectorWorld,
    onOpenFreezone,
    onOpenSketchTool,
    onDelete,
    onRegenConfirmOpenChange,
    onRequestRegen,
    onSelect,
    onStalePromptOpenChange,
    onStopDirectorTask,
    onStopRegenTask,
    onUpload,
  } = controller;
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );

  return (
    <div className={SKETCH_GRID_CLASS}>
      {(castedEntries.length > 0 ||
        propEntries.length > 0 ||
        markedPropEntries.length > 0) && (
        <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
          {castedEntries.map((entry) => (
            <button
              key={entry.identityId}
              type="button"
              onClick={() => onNavigateToAsset("identity", entry.identityId)}
              className="inline-flex h-5 max-w-[180px] items-center gap-1 rounded-full border border-border bg-muted px-1.5 text-[11px] leading-none transition-colors hover:border-primary/45 hover:bg-primary/[0.07]"
              data-ui-tooltip={`${entry.character}${entry.identity ? ` · ${entry.identity}` : ""}`}
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.hex }}
              />
              <span className="truncate text-foreground/78">
                {entry.character}
                {entry.identity && (
                  <>
                    {" · "}
                    <span className="text-muted-foreground/72">
                      {entry.identity}
                    </span>
                  </>
                )}
              </span>
            </button>
          ))}
          {propEntries.map((prop) => (
            <button
              key={prop.propId}
              type="button"
              onClick={() => onNavigateToAsset("prop", prop.propId)}
              className="inline-flex h-5 max-w-[180px] items-center gap-1 rounded-full border border-border bg-muted px-1.5 text-[11px] leading-none transition-colors hover:border-primary/45 hover:bg-primary/[0.07]"
              data-ui-tooltip={prop.propId}
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: prop.hex ?? undefined }}
              />
              <span className="truncate text-muted-foreground/72">
                {prop.propId}
              </span>
            </button>
          ))}
          {markedPropEntries.map((propId) => (
            <button
              key={propId}
              type="button"
              onClick={() => onNavigateToAsset("prop", propId)}
              className="inline-flex h-5 max-w-[180px] items-center gap-1 rounded-full border border-border bg-muted px-1.5 text-[11px] leading-none transition-colors hover:border-primary/45 hover:bg-primary/[0.07]"
              data-ui-tooltip={propId}
            >
              <Package
                aria-hidden
                className="size-2.5 shrink-0 text-muted-foreground/70"
              />
              <span className="truncate text-muted-foreground/72">
                {propId}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="relative justify-self-start">
        {previewUrl ? (
          <button
            type="button"
            onClick={() => {
              const safe = resolveMediaUrl(previewUrl);
              if (safe) onPreview?.(safe);
            }}
            className={SKETCH_PREVIEW_CLASS}
            style={{ aspectRatio: sketchAspectRatio }}
          >
            <img
              src={resolveMediaUrl(previewUrl) ?? ""}
              alt={`Beat ${beatNumber} sketch`}
              className={SKETCH_PREVIEW_IMAGE_CLASS}
              loading="lazy"
              decoding="async"
            />
          </button>
        ) : (
          <div
            className={SKETCH_EMPTY_CLASS}
            style={{ aspectRatio: sketchAspectRatio }}
          >
            {t("episode.beat.noSketch")}
          </div>
        )}
        {sketchActive && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[10px] bg-media/55 backdrop-blur-[1px]"
          >
            <Loader2
              aria-hidden
              className="size-5 animate-spin text-media-foreground/90"
            />
            <TaskProgress task={sketchTask} className="w-4/5 max-w-52 [&>span]:justify-center [&>span]:text-media-foreground" aria-label={t('episode.workbench.sketch.generating')} />
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-2.5">
        {directorControlUrl && (
          <div className="flex items-center gap-2 rounded-[8px] border border-border bg-muted p-2">
            <button
              type="button"
              onClick={() => onPreview?.(directorControlUrl)}
              className="h-14 w-14 shrink-0 overflow-hidden rounded-[6px] border border-media-foreground/10 bg-media/30"
            >
              <img
                src={directorControlUrl}
                alt={`Beat ${beatNumber} Director World control frame`}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-primary">
                {t("episode.workbench.sketch.directorControl")}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {t("episode.workbench.sketch.directorControlFile")}
              </div>
            </div>
            {directorTask.started ? (
              <Button
                size="xs"
                variant="outline"
                onClick={onStopDirectorTask}
                disabled={directorTask.stopping}
                className="gap-1"
              >
                {directorTask.stopping ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Square className="size-3" />
                )}
                {t("common.stop")}
              </Button>
            ) : (
              <Button
                size="xs"
                variant="outline"
                onClick={onConvertDirectorControl}
                disabled={directorConvertPending}
                className="gap-1"
              >
                {directorConvertPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                {t("episode.workbench.sketch.convertDirectorControl")}
              </Button>
            )}
          </div>
        )}
        {candidates.length > 0 && (
          <div className={SKETCH_CANDIDATES_CLASS}>
            {candidates.map((candidate) => (
              <div key={candidate.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(candidate.id)}
                  disabled={poolSelectPending || poolDeletePending}
                  className={cn(
                    MEDIA_THUMB_CLASS,
                    candidate.isActive
                      ? MEDIA_THUMB_ACTIVE_CLASS
                      : MEDIA_THUMB_IDLE_CLASS,
                  )}
                >
                  <div
                    className="h-[76px]"
                    style={{ aspectRatio: sketchAspectRatio }}
                  >
                    {candidate.src !== null && (
                      <img
                        src={candidate.src}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                  </div>
                  <span
                    className={MEDIA_THUMB_MODEL_CLASS}
                    data-ui-tooltip={candidate.modelTooltip}
                  >
                    {candidate.modelLabel}
                  </span>
                  {candidate.isNew && (
                    <span className={MEDIA_THUMB_NEW_CLASS}>
                      {t("common.new")}
                    </span>
                  )}
                  {candidate.timeLabel && (
                    <span
                      className={MEDIA_THUMB_TIME_CLASS}
                      data-ui-tooltip={candidate.timeTooltip ?? undefined}
                    >
                      {candidate.timeLabel}
                    </span>
                  )}
                  {candidate.isActive && (
                    <span className={MEDIA_THUMB_ACTIVE_MARK_CLASS}>✓</span>
                  )}
                </button>
                {!candidate.isActive && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="destructive"
                    disabled={poolDeletePending}
                    onClick={() => setDeleteCandidateId(candidate.id)}
                    aria-label={t("episode.workbench.media.deleteCandidate")}
                    data-ui-tooltip={t(
                      "episode.workbench.media.deleteCandidate",
                    )}
                    className={MEDIA_THUMB_DELETE_CLASS}
                  >
                    <Trash2 className="size-2.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        <div className="flex items-center gap-1.5">
          {regenTask.started ? (
            <Button
              size="xs"
              variant="outline"
              onClick={onStopRegenTask}
              disabled={regenTask.stopping}
              className={MEDIA_PRIMARY_ACTION_BUTTON_CLASS}
            >
              {regenTask.stopping ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Square className="size-3" />
              )}
              {t("common.stop")}
            </Button>
          ) : (
            <Button
              size="xs"
              variant="outline"
              onClick={onRequestRegen}
              disabled={regenPending}
              className={MEDIA_PRIMARY_ACTION_BUTTON_CLASS}
            >
              {regenPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {hasSketch
                ? t("common.regenerate")
                : t("common.generateNew")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onOpenSketchTool("pose")}
            disabled={poolSelectPending || !editable || sketchActive}
            className="gap-1"
            data-ui-tooltip={t("episode.workbench.sketch.poseEdit")}
          >
            <Accessibility className="size-3" />
            {t("episode.workbench.sketch.poseEdit")}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => onOpenSketchTool("crop")}
            disabled={poolSelectPending || !editable}
            className="gap-1"
            data-ui-tooltip={t("episode.workbench.sketch.cropEdit")}
          >
            <Crop className="size-3" />
            {t("episode.workbench.sketch.cropEdit")}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={onOpenBackgroundDialog}
            disabled={backgroundLoading}
            className="gap-1"
            data-ui-tooltip={t("episode.workbench.sketch.chooseBackgroundTip")}
          >
            <ImageIcon className="size-3" />
            {t("episode.workbench.sketch.chooseBackground")}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={onDownload}
            disabled={!downloadEnabled}
            className="gap-1"
          >
            <Download className="size-3" />
            {t("common.download")}
          </Button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              onUpload(file);
            }}
          />
          <Button
            size="xs"
            variant="ghost"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploadPending}
            className="gap-1"
          >
            {uploadPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Upload className="size-3" />
            )}
            {t("common.upload")}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={onOpenDirectorWorld}
            disabled={directorWorldPending}
            className="gap-1"
            data-ui-tooltip={t("episode.workbench.sketch.openDirectorWorldTip")}
          >
            <Box className="size-3" />
            {t("episode.workbench.sketch.openDirectorWorld")}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={onOpenFreezone}
            disabled={freezonePending}
            className="gap-1"
            data-ui-tooltip={t("episode.workbench.sketch.openFreezoneTip")}
          >
            {freezonePending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <ExternalLink className="size-3" />
            )}
            {t("episode.workbench.sketch.openFreezone")}
          </Button>
        </div>
      </div>

      <Dialog
        open={backgroundDialogOpen}
        onOpenChange={onBackgroundDialogOpenChange}
      >
        <DialogContent
          className={cn(
            GLASS_DIALOG_CONTENT_CLASS,
            "max-h-[min(calc(100vh-2rem),820px)] max-w-[min(calc(100vw-2rem),960px)] overflow-y-auto p-7",
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {t("episode.workbench.sketch.backgroundDialogTitle", {
                n: beatNumber,
              })}
            </DialogTitle>
            <DialogDescription>
              {t("episode.workbench.sketch.backgroundDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted px-3 py-2.5">
            <div className="min-w-0 text-sm">
              <div className="text-xs text-muted-foreground">
                {t("episode.workbench.sketch.backgroundSceneLabel")}
              </div>
              <div className="truncate font-medium">
                {backgroundSceneId ||
                  t("episode.workbench.sketch.backgroundSceneMissing")}
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {backgroundAnchors.map((anchor) => (
              <div
                key={anchor.id}
                className={cn(
                  "rounded-lg border p-3",
                  anchor.current
                    ? "border-warning/70 bg-warning/10"
                    : "border-border bg-muted",
                )}
              >
                <div
                  className="overflow-hidden rounded-md border border-border bg-media/25"
                  style={{ aspectRatio: BACKGROUND_ANCHOR_PREVIEW_ASPECT }}
                >
                  {anchor.url ? (
                    <img
                      src={anchor.url}
                      alt={t(BACKGROUND_ANCHOR_LABEL_KEYS[anchor.id] ?? anchor.label)}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      {t("episode.workbench.sketch.backgroundMissing")}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {t(BACKGROUND_ANCHOR_LABEL_KEYS[anchor.id] ?? anchor.label)}
                    </div>
                    {anchor.current && (
                      <div className="text-[11px] text-warning">
                        {t("episode.workbench.sketch.backgroundCurrent")}
                      </div>
                    )}
                  </div>
                  <Button
                    size="xs"
                    variant={anchor.current ? "default" : "outline"}
                    disabled={!anchor.exists || backgroundSaving}
                    onClick={() => onChooseBackground(anchor.id)}
                  >
                    {anchor.snapshotToSelectedBackground
                      ? t("episode.workbench.sketch.backgroundSnapshotUse")
                      : t("common.use")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteCandidateId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidateId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("episode.workbench.media.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.workbench.media.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={poolDeletePending}
              onClick={() => {
                const poolId = deleteCandidateId;
                setDeleteCandidateId(null);
                if (poolId) void onDelete(poolId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={stalePromptOpen}
        onOpenChange={onStalePromptOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("episode.workbench.sketch.versionMismatch")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.workbench.sketch.versionMismatchDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onForceStale}>
              {t("common.forceUse")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={regenConfirmOpen}
        onOpenChange={onRegenConfirmOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {hasSketch
                ? t("episode.workbench.sketch.regenTitle")
                : t("episode.workbench.sketch.generateTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hasSketch
                ? t("episode.workbench.sketch.regenDesc", { n: beatNumber })
                : t("episode.workbench.sketch.generateDesc", {
                    n: beatNumber,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmRegen}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {extraDialogs}
    </div>
  );
}
