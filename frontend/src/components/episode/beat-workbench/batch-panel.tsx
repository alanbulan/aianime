// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Grid2X2,
  Image as ImageIcon,
  Loader2,
  Mic2,
  Pencil,
  Square,
  X,
} from "lucide-react";

import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
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
import { useTaskController } from "@/hooks/use-task-controller";
import { useScopedTaskBatchInvalidation } from "@/hooks/use-scoped-task-batch-invalidation";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES, isActiveStatus } from "@/lib/task-types";
import { useTasks } from "@/lib/queries/tasks";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { CreditCostInline } from "@/components/credit-cost-inline";
import { formatCreditCost } from "@/components/credits/credit-visual";
import { RenderPlanDialog } from "./render-plan-dialog";
import type { Beat } from "@/modules/narrative_planning/public";
import {
  SKETCH_REGEN_MODES,
  createSingleSketchRegenQueueItems,
  createSketchRegenPlanItems,
  getBatchPanelActionDisabled,
  getLockedSketchRegenItemIds,
  overflowBatchCount,
  singleSketchModeForAspect,
  sketchPlanGridLabel,
  sketchRegenModelCallCount,
  type SketchRegenQueueItem,
  useGenerateAudio,
  useRegenerateSketches,
  useSaveSketchRegenQueue,
  useSketchRegenQueue,
  useSketchSettings,
} from "@/modules/production/public";

interface BatchPanelProps {
  checkedBeats: Set<number>;
  beats: Beat[];
  project: string;
  episode: number;
  isSeedance2Backend?: boolean;
  onClearSelection: () => void;
}

