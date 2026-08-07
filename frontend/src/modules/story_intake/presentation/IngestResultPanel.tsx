// Copyright (c) 2026 AI anime
import { AlertTriangle, FileText, Network, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { KnowledgeGraphVisualization } from "@/components/ingest/KnowledgeGraphVisualization";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ETHNICITY_OPTIONS,
  NARRATION_STYLE_OPTIONS,
  SPINE_TEMPLATE_OPTIONS,
} from "@/modules/story_intake/application/options";
import type { StoryIntakeController } from "@/modules/story_intake/application/use-story-intake-controller";
import {
  ChapterPreviewSkeleton,
  INGEST_DIVIDER_CLASS,
  INGEST_SURFACE_SUBTLE_CLASS,
  KnowledgeGraphSkeleton,
  StatCard,
  UploadedFileCard,
  resolveOptionLabel,
} from "@/modules/story_intake/presentation/IngestPageParts";

export function IngestResultPanel({
  controller,
}: {
  controller: StoryIntakeController;
}) {
  const { t } = useTranslation();
  const {
    uploadedFile,
    ingestSubmitted,
    ingestError,
    ingestLogs,
    resultView,
    setResultView,
    setFormatCheckDetails,
    logsScrollRef,
    chaptersData,
    chaptersFetching,
    ingestFeatureCostDisplay,
    ingestStarted,
    reuploadConfirmOpen,
    setReuploadConfirmOpen,
    canViewKnowledgeGraph,
    knowledgeGraph,
    cancelTask,
    taskStream,
    visualStyleOptions,
    settingsValues,
    showNarrationStyle,
    handleReupload,
    handleDeleteFile,
    handleStartIngest,
    handleCancelIngest,
    chapters,
    chapterCount,
    previewFile,
    previewStatus,
    totalChars,
    billableChars,
    totalCharsUnknown,
    isStarting,
    chapterTitle,
  } = controller;

  return (
    <div className="min-w-0 space-y-6">
      {/* Upload zone OR uploaded file card */}
      {previewFile && (
        <UploadedFileCard
          filename={previewFile.filename}
          size={previewFile.size}
          status={previewStatus}
          progress={taskStream.progress}
          currentTask={taskStream.currentTask}
          error={ingestError}
          formatCheck={uploadedFile?.format_check ?? null}
          onViewFormatCheck={() => {
            if (!uploadedFile?.format_check) return;
            setFormatCheckDetails({
              formatCheck: uploadedFile.format_check,
              filename: uploadedFile.filename,
            });
          }}
          isIngesting={ingestStarted}
          canStart={!!uploadedFile && !ingestSubmitted}
          isStarting={isStarting}
          ingestCostDisplay={ingestFeatureCostDisplay}
          onStart={handleStartIngest}
          onCancel={handleCancelIngest}
          isCancelling={cancelTask.isPending}
          onReupload={() => setReuploadConfirmOpen(true)}
          onDelete={handleDeleteFile}
        />
      )}

      <AlertDialog
        open={reuploadConfirmOpen}
        onOpenChange={setReuploadConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ingest.reuploadConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ingest.reuploadConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setReuploadConfirmOpen(false);
                handleReupload();
              }}
            >
              {t("ingest.reuploadConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview — loading placeholder */}
      {!chaptersData && chaptersFetching && <ChapterPreviewSkeleton />}

      {/* Preview — empty state (file uploaded but no chapters detected) */}
      {chaptersData && chapterCount === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted p-8 text-center text-sm text-muted-foreground">
          {t("ingest.emptyPreview")}
        </div>
      )}

      {/* Preview — populated */}
      {chaptersData && chapterCount > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t("ingest.resultHeading")}
          </h2>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard
              label={t("ingest.statFilename")}
              value={
                <span
                  className="block truncate text-sm font-semibold"
                  title={previewFile?.filename}
                >
                  {previewFile?.filename ??
                    t("ingest.restoredFilename")}
                </span>
              }
            />
            <StatCard
              label={t("ingest.statTotalChars")}
              value={
                totalCharsUnknown
                  ? <span className="text-muted-foreground">—</span>
                  : totalChars.toLocaleString()
              }
            />
            <StatCard
              label={t("ingest.statBillableChars")}
              value={
                totalCharsUnknown
                  ? <span className="text-muted-foreground">—</span>
                  : billableChars.toLocaleString()
              }
            />
            <StatCard
              label={t("ingest.statChaptersDetected")}
              value={chapterCount}
            />
            <StatCard
              label={t("ingest.statEpisodesEstimated")}
              value={
                <span>
                  {chapterCount}{" "}
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("ingest.episodesUnit")}
                  </span>
                </span>
              }
            />
          </div>

          {/* Script details */}
          <div className={cn("overflow-hidden rounded-lg border p-4", INGEST_SURFACE_SUBTLE_CLASS)}>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("ingest.scriptDetails")}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: t("ingest.projectType"),
                  options: SPINE_TEMPLATE_OPTIONS,
                  value: settingsValues.spine_template,
                },
                {
                  label: t("ingest.visualStyle"),
                  options: visualStyleOptions,
                  value: settingsValues.visual_style,
                },
                ...(showNarrationStyle
                  ? [
                      {
                        label: t("ingest.narrationStyle"),
                        options: NARRATION_STYLE_OPTIONS,
                        value: settingsValues.narration_style,
                      },
                    ]
                  : []),
                {
                  label: t("ingest.ethnicity"),
                  options: ETHNICITY_OPTIONS,
                  value: settingsValues.ethnicity,
                },
              ].map((item) => {
                const label = resolveOptionLabel(
                  item.options,
                  item.value,
                  t,
                );
                return (
                  <div key={item.label} className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">
                      {label ?? item.value}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <Tabs
            value={resultView}
            onValueChange={(value) =>
              setResultView(value as "chapters" | "graph")
            }
            className="gap-3"
          >
            <TabsList aria-label={t("ingest.resultHeading")}>
              <TabsTrigger value="chapters" className="gap-1.5 px-3 text-xs">
                <FileText className="size-3.5" />
                {t("ingest.resultViews.chapters")}
              </TabsTrigger>
              {canViewKnowledgeGraph ? (
                <TabsTrigger value="graph" className="gap-1.5 px-3 text-xs">
                  <Network className="size-3.5" />
                  {t("ingest.resultViews.graph")}
                </TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="chapters">
              <div className={cn("overflow-hidden rounded-lg border", INGEST_SURFACE_SUBTLE_CLASS)}>
                <div className={cn("grid grid-cols-[4rem_1fr_5rem] items-center gap-2 border-b px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground", INGEST_DIVIDER_CLASS)}>
                  <span>{t("ingest.tableChapterNo")}</span>
                  <span>{t("ingest.tableTitle")}</span>
                  <span className="text-right">
                    {t("ingest.tableCharCount")}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {chapters.slice(0, 20).map((ch) => (
                    <div
                      key={ch.number}
                      className="grid grid-cols-[4rem_1fr_5rem] items-center gap-2 px-4 py-2.5 text-xs"
                    >
                      <span className="tabular-nums text-muted-foreground">
                        {ch.number}
                      </span>
                      <span className="truncate text-foreground">
                        {chapterTitle(ch.number, ch.title, ch.content)}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {(() => {
                          const count =
                            ch.word_count ??
                            ch.char_count ??
                            ch.content?.length;
                          return count != null
                            ? count.toLocaleString()
                            : "—";
                        })()}
                      </span>
                    </div>
                  ))}
                  {chapterCount > 20 && (
                    <div className="px-4 py-2.5 text-center text-xs text-muted-foreground">
                      {t("ingest.moreChapters", {
                        count: chapterCount - 20,
                      })}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {canViewKnowledgeGraph ? (
              <TabsContent value="graph">
                {knowledgeGraph.isLoading ? <KnowledgeGraphSkeleton /> : null}
                {knowledgeGraph.data ? (
                  <KnowledgeGraphVisualization graph={knowledgeGraph.data} />
                ) : null}
                {knowledgeGraph.isError ? (
                  <div className="flex min-h-32 items-center justify-between gap-4 rounded-lg border border-warning/45 bg-warning/10 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {t("ingest.knowledgeGraph.loadFailed")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("ingest.knowledgeGraph.loadFailedHint")}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => knowledgeGraph.refetch()}
                      className="shrink-0"
                    >
                      <RefreshCw className="size-3.5" />
                      {t("ingest.knowledgeGraph.retry")}
                    </Button>
                  </div>
                ) : null}
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      )}

      {/* Logs */}
      {ingestLogs.length > 0 && taskStream.status !== "idle" && (
        <div className="space-y-3">
          <div className={cn("overflow-hidden rounded-lg border", INGEST_SURFACE_SUBTLE_CLASS)}>
            <div className={cn("border-b px-4 py-2 text-xs font-medium text-muted-foreground", INGEST_DIVIDER_CLASS)}>
              {t("ingest.logsPanel")}
            </div>
            <ScrollArea ref={logsScrollRef} className="h-48">
              <div className="space-y-0.5 p-3">
                {ingestLogs.map((log, i) => (
                  <p
                    key={i}
                    className="font-mono text-xs text-muted-foreground"
                  >
                    <span className="mr-2 text-muted-foreground">
                      [{String(i + 1).padStart(2, "0")}]
                    </span>
                    {log}
                  </p>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
