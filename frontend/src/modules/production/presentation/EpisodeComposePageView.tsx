// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import type { ElementType } from "react";
import {
  ArrowUpRight,
  Download,
  FileText,
  Film,
  Loader2,
  Subtitles,
} from "lucide-react";

import { EpisodeEmptyState } from "@/components/episode/episode-empty-state";
import { StageProgressPanel } from "@/components/stage-progress-panel";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { EpisodeComposePageController } from "@/modules/production/application/use-episode-compose-page-controller";
import {
  episodeResolutionLabel,
  episodeResolutionOptions,
} from "@/modules/production/domain/episode-compose";

type TFn = ReturnType<typeof useTranslation>["t"];

function MetaDot() {
  return <span className="text-muted-foreground">·</span>;
}

// ── InlineSwitch — lightweight toggle switch ────────────────────────

function InlineSwitch({
  checked,
  onChange,
  icon: Icon,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  icon: ElementType;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5">
      <span className="relative inline-flex h-4 w-7 shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={onChange}
        />
        <span className="absolute inset-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary/40" />
        <span className="absolute left-[2px] top-[2px] h-3 w-3 rounded-full bg-card shadow-sm transition-all peer-checked:translate-x-3" />
      </span>
      <span className={cn(
        "flex items-center gap-1 text-[12px] transition-colors",
        checked ? "text-foreground" : "text-muted-foreground",
      )}>
        <Icon className="size-3" />
        {label}
      </span>
    </label>
  );
}

