// Copyright (c) 2026 AI anime
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Brush, Clapperboard, Loader2, Play, RefreshCw } from "lucide-react";

import { CreditCostInline } from "@/components/credit-cost-inline";
import { ActionPanel } from "@/components/episode/beat-workbench/action-panel";
import { BatchBar } from "@/components/episode/beat-workbench/batch-bar";
import { BeatCardGrid } from "@/components/episode/beat-workbench/beat-card-grid";
import { RenderGridGallery } from "@/components/episode/beat-workbench/render-grid-gallery";
import { RenderPlanDialog } from "@/components/episode/beat-workbench/render-plan-dialog";
import { SketchGridGallery } from "@/components/episode/beat-workbench/sketch-grid-gallery";
import { ViewToggles } from "@/components/episode/beat-workbench/view-toggles";
import {
  useEpisodeActionsSlot,
  useRegisterEpisodeActionsSlot,
} from "@/components/episode/episode-actions-slot";
import { EpisodeEmptyState } from "@/components/episode/episode-empty-state";
import { useHideHeaderOnScroll } from "@/components/episode/header-collapse";
import { Button } from "@/components/ui/button";
import { EMPTY_STATE_ACTION_BUTTON_CLASS } from "@/components/ui/empty-state-styles";
import { sketchPlanGridLabel } from "@/modules/production/public";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GLASS_ALERT_DIALOG_CONTENT_CLASS } from "@/lib/dialog-styles";
import { cn } from "@/lib/utils";
import type { BeatsPageController } from "@/modules/narrative_planning/application/use-beats-page-controller";
import {
  SketchColorLegendView,
  SketchStudioActionsView,
} from "@/modules/narrative_planning/presentation/SketchStudioActionsView";

const SHOW_EPISODE_FREEZONE_ENTRY = false;

