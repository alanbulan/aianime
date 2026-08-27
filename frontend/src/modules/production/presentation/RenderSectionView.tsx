// Copyright (c) 2026 AI anime
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Crop,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  Loader2,
  RefreshCw,
  Square,
  SunMedium,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { CreditCostInline } from "@/components/credit-cost-inline";
import {
  CROP_DIALOG_SAVE_BUTTON_CLASS,
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  centerCropBoxForRatio,
  clampCropBox,
  cropBoxPercentStyle,
  zoomCropBox,
} from "@/shared/aspect-ratio";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import type {
  RenderBackgroundReferenceViewModel,
  RenderSectionController,
} from "@/modules/production/application/use-render-section-controller";

const CROP_SOURCE_ANCHORS = new Set([
  "master",
  "reverse",
  "director_env_only",
]);
const RENDER_GRID_CLASS =
  "grid grid-cols-[auto_minmax(260px,1fr)] items-start gap-x-4 gap-y-3";
const RENDER_PREVIEW_CLASS =
  "flex h-[220px] w-auto max-w-full justify-self-start cursor-zoom-in items-center justify-center overflow-hidden rounded-[10px] border border-border bg-card transition-[border-color,background-color,opacity] hover:border-foreground/25 hover:bg-muted hover:opacity-95";
const RENDER_PREVIEW_IMAGE_CLASS = "h-full w-full object-cover";
const RENDER_EMPTY_CLASS =
  "flex h-[220px] w-auto max-w-full justify-self-start items-center justify-center rounded-[10px] border border-dashed border-border bg-muted text-xs text-muted-foreground";
const RENDER_CANDIDATES_CLASS =
  "flex max-h-[220px] flex-wrap content-start gap-2 overflow-y-auto pr-1";
const RELIGHT_BADGE_CLASS =
  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium leading-none";
const RENDER_BACKGROUND_ANCHOR_LABEL_KEYS: Record<string, string> = {
  director_env_only:
    "episode.workbench.render.backgroundAnchorLabels.directorEnvOnly",
  master: "episode.workbench.render.backgroundAnchorLabels.master",
  reverse: "episode.workbench.render.backgroundAnchorLabels.reverse",
};

export interface RenderSectionViewProps {
  controller: RenderSectionController;
  extraDialogs: ReactNode;
  onPreview?(url: string): void;
}