export function EpisodeComposePageView({
  controller,
}: {
  controller: EpisodeComposePageController;
}) {
  const { t } = useTranslation();
  const {
    addSubtitles,
    beatsEmpty,
    beatsLoading,
    canCompose,
    composeConfirm,
    counts,
    displayTitle,
    durationLabel,
    handleAddSubtitlesChange,
    handleCompose,
    handleDownloadVideo,
    handleExport,
    handleResolutionChange,
    isComposing,
    onOpenBeat,
    orientation,
    outputFilename,
    resolution,
    resultUrl,
    setComposeConfirm,
    task,
    totalBeats,
  } = controller;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Compose confirm dialog */}
      <AlertDialog open={composeConfirm} onOpenChange={setComposeConfirm}>
        <AlertDialogContent className="max-w-[480px] rounded-2xl border-border bg-popover/95 p-6 shadow-2xl backdrop-blur-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center text-base font-semibold text-foreground">
              {t("episode.compose.composeTitle", { title: displayTitle })}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center text-sm text-muted-foreground">
              {t("episode.compose.composeDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted px-4 py-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("episode.compose.beats")}
              </div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {totalBeats || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("episode.compose.duration")}
              </div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {durationLabel ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("episode.compose.resolution")}
              </div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {episodeResolutionLabel(resolution)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("episode.compose.options")}
              </div>
              <div className="mt-0.5 text-sm font-medium text-foreground">
                {addSubtitles ? t("episode.compose.subtitlesOn") : t("episode.compose.subtitlesOff")}
              </div>
            </div>
          </div>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel className="h-10 rounded-lg border-border bg-muted px-4 text-sm font-normal text-foreground/80 hover:border-foreground/30 hover:bg-accent hover:text-foreground">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-10 gap-1.5 rounded-lg bg-primary px-4 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
              onClick={() => {
                setComposeConfirm(false);
                handleCompose();
              }}
            >
              <Film className="size-4" />
              {t("episode.compose.composeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 p-6 sm:p-8">
          {/* Header: title + meta, actions on the right */}
          {!beatsEmpty && (
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">
                  {displayTitle}
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{outputFilename}</span>
                  {resultUrl ? (
                    <>
                      <MetaDot />
                      <span>{episodeResolutionLabel(resolution)}</span>
                      <MetaDot />
                      <span>
                        {addSubtitles
                          ? t("episode.compose.subtitlesOn")
                          : t("episode.compose.subtitlesOff")}
                      </span>
                      {durationLabel ? (
                        <>
                          <MetaDot />
                          <span>{durationLabel}</span>
                        </>
                      ) : null}
                    </>
                  ) : durationLabel ? (
                    <>
                      <MetaDot />
                      <span>
                        {t("episode.compose.durationApprox", { value: durationLabel })}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExport("srt")}
                  className="gap-1.5"
                >
                  <FileText className="size-3.5" />
                  {t("episode.compose.exportSrt")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExport("zip")}
                  className="gap-1.5"
                >
                  <Download className="size-3.5" />
                  {t("episode.compose.exportZip")}
                </Button>
                {resultUrl ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => void handleDownloadVideo()}
                      className="gap-1.5"
                    >
                      <Download className="size-3.5" />
                      {t("episode.compose.downloadVideo")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setComposeConfirm(true)}
                      disabled={!canCompose || isComposing}
                      className="gap-1.5"
                    >
                      {isComposing ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Film className="size-3.5" />
                      )}
                      {t("episode.compose.recomposeEpisode")}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setComposeConfirm(true)}
                    disabled={!canCompose || isComposing}
                    className="gap-1.5 bg-primary text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75"
                  >
                    {isComposing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Film className="size-3.5" />
                    )}
                    {t("episode.compose.composeEpisode")}
                  </Button>
                )}
              </div>
            </header>
          )}

          {!beatsEmpty && <hr className="border-border" />}

          {/* Config row + warning: below divider */}
          {!beatsEmpty && !resultUrl && !isComposing && (
            <div className="flex flex-col gap-5 pb-2 pt-1 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="min-w-0 space-y-1.5">
                <h2 className="text-base font-semibold text-warning">
                  {t("episode.compose.blockerCount", { count: counts.compose.missing.length })}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("episode.compose.blockerSubtitle")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-6">
                {/* Resolution */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-muted-foreground">{t("episode.compose.resolution")}:</span>
                  <Select value={resolution} onValueChange={handleResolutionChange}>
                    <SelectTrigger className="!h-7 w-28 rounded-[6px] border border-border bg-transparent py-0 text-[12px] font-medium text-foreground/85">
                      <SelectValue>
                        {() => episodeResolutionLabel(resolution)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {episodeResolutionOptions(orientation).map((value) => (
                        <SelectItem key={value} value={value}>
                          {episodeResolutionLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Switches */}
                <InlineSwitch
                  checked={addSubtitles}
                  onChange={handleAddSubtitlesChange}
                  icon={Subtitles}
                  label={t("video.addSubtitles")}
                />
              </div>
            </div>
          )}

          {/* Content below divider */}
          {resultUrl ? (
            // Vertical (9:16) drama clips are taller than they are wide.
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
              <video
                src={resultUrl}
                controls
                className="block max-h-full max-w-full rounded-lg"
              />
            </div>
          ) : beatsLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("episode.beats.loading")}
            </div>
          ) : beatsEmpty ? (
            <EpisodeEmptyState
              icon={Film}
              title={t("episode.compose.noClips")}
              description={t("episode.compose.noClipsHint")}
            />
          ) : isComposing ? (
            <StageProgressPanel
              title={t("episode.compose.composing")}
              currentTask={task.stream.currentTask}
              progress={task.stream.progress}
              logs={task.logs}
              onStop={task.stop}
              stopping={task.stopping}
            />
          ) : (
            <>
              {/* Beat grid — lightweight cards */}
              {counts.compose.missing.length > 0 && (
                <BeatBlockerGrid
                  missing={counts.compose.missing}
                  onOpenBeat={onOpenBeat}
                  t={t}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BeatBlockerGrid — lightweight cards, no amber container ────────

function BeatBlockerGrid({
  missing,
  onOpenBeat,
  t,
}: {
  missing: EpisodeComposePageController["counts"]["compose"]["missing"];
  onOpenBeat(beatNumber: number): void;
  t: TFn;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 pb-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {missing.map(({ beatNum, stages }) => (
        <button
          key={beatNum}
          type="button"
          onClick={() => onOpenBeat(beatNum)}
          className="group relative flex min-h-[92px] flex-col rounded-[8px] border border-border bg-card px-6 py-3.5 text-left transition-all duration-[350ms] hover:scale-[1.015] hover:border-primary/30 hover:bg-primary/[0.06]"
        >
          <ArrowUpRight className="absolute right-3 top-3 size-3.5 text-muted-foreground opacity-0 transition-opacity duration-[350ms] group-hover:opacity-100" />
          <div className="space-y-2.5">
            <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("episode.compose.beatLabel")}
            </span>
            <span className="block text-2xl font-semibold tabular-nums leading-none text-foreground">
              {beatNum}
            </span>
          </div>
          <p className="mt-2.5 text-xs leading-4 text-muted-foreground">
            {t("episode.compose.missingItems", {
              items: stages
                .map((s) => t(`episode.stage.${s}`))
                .join(t("episode.compose.missingItemSeparator")),
            })}
          </p>
        </button>
      ))}
    </div>
  );
}
