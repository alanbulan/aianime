// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { Grid2X2, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SketchStudioController } from "@/modules/narrative_planning/application/use-sketch-studio-controller";

export function SketchColorLegendView({
  controller,
}: {
  controller: SketchStudioController;
}) {
  const { identityColors, propColors } = controller;
  if (identityColors.length === 0 && propColors.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 px-3 pb-3 pt-3 text-xs">
      {identityColors.map((entry) => (
        <span
          key={entry.identityId}
          className="inline-flex h-5 max-w-[180px] items-center gap-1 rounded-full border border-border bg-muted px-1.5 text-[11px] leading-none"
          title={`${entry.character}${entry.identity ? ` · ${entry.identity}` : ""}`}
        >
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: entry.hex }}
          />
          <span className="truncate text-foreground/70">
            {entry.character}
            {entry.identity && (
              <>
                {" · "}
                <span className="text-muted-foreground">{entry.identity}</span>
              </>
            )}
          </span>
        </span>
      ))}
      {propColors.length > 0 && (
        <>
          {identityColors.length > 0 && (
            <span className="mx-0.5 h-3 w-px bg-border/40" aria-hidden />
          )}
          {propColors.map((prop) => (
            <span
              key={prop.propId}
              className="inline-flex h-5 max-w-[160px] items-center gap-1 rounded-full border border-border bg-muted px-1.5 text-[11px] leading-none"
              title={
                prop.description
                  ? `${prop.propId} · ${prop.description}`
                  : prop.propId
              }
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: prop.hex }}
              />
              <span className="truncate text-foreground/70">{prop.propId}</span>
            </span>
          ))}
        </>
      )}
    </div>
  );
}

export interface SketchStudioActionsViewProps {
  controller: SketchStudioController;
  onOpenGridGallery?: () => void;
  onOpenRenderGridGallery?: () => void;
  showDetectionSummary?: boolean;
  showGridGalleryActions?: boolean;
  showLegend?: boolean;
}

export function SketchStudioActionsView({
  controller,
  onOpenGridGallery,
  onOpenRenderGridGallery,
  showDetectionSummary = true,
  showGridGalleryActions = true,
  showLegend = true,
}: SketchStudioActionsViewProps) {
  const { t } = useTranslation();
  const {
    detectionSummary,
    hasDetectionSummary,
    identityColors,
    propColors,
  } = controller;
  const hasVisibleLegend =
    showLegend && (identityColors.length > 0 || propColors.length > 0);
  const hasVisibleDetectionSummary =
    showDetectionSummary && hasDetectionSummary;

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-xs">
      {hasVisibleLegend && (
        <div className="flex items-center gap-1">
          {identityColors.length > 0 && (
            <span className="text-[11px] text-muted-foreground/70">
              {t("episode.workbench.sketch.identityColors")}
            </span>
          )}
          {identityColors.map((entry) => (
            <span
              key={entry.identityId}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 leading-none"
              title={`${entry.character}${entry.identity ? ` · ${entry.identity}` : ""}`}
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.hex }}
              />
              <span className="truncate text-foreground/70">
                {entry.character}
                {entry.identity && (
                  <>
                    {" · "}
                    <span className="text-muted-foreground">
                      {entry.identity}
                    </span>
                  </>
                )}
              </span>
            </span>
          ))}
          {propColors.length > 0 && (
            <>
              {identityColors.length > 0 && (
                <span className="mx-0.5 h-3 w-px bg-border/40" aria-hidden />
              )}
              <span className="text-[11px] text-muted-foreground/70">
                {t("episode.workbench.sketch.propColors")}
              </span>
              {propColors.map((prop) => (
                <span
                  key={prop.propId}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 leading-none"
                  title={
                    prop.description
                      ? `${prop.propId} · ${prop.description}`
                      : prop.propId
                  }
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: prop.hex }}
                  />
                  <span className="truncate text-foreground/70">
                    {prop.propId}
                  </span>
                </span>
              ))}
            </>
          )}
        </div>
      )}

      {hasVisibleDetectionSummary && (
        <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/8 px-2 py-0.5 text-[11px] leading-none text-primary">
          <Wand2 className="size-3 shrink-0" />
          <span className="font-medium">
            {t("episode.workbench.sketch.aiDetectResults")}
          </span>
          <span className="text-primary">
            {t("episode.workbench.sketch.aiDetectResultCounts", {
              beats: detectionSummary.beatCount,
              identities: detectionSummary.identityCount,
              props: detectionSummary.propCount,
            })}
          </span>
        </span>
      )}

      {(hasVisibleLegend || hasVisibleDetectionSummary) && (
        <span className="mx-0.5 h-4 w-px bg-border/40" aria-hidden />
      )}

      {showGridGalleryActions &&
        (onOpenGridGallery || onOpenRenderGridGallery) && (
          <div className="flex items-center gap-1">
            {onOpenGridGallery && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onOpenGridGallery}
                className="h-6 gap-1 rounded-[5px] bg-transparent px-1.5 text-[11px] font-medium text-foreground/75 shadow-none hover:bg-muted hover:text-foreground"
                title={t("episode.workbench.sketch.openGridGallery")}
              >
                <Grid2X2 className="size-3" />
                {t("episode.workbench.sketch.openGridGallery")}
              </Button>
            )}
            {onOpenRenderGridGallery && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onOpenRenderGridGallery}
                className="h-6 gap-1 rounded-[5px] bg-transparent px-1.5 text-[11px] font-medium text-foreground/75 shadow-none hover:bg-muted hover:text-foreground"
                title={t("episode.workbench.renderGrid.title")}
              >
                <Grid2X2 className="size-3" />
                {t("episode.workbench.renderGrid.title")}
              </Button>
            )}
          </div>
        )}
    </div>
  );
}