export function RenderSectionView({
  controller,
  extraDialogs,
  onPreview,
}: RenderSectionViewProps) {
  const { t } = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const {
    background,
    beatNumber,
    candidates,
    downloadEnabled,
    freezonePending,
    poolDeletePending,
    poolSelectPending,
    previewUrl,
    regenConfirmOpen,
    regenPending,
    regenTaskStarted,
    regenTaskStopping,
    relight,
    renderActive,
    renderAspectRatio,
    renderPercent,
    renderRegenCostDisplay,
    stalePromptOpen,
    uploadPending,
    onConfirmRegen,
    onDownload,
    onDelete,
    onForceStale,
    onOpenFreezone,
    onRegenConfirmOpenChange,
    onRequestRegen,
    onSelect,
    onStalePromptOpenChange,
    onStopRegenTask,
    onUpload,
  } = controller;
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-[10px] border border-border bg-card p-3">
        <div className={RENDER_GRID_CLASS}>
          <div className="relative justify-self-start">
            {previewUrl ? (
              <button
                type="button"
                onClick={() => {
                  const safe = resolveMediaUrl(previewUrl);
                  if (safe) onPreview?.(safe);
                }}
                className={RENDER_PREVIEW_CLASS}
                style={{ aspectRatio: renderAspectRatio }}
              >
                <img
                  src={resolveMediaUrl(previewUrl) ?? ""}
                  alt={`Beat ${beatNumber} render`}
                  className={RENDER_PREVIEW_IMAGE_CLASS}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ) : (
              <div
                className={RENDER_EMPTY_CLASS}
                style={{ aspectRatio: renderAspectRatio }}
              >
                {t("episode.beat.noRender")}
              </div>
            )}
            {renderActive && (
              <div
                className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[10px] bg-media/55 backdrop-blur-[1px]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={renderPercent}
              >
                <Loader2
                  aria-hidden
                  className="size-5 animate-spin text-media-foreground/90"
                />
                <div className="flex items-baseline leading-none text-media-foreground">
                  <span className="text-2xl font-semibold tabular-nums tracking-tight">
                    {renderPercent}
                  </span>
                  <span className="ml-0.5 text-xs font-medium text-media-foreground/70">
                    %
                  </span>
                </div>
                <div className="h-1 w-24 overflow-hidden rounded-full bg-media-foreground/20">
                  <div
                    className="h-full rounded-full bg-media-foreground/85 transition-[width] duration-300 ease-out"
                    style={{ width: `${renderPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-2.5">
            {candidates.length > 0 && (
              <div className={RENDER_CANDIDATES_CLASS}>
                {candidates.map((candidate) => (
                  <div key={candidate.id} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => void onSelect(candidate.id)}
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
                        style={{ aspectRatio: renderAspectRatio }}
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
                        aria-label={t(
                          "episode.workbench.media.deleteCandidate",
                        )}
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
              {regenTaskStarted ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void onStopRegenTask()}
                  disabled={regenTaskStopping}
                  className={MEDIA_PRIMARY_ACTION_BUTTON_CLASS}
                >
                  {regenTaskStopping ? (
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
                  {previewUrl
                    ? t("common.regenerate")
                    : t("episode.workbench.render.generateNew")}
                  <CreditCostInline display={renderRegenCostDisplay} />
                </Button>
              )}
              {relight ? (
                <RenderRelightBadge
                  relight={relight.enabled}
                  timeOfDay={relight.timeOfDay}
                />
              ) : null}
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
                  void onUpload(file);
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
                onClick={() => void onOpenFreezone()}
                disabled={freezonePending}
                className="gap-1"
                data-ui-tooltip={t("episode.workbench.render.openFreezoneTip")}
              >
                {freezonePending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <ExternalLink className="size-3" />
                )}
                {t("episode.workbench.render.openFreezone")}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <RenderBackgroundReferencePanel {...background} />

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
              {t("episode.workbench.render.versionMismatch")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.workbench.render.versionMismatchDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onForceStale()}>
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
              {t("episode.workbench.render.regenTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.workbench.render.regenDesc", { n: beatNumber })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onConfirmRegen()}>
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {extraDialogs}
    </div>
  );
}

function RenderRelightBadge({
  relight,
  timeOfDay,
}: {
  relight: boolean;
  timeOfDay: string;
}) {
  if (relight) {
    const label = `Relight 到 ${timeOfDay.trim() || "指定时间"}`;
    return (
      <span
        data-ui-tooltip="Relight：按 beat 时间重新打光，不改变场景结构。"
        className={cn(
          RELIGHT_BADGE_CLASS,
          "border-warning/35 bg-warning/10 text-warning",
        )}
      >
        <SunMedium className="size-3.5" />
        {label}
      </span>
    );
  }
  return (
    <span
      data-ui-tooltip="锁图光：使用场景图自带光线，不重新打光。"
      className={cn(
        RELIGHT_BADGE_CLASS,
        "border-success/30 bg-success/10 text-success",
      )}
    >
      <Lock className="size-3.5" />
      锁图光
    </span>
  );
}

interface RenderBackgroundCropTarget {
  id: string;
  label: string;
  url: string | null;
  path?: string | null;
}

function RenderBackgroundReferencePanel({
  anchor,
  sourceId,
  reference,
  cropAspectLabel,
  cropAspectRatio,
  anchors,
  canChoose,
  loading,
  choosing,
  uploading,
  croppingAnchorId,
  onOpenDirectorWorld,
  onChoose,
  onCrop,
  onUpload,
}: RenderBackgroundReferenceViewModel) {
  const { t } = useTranslation();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);
  const cropBoxRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    crop: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [cropTarget, setCropTarget] =
    useState<RenderBackgroundCropTarget | null>(null);
  const [cropNaturalSize, setCropNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cropBox, setCropBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const currentSrc = reference?.url
    ? resolveMediaUrl(reference.url)
    : anchor?.url
      ? resolveMediaUrl(anchor.url)
      : null;
  const activeAnchorId = sourceId ?? reference?.id ?? anchor?.id ?? "";
  const disabled = loading || !canChoose;
  const formatAnchorLabel = (
    item: { id?: string | null; label?: string | null } | null | undefined,
  ) => {
    const fallback = item?.label ?? item?.id ?? "";
    const labelKey = item?.id
      ? RENDER_BACKGROUND_ANCHOR_LABEL_KEYS[item.id]
      : undefined;
    return labelKey ? t(labelKey, { defaultValue: fallback }) : fallback;
  };
  const currentLabel = formatAnchorLabel(
    reference ?? anchor ?? { id: "master", label: "master" },
  );
  const sourceAnchors = anchors.filter(
    (item) => item.id !== "selected_background",
  );
  const cropTargetSrc = cropTarget?.url
    ? resolveMediaUrl(cropTarget.url)
    : null;
  const cropPending = cropTarget
    ? croppingAnchorId === cropTarget.id
    : false;
  const cropTitle = cropTarget
    ? t("episode.workbench.render.backgroundCropTitle", {
        label: cropTarget.label,
      })
    : t("episode.workbench.render.backgroundCropFallbackTitle");
  const canOpenDirectorWorld = Boolean(onOpenDirectorWorld);

  useEffect(() => {
    const cropBoxElement = cropBoxRef.current;
    if (!cropBoxElement || !cropNaturalSize || !cropTarget) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setCropBox((current) =>
        current
          ? zoomCropBox(
              current,
              cropNaturalSize.width,
              cropNaturalSize.height,
              event.deltaY < 0 ? 0.9 : 1.1,
            )
          : current,
      );
    };

    cropBoxElement.addEventListener("wheel", handleWheel, { passive: false });
    return () => cropBoxElement.removeEventListener("wheel", handleWheel);
  }, [cropNaturalSize, cropTarget]);

  const closeCropDialog = () => {
    setCropTarget(null);
    setCropNaturalSize(null);
    setCropBox(null);
    cropDragRef.current = null;
  };

  const saveCropTarget = () => {
    if (!cropTarget) return;
    void onCrop(
      cropTarget.id,
      cropBox ??
        centerCropBoxForRatio(
          cropNaturalSize?.width ?? 0,
          cropNaturalSize?.height ?? 0,
          cropAspectRatio,
        ),
    );
    closeCropDialog();
  };

  const moveCropBox = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropDragRef.current || !cropNaturalSize || !cropImageRef.current) {
      return;
    }
    const imageRect = cropImageRef.current.getBoundingClientRect();
    if (imageRect.width <= 0 || imageRect.height <= 0) return;
    const scaleX = cropNaturalSize.width / imageRect.width;
    const scaleY = cropNaturalSize.height / imageRect.height;
    const drag = cropDragRef.current;
    const nextCrop = {
      ...drag.crop,
      x: drag.crop.x + (event.clientX - drag.clientX) * scaleX,
      y: drag.crop.y + (event.clientY - drag.clientY) * scaleY,
    };
    setCropBox(
      clampCropBox(
        nextCrop,
        cropNaturalSize.width,
        cropNaturalSize.height,
      ),
    );
  };

  const cropBoxStyle =
    cropBox && cropNaturalSize
      ? cropBoxPercentStyle(
          cropBox,
          cropNaturalSize.width,
          cropNaturalSize.height,
        )
      : undefined;

  return (
    <section className="col-span-2 rounded-[10px] border border-border bg-card p-3">
      <div className="grid items-start gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="max-w-[min(180px,28vw)] overflow-hidden rounded-[8px] border border-border bg-muted">
            {currentSrc ? (
              <img
                src={currentSrc}
                alt={t("episode.workbench.render.backgroundTitle")}
                className="block h-auto max-h-[180px] w-auto max-w-full object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-[120px] w-[min(180px,28vw)] items-center justify-center text-xs text-muted-foreground">
                {loading
                  ? t("common.loading", "Loading")
                  : t("episode.workbench.render.backgroundMissing")}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <div className="flex min-w-0 items-center text-[12px] font-medium text-foreground/76">
              <span className="truncate">
                {t("episode.workbench.render.backgroundTitle")}
              </span>
            </div>
            <span className="inline-flex h-5 max-w-full items-center rounded-full border border-primary/35 bg-primary/[0.07] px-2 text-[11px] font-medium leading-none text-primary">
              {t("episode.workbench.render.backgroundCurrent", {
                label: currentLabel,
              })}
            </span>
          </div>

          <div className="flex flex-col items-start gap-3">
            {sourceAnchors.map((item) => {
              const isActive = item.id === activeAnchorId;
              const canCrop = CROP_SOURCE_ANCHORS.has(item.id);
              const itemLabel = formatAnchorLabel(item);
              const cropActionLabel = t(
                "episode.workbench.render.backgroundCropAction",
                { label: itemLabel },
              );
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-1 rounded-[8px]"
                >
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={disabled || !item.exists || choosing}
                    onClick={() => void onChoose(item.id)}
                    data-ui-tooltip={item.path || itemLabel}
                    className={cn(
                      "h-7 gap-1 rounded-[7px] border-border bg-muted px-2.5 text-[12px] font-normal text-foreground/76 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground disabled:border-border disabled:bg-muted/50 disabled:text-muted-foreground/55",
                      isActive &&
                        "border-primary/45 bg-primary/[0.075] text-primary hover:border-primary/60 hover:bg-primary/[0.11] hover:text-primary",
                    )}
                  >
                    {choosing && isActive ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : null}
                    {itemLabel}
                  </Button>
                  {canCrop ? (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="outline"
                      aria-label={cropActionLabel}
                      data-ui-tooltip={cropActionLabel}
                      disabled={
                        disabled || !item.exists || croppingAnchorId !== null
                      }
                      className="size-7 rounded-[7px] border-border bg-muted text-foreground/70 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground disabled:border-border disabled:bg-muted/50 disabled:text-muted-foreground/55"
                      onClick={() => {
                        setCropNaturalSize(null);
                        setCropTarget({
                          id: item.id,
                          label: itemLabel,
                          url: item.url ?? null,
                          path: item.path ?? null,
                        });
                      }}
                    >
                      {croppingAnchorId === item.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Crop className="size-3" />
                      )}
                    </Button>
                  ) : null}
                </div>
              );
            })}
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void onUpload(file);
              }}
            />
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => uploadInputRef.current?.click()}
              disabled={disabled || uploading}
              className="h-7 gap-1 rounded-[7px] border-border bg-muted px-2.5 text-[12px] font-normal text-foreground/76 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground disabled:border-border disabled:bg-muted/50 disabled:text-muted-foreground/55"
            >
              {uploading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Upload className="size-3" />
              )}
              {t("episode.workbench.render.backgroundUpload")}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {canOpenDirectorWorld ? (
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={onOpenDirectorWorld}
                disabled={disabled}
                className="h-7 gap-1 rounded-[7px] border-border bg-muted px-2.5 text-[12px] font-normal text-foreground/76 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground disabled:border-border disabled:bg-muted/50 disabled:text-muted-foreground/55"
              >
                <ImageIcon className="size-3" />
                {t("episode.workbench.render.backgroundOpen360")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        open={cropTarget !== null}
        onOpenChange={(open) => !open && closeCropDialog()}
      >
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-hidden rounded-xl border border-border bg-popover p-0 text-popover-foreground ring-foreground/10 sm:max-w-[min(96vw,1120px)]"
        >
          <div className="relative flex h-12 items-center border-b border-border bg-popover px-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Crop className="size-4" />
              {`裁剪 ${cropAspectLabel}`}
            </div>
            <DialogTitle className="absolute left-1/2 max-w-[52vw] -translate-x-1/2 truncate text-center text-sm font-medium text-foreground">
              {cropTitle}
            </DialogTitle>
            <button
              type="button"
              aria-label="关闭"
              className="absolute right-4 flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              onClick={closeCropDialog}
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="relative flex min-h-[360px] items-center justify-center bg-media p-4">
            {cropTargetSrc ? (
              <div className="relative inline-block max-h-[72vh] max-w-full">
                <img
                  ref={cropImageRef}
                  src={cropTargetSrc}
                  alt={cropTitle}
                  className="block max-h-[72vh] max-w-full object-contain"
                  onLoad={(event) => {
                    const nextSize = {
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    };
                    setCropNaturalSize(nextSize);
                    setCropBox(
                      centerCropBoxForRatio(
                        nextSize.width,
                        nextSize.height,
                        cropAspectRatio,
                      ),
                    );
                  }}
                />
                {cropBoxStyle ? (
                  <div
                    ref={cropBoxRef}
                    role="button"
                    tabIndex={0}
                    aria-label="移动裁剪区域"
                    className="absolute cursor-move touch-none border-2 border-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.58)]"
                    style={cropBoxStyle}
                    onPointerDown={(event) => {
                      if (!cropBox) return;
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      cropDragRef.current = {
                        pointerId: event.pointerId,
                        clientX: event.clientX,
                        clientY: event.clientY,
                        crop: cropBox,
                      };
                    }}
                    onPointerMove={moveCropBox}
                    onPointerUp={(event) => {
                      event.currentTarget.releasePointerCapture?.(
                        event.pointerId,
                      );
                      cropDragRef.current = null;
                    }}
                    onPointerCancel={(event) => {
                      event.currentTarget.releasePointerCapture?.(
                        event.pointerId,
                      );
                      cropDragRef.current = null;
                    }}
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-media-foreground/30" />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                {t("episode.workbench.render.backgroundMissing")}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-popover px-4 py-3">
            <Button
              type="button"
              variant="outline"
              onClick={closeCropDialog}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={saveCropTarget}
              disabled={!cropTargetSrc || cropPending}
              className={CROP_DIALOG_SAVE_BUTTON_CLASS}
            >
              {cropPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Crop className="size-3" />
              )}
              {t(
                "episode.workbench.render.backgroundCropSave",
                "保存截图",
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
