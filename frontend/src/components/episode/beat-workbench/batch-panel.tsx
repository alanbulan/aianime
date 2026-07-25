// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import { useTaskController } from "@/hooks/use-task-controller";
import { useScopedTaskBatchInvalidation } from "@/hooks/use-scoped-task-batch-invalidation";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES, isActiveStatus } from "@/lib/task-types";
import { useTasks } from "@/lib/queries/tasks";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { formatCreditCost } from "@/components/credits/credit-visual";
import { RenderPlanDialog } from "./render-plan-dialog";
import type { Beat } from "@/modules/narrative_planning/public";
import {
  BatchPanelView,
  SKETCH_REGEN_MODES,
  createSingleSketchRegenQueueItems,
  createSketchRegenPlanItems,
  getBatchPanelActionDisabled,
  getLockedSketchRegenItemIds,
  overflowBatchCount,
  singleSketchModeForAspect,
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

  return (
    <BatchPanelView
      actionDisabled={actionDisabled}
      audioPending={generateAudio.isPending || audioTask.started}
      beatNumbers={beatList}
      isSeedance2Backend={isSeedance2Backend}
      lockedSketchItemIds={lockedSketchItemIds}
      renderPlanDialog={
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
      }
      singleSketchUnlockedCount={singleSketchUnlockedCount}
      sketchPlanCostDisplay={sketchPlanCostDisplay}
      sketchPlanItems={sketchPlanItems}
      sketchPlanOpen={sketchPlanOpen}
      sketchPlanUnlockedCount={sketchPlanUnlockedCount}
      onBatchAudio={() => void handleBatchAudio()}
      onClearSelection={onClearSelection}
      onConfirmSketchPlan={handleConfirmSketchPlan}
      onDispatchSingleSketches={handleDispatchSingleSketches}
      onOpenRenderPlan={openRenderPlan}
      onOpenSketchPlan={openSketchPlan}
      onSketchPlanOpenChange={setSketchPlanOpen}
    />
  );
}