export function BeatsPageView({
  controller,
}: {
  controller: BeatsPageController;
}) {
  const { t } = useTranslation();
  const scrollHideRef = useHideHeaderOnScroll<HTMLDivElement>();
  const actionsSlot = useEpisodeActionsSlot();
  const {
    aspectRatio,
    beats,
    checkedBeatNumbers,
    clearSelection,
    detailBeatDisplayNumber,
    episodeNumber,
    generateDisabled,
    generatePending,
    generateScriptCostDisplay,
    generateTitle,
    handleCardClick,
    handleGenerate,
    handleOpenEpisodeFreezone,
    handleRebuildPoolIndex,
    handleVideoBackendChange,
    imageGenerationSelection,
    isLoading,
    isNarratedProject,
    isSeedance2Backend,
    onCancelPendingAspect,
    onConfirmPendingAspect,
    openingEpisodeFreezone,
    pendingAspect,
    project,
    rebuildPoolIndexPending,
    renderAspectMode,
    selection,
    setSketchAspectRatio,
    sketchAspectRatio,
    sketchPlan,
    sketchStudio,
    spineTemplate,
    states,
    targetSection,
    toggleCheck,
    toggleView,
    toggles,
    videoBackend,
  } = controller;
  const {
    handleConfirmSketchPlan,
    handleRenderDispatched,
    lockedSketchItemIds,
    openRenderPlan,
    openSketchPlan,
    renderPlanOpen,
    setRenderPlanOpen,
    setSketchPlanOpen,
    sketchPlanCostDisplay,
    sketchPlanItems,
    sketchPlanOpen,
    sketchPlanUnlockedCount,
  } = sketchPlan;

  useRegisterEpisodeActionsSlot(beats.length > 0);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const splitDraggingRef = useRef(false);
  const [leftSplitPercent, setLeftSplitPercent] = useState<number>(() => {
    const saved = Number(localStorage.getItem("st.beats.split-ratio"));
    return Number.isFinite(saved) && saved >= 25 && saved <= 70 ? saved : 38;
  });
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [gridGalleryOpen, setGridGalleryOpen] = useState(false);
  const [renderGridGalleryOpen, setRenderGridGalleryOpen] = useState(false);

  const handleSplitPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      splitDraggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );
  const handleSplitPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!splitDraggingRef.current) return;
      const rect = splitContainerRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const percentage = ((event.clientX - rect.left) / rect.width) * 100;
      setLeftSplitPercent(Math.min(70, Math.max(25, percentage)));
    },
    [],
  );
  const handleSplitPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!splitDraggingRef.current) return;
      splitDraggingRef.current = false;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      setLeftSplitPercent((percentage) => {
        localStorage.setItem(
          "st.beats.split-ratio",
          String(Math.round(percentage)),
        );
        return percentage;
      });
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("episode.beats.loading")}
      </div>
    );
  }

  if (beats.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-12 text-center">
        <EpisodeEmptyState
          icon={Clapperboard}
          title={t("episode.beats.noBeatsTitle")}
          description={t("episode.beats.noBeats")}
          className="h-auto p-0"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setGenerateConfirmOpen(true)}
          disabled={generateDisabled}
          className={cn(
            EMPTY_STATE_ACTION_BUTTON_CLASS,
            "[&_svg]:size-3.5",
          )}
          title={generateTitle}
        >
          {generatePending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {t("episode.beats.generateBeats")}
          <CreditCostInline display={generateScriptCostDisplay} />
        </Button>
        <AlertDialog
          open={generateConfirmOpen}
          onOpenChange={setGenerateConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("episode.beats.generateBeatsTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("episode.beats.generateBeatsDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setGenerateConfirmOpen(false);
                  void handleGenerate();
                }}
              >
                {t("common.confirmExecute")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div ref={scrollHideRef} className="flex h-full flex-col overflow-hidden">
      {actionsSlot &&
        createPortal(
          <BatchBar
            project={project}
            episode={episodeNumber}
            beats={beats}
            videoBackend={videoBackend}
            spineTemplate={spineTemplate}
            sketchAspectRatio={sketchAspectRatio}
            onSketchAspectRatioChange={setSketchAspectRatio}
          />,
          actionsSlot,
        )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          ref={splitContainerRef}
          data-beats-split
          className="flex h-full min-h-0 overflow-hidden"
        >
          <section
            style={{ width: `${leftSplitPercent}%` }}
            className="min-w-0 shrink-0 overflow-hidden"
          >
            <div className="flex h-full min-h-0 flex-col">
              <ViewToggles
                toggles={toggles}
                onToggle={toggleView}
                selection={selection}
                totalBeats={beats.length}
                onClearSelection={clearSelection}
                onBatchRegenSketch={openSketchPlan}
                onBatchRegenRender={openRenderPlan}
                legendSlot={
                  <SketchColorLegendView controller={sketchStudio} />
                }
              />
              <BeatCardGrid
                beats={beats}
                toggles={toggles}
                selection={selection}
                aspectRatio={aspectRatio}
                project={project}
                episode={episodeNumber}
                spineTemplate={spineTemplate}
                onCardClick={handleCardClick}
                onCheckboxClick={toggleCheck}
              />
            </div>
          </section>
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={handleSplitPointerDown}
            onPointerMove={handleSplitPointerMove}
            onPointerUp={handleSplitPointerUp}
            className="group relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none select-none"
            title={t("episode.workbench.view.dragToResize")}
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/60 group-active:bg-primary/80" />
          </div>
          <section className="min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
                {detailBeatDisplayNumber !== null ? (
                  <span className="font-mono text-xs font-medium leading-none tabular-nums text-primary">
                    {t("episode.workbench.view.activeBeat", {
                      n: detailBeatDisplayNumber,
                    })}
                  </span>
                ) : (
                  <span aria-hidden className="min-w-0" />
                )}
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 rounded-[5px] bg-transparent px-1.5 text-[11px] font-medium text-foreground/75 shadow-none hover:bg-muted hover:text-foreground"
                    onClick={() => void handleRebuildPoolIndex()}
                    disabled={rebuildPoolIndexPending}
                    title={t("episode.workbench.pool.rebuildIndex")}
                  >
                    {rebuildPoolIndexPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    {t("episode.workbench.pool.rebuildIndex")}
                  </Button>
                  {SHOW_EPISODE_FREEZONE_ENTRY && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={handleOpenEpisodeFreezone}
                      disabled={openingEpisodeFreezone}
                      title={t(
                        "episode.workbench.actionPanel.episodeFreezoneTooltip",
                      )}
                    >
                      {openingEpisodeFreezone ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Brush className="size-3.5" />
                      )}
                      {t("episode.workbench.actionPanel.episodeFreezone")}
                    </Button>
                  )}
                  <SketchStudioActionsView
                    controller={sketchStudio}
                    onOpenGridGallery={() => setGridGalleryOpen(true)}
                    onOpenRenderGridGallery={
                      isNarratedProject
                        ? () => setRenderGridGalleryOpen(true)
                        : undefined
                    }
                    showLegend={false}
                    showDetectionSummary={false}
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ActionPanel
                  selection={selection}
                  beats={beats}
                  states={states}
                  project={project}
                  episode={episodeNumber}
                  defaultBackend={videoBackend}
                  onDefaultBackendChange={handleVideoBackendChange}
                  spineTemplate={spineTemplate}
                  isSeedance2Backend={isSeedance2Backend}
                  showAudioMediaStatus={isNarratedProject}
                  targetSection={targetSection}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
      <Dialog open={gridGalleryOpen} onOpenChange={setGridGalleryOpen}>
        <DialogContent
          closeButtonClassName="top-0 -right-9 z-50 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:bg-transparent"
          overlayClassName="bg-scrim supports-backdrop-filter:backdrop-blur-sm"
          className="h-[min(calc(100vh-3rem),760px)] w-[min(calc(100vw-1rem),1440px)] max-w-none overflow-visible rounded-2xl border border-border bg-popover/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-none"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("episode.workbench.sketchGrid.title")}</DialogTitle>
          </DialogHeader>
          <div className="h-full overflow-hidden rounded-2xl">
            <SketchGridGallery
              project={project}
              episode={episodeNumber}
              beats={beats}
              aspectRatio={sketchAspectRatio}
              imageGenerationSelection={imageGenerationSelection}
            />
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={renderGridGalleryOpen}
        onOpenChange={setRenderGridGalleryOpen}
      >
        <DialogContent
          closeButtonClassName="top-0 -right-9 z-50 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground focus-visible:bg-transparent"
          overlayClassName="bg-scrim supports-backdrop-filter:backdrop-blur-sm"
          className="h-[min(calc(100vh-3rem),760px)] w-[min(calc(100vw-1rem),1440px)] max-w-none overflow-visible rounded-2xl border border-border bg-popover/95 p-0 shadow-2xl backdrop-blur-2xl sm:max-w-none"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{t("episode.workbench.renderGrid.title")}</DialogTitle>
          </DialogHeader>
          <div className="h-full overflow-hidden rounded-2xl">
            <RenderGridGallery
              project={project}
              episode={episodeNumber}
              beats={beats}
            />
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={sketchPlanOpen} onOpenChange={setSketchPlanOpen}>
        <AlertDialogContent
          className={cn("max-w-3xl", GLASS_ALERT_DIALOG_CONTENT_CLASS)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("episode.sketchPlan.title", {
                beats: checkedBeatNumbers.length,
                grids: sketchPlanItems.length,
                defaultValue: `草图计划（${checkedBeatNumbers.length} beats → ${sketchPlanItems.length} 个网格）`,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.sketchPlan.subtitle", {
                defaultValue:
                  "系统已根据场景自动分组。确认后会直接发配草图任务。",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="mt-4 max-h-[45vh] overflow-y-auto">
            <div className="flex flex-wrap gap-2">
              {sketchPlanItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex w-[170px] shrink-0 flex-col gap-1 rounded-[6px] border bg-muted p-2 text-xs backdrop-blur-sm ${
                    lockedSketchItemIds.has(item.id)
                      ? "border-border opacity-50"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {sketchPlanGridLabel(item.modeKey)}
                    </span>
                    <span className="text-muted-foreground">
                      {item.beatNumbers.length > 1
                        ? `B${item.beatNumbers[0]}-${
                            item.beatNumbers[item.beatNumbers.length - 1]
                          }`
                        : `B${item.beatNumbers[0]}`}
                    </span>
                  </div>
                  <div
                    className="truncate text-success"
                    title={item.sceneIds.join(" / ")}
                  >
                    {item.sceneIds.join(" / ") ||
                      t("episode.renderPlan.unknownLocation")}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {lockedSketchItemIds.has(item.id)
                      ? t("episode.workbench.batch.sketchGroupRunning", {
                          defaultValue: "相同草图组正在运行中",
                        })
                      : item.modeLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <AlertDialogFooter className="px-4">
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              disabled={
                sketchPlanItems.length === 0 ||
                sketchPlanUnlockedCount === 0
              }
              onClick={handleConfirmSketchPlan}
              className="relative pr-11 transition-transform active:scale-95"
            >
              {t("episode.sketchPlan.confirm", {
                grids: sketchPlanItems.length,
                defaultValue: `确认草图 ${sketchPlanItems.length} 个网格`,
              })}
              <CreditCostInline display={sketchPlanCostDisplay} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RenderPlanDialog
        open={renderPlanOpen}
        onOpenChange={setRenderPlanOpen}
        project={project}
        episode={episodeNumber}
        beatIndices={checkedBeatNumbers}
        aspectMode={renderAspectMode}
        defaultForceOneByOne={false}
        onDispatched={handleRenderDispatched}
      />
      <AlertDialog
        open={pendingAspect !== null}
        onOpenChange={(open) => {
          if (!open) onCancelPendingAspect();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("episode.workbench.aspectSwitch.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.workbench.aspectSwitch.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmPendingAspect}>
              {t("episode.workbench.aspectSwitch.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