export function BatchPanel({
  checkedBeats,
  beats,
  project,
  episode,
  isSeedance2Backend = false,
  onClearSelection,
}: BatchPanelProps) {
  const { t } = useTranslation();
  const { spec } = useProjectAspectRatio(project);
  const regenSketches = useRegenerateSketches(project, episode);
  const generateAudio = useGenerateAudio(project, episode);
  const sketchSettings = useSketchSettings(project);
  const sketchCostMode = singleSketchModeForAspect(spec.sketchAspect);
  const sketchCost = useGenerationCreditCost(
    "image_selection",
    sketchSettings.data?.data.sketch_image_selection,
    { surface: "ai_anime", imageRole: "sketch", modeKey: sketchCostMode.key },
  );
  const tasks = useTasks({ project, episode });
  const queueQuery = useSketchRegenQueue(project, episode);
  const saveQueue = useSaveSketchRegenQueue(project, episode);
  const audioTask = useTaskController({
    key: { taskType: TASK_TYPES.AUDIO_GENERATION_INDEXTTS2, project, episode },
    alsoReconcile: [TASK_TYPES.AUDIO_GENERATION],
    invalidateKeys: [
      queryKeys.beats(project, episode),
      queryKeys.pipelineStatus(project),
    ],
  });
  // One render `execute` fans out into N `selected_regen` grid tasks (returning
  // only a non-matching umbrella `location__…` scope), so a single controller
  // can't follow them all. Track every grid task by its id instead.
  const { track: trackRenderTask } = useScopedTaskBatchInvalidation({
    project,
    taskType: TASK_TYPES.SELECTED_REGEN,
    matchBy: "task_id",
    invalidateKeys: [
      queryKeys.grids(project, episode),
      queryKeys.beats(project, episode),
      queryKeys.sketchImageUsage(project, episode),
      queryKeys.pipelineStatus(project),
    ],
  });
  // A batch dispatches one `sketch_regen` task per grid, each with its own
  // server-assigned scope. A single `useTaskController` follows only one scope,
  // so track the whole set by scope membership — every grid's completion then
  // refreshes the page instead of just the last dispatched one.
  const { track: trackSketchRegen } = useScopedTaskBatchInvalidation({
    project,
    taskType: TASK_TYPES.SKETCH_REGEN,
    invalidateKeys: [
      queryKeys.grids(project, episode),
      queryKeys.beats(project, episode),
      queryKeys.pipelineStatus(project),
    ],
  });

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [renderPlanForceOneByOne, setRenderPlanForceOneByOne] = useState(false);
  const [sketchPlanOpen, setSketchPlanOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);
  const sketchQueueStorageKey = `st.sketch-regen-queue.${project}.${episode}`;
  const [clearedLegacySketchQueue, setClearedLegacySketchQueue] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem(sketchQueueStorageKey);
    } catch {
      /* ignore */
    }
  }, [sketchQueueStorageKey]);

  useEffect(() => {
    if (!queueQuery.data?.ok) return;
    if (clearedLegacySketchQueue) return;
    if (queueQuery.data.data.items.length === 0) return;
    try {
      localStorage.removeItem(sketchQueueStorageKey);
    } catch {
      /* ignore */
    }
    saveQueue.mutate([]);
    setClearedLegacySketchQueue(true);
  }, [clearedLegacySketchQueue, queueQuery.data, saveQueue, sketchQueueStorageKey]);

  const beatList = [...checkedBeats].sort((a, b) => a - b);
  const count = beatList.length;
  const sketchPlanItems = useMemo(
    () => createSketchRegenPlanItems(
      beats,
      beatList,
      spec.sketchAspect,
    ),
    [beatList, beats, spec.sketchAspect],
  );
  const singleSketchPlanItems = useMemo(
    () => createSingleSketchRegenQueueItems(beats, beatList, spec.sketchAspect),
    [beatList, beats, spec.sketchAspect],
  );
  const lockedSketchItemIds = useMemo(
    () =>
      getLockedSketchRegenItemIds(
        tasks.data?.data,
        [...singleSketchPlanItems, ...sketchPlanItems],
        (task) =>
          task.task_type === TASK_TYPES.SKETCH_REGEN &&
          isActiveStatus(task.status),
      ),
    [singleSketchPlanItems, sketchPlanItems, tasks.data?.data],
  );
  const singleSketchUnlockedCount = singleSketchPlanItems.filter(
    (item) => !lockedSketchItemIds.has(item.id),
  ).length;
  const sketchPlanUnlockedCount = sketchPlanItems.filter(
    (item) => !lockedSketchItemIds.has(item.id),
  ).length;
  const sketchPlanCostDisplay = useMemo(() => {
    const unitCost = sketchCost.data?.data.cost;
    if (typeof unitCost !== "number") return null;
    return formatCreditCost(unitCost * sketchRegenModelCallCount(sketchPlanItems));
  }, [sketchCost.data?.data.cost, sketchPlanItems]);
  const selectedVideoRunning = useMemo(() => {
    if (beatList.length === 0) return false;
    const selectedBeatNumbers = new Set(beatList);
    return (
      tasks.data?.data.some(
        (task) =>
          task.task_type === TASK_TYPES.SINGLE_VIDEO &&
          isActiveStatus(task.status) &&
          task.beat_num !== undefined &&
          selectedBeatNumbers.has(task.beat_num),
      ) ?? false
    );
  }, [beatList, tasks.data?.data]);
  const clearSketchRegenQueue = () => {
    try {
      localStorage.removeItem(sketchQueueStorageKey);
    } catch {
      /* ignore */
    }
    saveQueue.mutate([]);
  };

  const dispatchSketchPlanItems = async (items: SketchRegenQueueItem[]) => {
    if (items.length === 0) return;
    const dispatchableItems = items.filter((item) => !lockedSketchItemIds.has(item.id));
    const skippedLocked = items.length - dispatchableItems.length;
    if (dispatchableItems.length === 0) {
      toast.warning(
        t("episode.workbench.batch.sketchGroupRunning", {
          defaultValue: "相同草图组正在运行中",
        }),
      );
      return;
    }

    clearSketchRegenQueue();
    let okBeats = 0;
    let okGrids = 0;
    let fail = 0;
    let firstError = "";
    const dispatchedItems: SketchRegenQueueItem[] = [];

    for (const item of dispatchableItems) {
      try {
        const res = await regenSketches.mutateAsync({
          beatIndices: item.beatNumbers,
          modeKey: item.modeKey,
        });
        if (res.ok === false) {
          fail++;
          firstError ||= res.error || t("episode.workbench.batch.dispatchFailed");
          continue;
        }
        okGrids++;
        okBeats += item.beatNumbers.length;
        dispatchedItems.push(item);
        trackSketchRegen(res.scope);
      } catch {
        fail++;
        firstError ||= t("episode.workbench.batch.dispatchFailed");
      }
    }

    if (okGrids > 0) {
      const batches = dispatchedItems.reduce((sum, item) => {
        const mode = SKETCH_REGEN_MODES.find((candidate) => candidate.key === item.modeKey);
        return sum + (mode ? overflowBatchCount(mode, item.beatNumbers.length) : 1);
      }, 0);
      const label = t("episode.workbench.batch.sketch");
      toast.success(
        t("episode.workbench.batch.dispatched", {
          count: okBeats,
          mode: okGrids === 1 ? dispatchedItems[0].modeLabel : `${okGrids} grids`,
        }) +
          (batches > okGrids
            ? t("episode.workbench.batch.dispatchedBatch", { batches })
            : "") +
          " (" +
          label +
          ")",
      );
      onClearSelection();
    }

    if (fail > 0 && okGrids === 0 && firstError) {
      toast.error(firstError);
    } else if (fail > 0) {
      toast.warning(
        `${t("episode.workbench.batch.videoPartial", { ok: okGrids, fail })}${
          firstError ? `: ${firstError}` : ""
        }`,
      );
    }
    if (skippedLocked > 0) {
      toast.warning(
        t("episode.workbench.batch.sketchGroupSkippedRunning", {
          count: skippedLocked,
          defaultValue: `已跳过 ${skippedLocked} 个正在运行的草图组`,
        }),
      );
    }
  };

  const handleDispatchSingleSketches = () => {
    void dispatchSketchPlanItems(singleSketchPlanItems);
  };

  const openSketchPlan = () => {
    clearSketchRegenQueue();
    setSketchPlanOpen(true);
  };

  const handleConfirmSketchPlan = () => {
    setSketchPlanOpen(false);
    void dispatchSketchPlanItems(sketchPlanItems);
  };

  const openRenderPlan = (forceOneByOne: boolean) => {
    setRenderPlanForceOneByOne(forceOneByOne);
    setPlanDialogOpen(true);
  };

  const handleBatchAudio = async () => {
    try {
      const res = await generateAudio.mutateAsync({
        beatNumbers: beatList,
        mode: "redo_selected",
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.batch.dispatchFailed"));
        return;
      }
      audioTask.start({ scope: res.scope });
      toast.success(t("episode.workbench.batch.audioDispatched", { count }));
      onClearSelection();
    } catch {
      toast.error(t("episode.workbench.batch.dispatchFailed"));
    }
  };

  const actionDisabled = getBatchPanelActionDisabled({
    count,
    regenSketchesPending: regenSketches.isPending,
    sketchTaskStarted: false,
    saveSketchQueuePending: saveQueue.isPending,
    generateAudioPending: generateAudio.isPending,
    audioTaskStarted: audioTask.started,
    renderPlanTaskStarted: false,
    selectedVideoRunning,
  });

  const askConfirm = (title: string, description: string, onConfirm: () => void) => {
    setConfirm({ title, description, onConfirm });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{t("episode.workbench.batch.selectedCount", { count })}</span>
          <span className="text-[10px] text-muted-foreground">
            #{beatList.join(", #")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t("episode.workbench.batch.clearSelection")}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("episode.workbench.batch.batchRegen")}
          </h4>

          {/* Sketch modes */}
          <div className="flex flex-col rounded-lg border border-border p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Pencil className="size-3" />
              <span>{t("episode.workbench.batch.sketch")}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={actionDisabled.sketch || singleSketchUnlockedCount === 0}
                onClick={() => {
                  askConfirm(
                    t("episode.workbench.batch.regenSketchSingleTitle", {
                      count,
                      defaultValue: "单张重抽草图",
                    }),
                    t("episode.workbench.batch.regenSketchSingleDesc", {
                      beats: beatList.join(", #"),
                      defaultValue: "按当前画幅把选中 beats 拆成 1x1 草图任务。",
                    }),
                    handleDispatchSingleSketches,
                  );
                }}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Square className="size-3" />
                {t("episode.workbench.batch.singleRegen", {
                  defaultValue: "单张重抽",
                })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={actionDisabled.sketch || sketchPlanUnlockedCount === 0}
                onClick={openSketchPlan}
                className="relative h-7 gap-1 rounded-[8px] border-[3px] border-primary px-2 pr-9 text-[11px] transition-transform hover:border-primary hover:bg-transparent active:scale-95"
              >
                <Grid2X2 className="size-3" />
                {t("episode.workbench.batch.autoCombine", {
                  defaultValue: "批量重抽",
                })}
                <CreditCostInline display={sketchPlanCostDisplay} />
              </Button>
            </div>
          </div>

          <AlertDialog open={sketchPlanOpen} onOpenChange={setSketchPlanOpen}>
            <AlertDialogContent className="max-w-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("episode.sketchPlan.title", {
                    beats: count,
                    grids: sketchPlanItems.length,
                    defaultValue: `草图计划（${count} beats → ${sketchPlanItems.length} 个网格）`,
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("episode.sketchPlan.subtitle", {
                    defaultValue: "系统已根据场景自动分组。确认后会直接发配草图任务。",
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="max-h-[45vh] overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {sketchPlanItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex w-[170px] shrink-0 flex-col gap-1 rounded-[6px] border border-border bg-muted p-2 text-xs ${
                        lockedSketchItemIds.has(item.id) ? "opacity-50" : ""
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

              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="outline"
                  disabled={
                    actionDisabled.sketch ||
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

          {/* Render modes */}
          <div className="rounded-lg border border-border p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="size-3" />
              <span>{t("episode.workbench.batch.render")}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={actionDisabled.render}
                onClick={() => openRenderPlan(true)}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Square className="size-3" />
                {t("episode.workbench.batch.singleRegen", {
                  defaultValue: "单张重抽",
                })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={actionDisabled.render}
                onClick={() => openRenderPlan(false)}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Grid2X2 className="size-3" />
                {t("episode.workbench.batch.autoCombine", {
                  defaultValue: "自动组合",
                })}
              </Button>
            </div>
          </div>

          <RenderPlanDialog
            open={planDialogOpen}
            onOpenChange={setPlanDialogOpen}
            project={project}
            episode={episode}
            beatIndices={beatList}
            aspectMode={spec.renderAspect}
            defaultForceOneByOne={renderPlanForceOneByOne}
            onDispatched={(taskIds) => {
              taskIds.forEach((id) => trackRenderTask(id));
              toast.success(t("episode.renderPlan.dispatched"));
              onClearSelection();
            }}
          />

          {!isSeedance2Backend && (
            <div className="rounded-lg border border-border p-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mic2 className="size-3" />
                <span>{t("episode.workbench.batch.audio")}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={actionDisabled.audio}
                onClick={() => askConfirm(
                  t("episode.workbench.batch.genBatchAudioTitle", { count }),
                  t("episode.workbench.batch.genBatchAudioDesc", { beats: beatList.join(", #") }),
                  handleBatchAudio,
                )}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                {generateAudio.isPending || audioTask.started ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
                {t("episode.workbench.batch.genBatchAudio", { count })}
              </Button>
            </div>
          )}

        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          {t("episode.workbench.batch.batchHint")}
        </p>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
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
