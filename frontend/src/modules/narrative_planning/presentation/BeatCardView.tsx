// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { Check, Loader2, Shrimp, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";
import type {
  BeatCardAspectRatio,
  BeatCardController,
} from "@/modules/narrative_planning/application/create-beat-card-controller";

export interface BeatCardViewProps {
  controller: BeatCardController;
}

export function BeatCardView({ controller }: BeatCardViewProps) {
  const { t } = useTranslation();
  const {
    aspectRatio,
    beatNumber,
    displayNumber,
    hasVisibleMedia,
    isChecked,
    isDeletingManual,
    isOpeningFreezone,
    isSelected,
    mainImageUrl,
    mainMediaKind,
    onCardClick,
    onCheckboxClick,
    onDeleteManual,
    onInsertAfter,
    onInsertBefore,
    onOpenFreezone,
    showSketchOverlay,
    sketchOverlayUrl,
    useHorizontalActions,
  } = controller;
  const mainPlaceholder =
    mainMediaKind === "render"
      ? t("episode.beat.noRender")
      : t("episode.beat.noSketch");

  return (
    <article
      data-beat-number={beatNumber}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[8px] border bg-card text-left transition-all duration-150 ease-out hover:scale-[1.008]",
        isSelected && "border-primary/65 bg-primary/[0.06]",
        isChecked && !isSelected && "border-primary/45 bg-primary/[0.05]",
        !isSelected &&
          !isChecked &&
          "border-border hover:border-foreground/28 hover:bg-muted",
        !hasVisibleMedia && "min-h-[100px]",
      )}
    >
      <span
        className={cn(
          "absolute left-1.5 top-1.5 z-20 rounded-[4px] border px-2 py-1 font-mono text-[11px] font-medium leading-none tabular-nums backdrop-blur-md",
          isSelected
            ? "border-cyan-200/45 bg-media/55 text-cyan-100"
            : "border-media-foreground/10 bg-media/45 text-media-foreground/80",
        )}
      >
        {t("episode.beat.badge", { n: displayNumber })}
      </span>

      <div className="absolute right-1.5 top-1.5 z-20 flex items-center gap-1">
        {onDeleteManual && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteManual();
                  }}
                  disabled={isDeletingManual}
                  className="flex size-5 items-center justify-center rounded-[5px] border border-destructive/25 bg-destructive/[0.08] text-destructive backdrop-blur transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:cursor-wait disabled:opacity-60"
                  aria-label={t("episode.beat.deleteManualShot")}
                />
              }
            >
              {isDeletingManual ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Trash2 className="size-3" />
              )}
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              showArrow={false}
              className="border border-border bg-popover/95 text-popover-foreground shadow-none"
            >
              {t("episode.beat.deleteManualShot")}
            </TooltipContent>
          </Tooltip>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCheckboxClick();
          }}
          className={cn(
            "flex size-5 items-center justify-center rounded-[5px] border backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            isChecked
              ? "border-cyan-200/55 bg-media/55 text-cyan-100"
              : "border-media-foreground/15 bg-media/35 text-transparent hover:border-media-foreground/30 hover:bg-media/50",
          )}
          aria-label={
            isChecked
              ? t("episode.beat.deselect")
              : t("episode.beat.select")
          }
        >
          <Check className="size-3" />
        </button>
      </div>

      <button
        type="button"
        onClick={onCardClick}
        className="flex flex-1 flex-col text-left"
      >
        {hasVisibleMedia && (
          <div className="relative w-full">
            <ImageSlot
              src={mainImageUrl}
              alt={mainMediaKind}
              placeholder={mainPlaceholder}
              className="w-full"
              aspectRatio={aspectRatio}
            />
            {showSketchOverlay && (
              <div
                className={cn(
                  "absolute bottom-1.5 left-1.5 w-[32%] min-w-10 max-w-16 overflow-hidden rounded-[5px] border border-media-foreground/15 bg-media/50 shadow-xl backdrop-blur",
                  aspectRatio === "landscape" && "w-[24%]",
                )}
              >
                <ImageSlot
                  src={sketchOverlayUrl}
                  alt="sketch"
                  placeholder={t("episode.beat.noSketch")}
                  className="w-full"
                  aspectRatio={aspectRatio}
                />
              </div>
            )}
          </div>
        )}
      </button>

      {(onInsertBefore || onInsertAfter || onOpenFreezone) &&
        hasVisibleMedia && (
          <div
            className={cn(
              "absolute bottom-1.5 right-1.5 z-20 flex items-center gap-1",
              useHorizontalActions ? "flex-row" : "flex-col",
            )}
          >
            {onInsertBefore && (
              <BeatCardActionButton
                label={t("episode.beat.insertBeforeShort")}
                tooltip={t("episode.beat.insertBefore", {
                  n: displayNumber,
                })}
                onClick={onInsertBefore}
                tooltipSide={useHorizontalActions ? "top" : "right"}
              />
            )}
            {onInsertAfter && (
              <BeatCardActionButton
                label={t("episode.beat.insertAfterShort")}
                tooltip={t("episode.beat.insertAfter", {
                  n: displayNumber,
                })}
                onClick={onInsertAfter}
                tooltipSide={useHorizontalActions ? "top" : "right"}
              />
            )}
            {onOpenFreezone && (
              <BeatCardActionButton
                label={
                  isOpeningFreezone ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Shrimp className="size-3.5" />
                  )
                }
                tooltip={t("episode.beat.openFreezoneTip")}
                onClick={onOpenFreezone}
                disabled={isOpeningFreezone}
                ariaLabel={t("episode.beat.openFreezone")}
                tooltipSide={useHorizontalActions ? "top" : "right"}
              />
            )}
          </div>
        )}
    </article>
  );
}

function BeatCardActionButton({
  label,
  tooltip,
  onClick,
  disabled = false,
  ariaLabel,
  tooltipSide = "right",
}: {
  label: ReactNode;
  tooltip: string;
  onClick(): void;
  disabled?: boolean;
  ariaLabel?: string;
  tooltipSide?: "top" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={150}
        closeDelay={150}
        render={
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
            disabled={disabled}
            className="flex size-6 items-center justify-center rounded-[6px] border border-media-foreground/20 bg-media/60 text-[12px] font-medium leading-none text-media-foreground/80 shadow-lg backdrop-blur transition-colors duration-100 hover:border-cyan-200/45 hover:bg-media/75 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-wait disabled:opacity-65 [&_svg]:size-3"
            aria-label={ariaLabel ?? tooltip}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent
        side={tooltipSide}
        sideOffset={8}
        showArrow={false}
        className="border border-border bg-popover/95 text-popover-foreground shadow-none"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function ImageSlot({
  src,
  alt,
  placeholder,
  className,
  aspectRatio,
}: {
  src: string | null;
  alt: string;
  placeholder: string;
  className?: string;
  aspectRatio: BeatCardAspectRatio;
}) {
  const resolved = src ? resolveMediaUrl(src, { variant: "thumb2x" }) : null;
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-media/35",
        aspectRatio === "portrait" ? "aspect-[2/3]" : "aspect-video",
        className,
      )}
    >
      {resolved ? (
        <img
          src={resolved}
          alt={alt}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
          {placeholder}
        </div>
      )}
    </div>
  );
}
