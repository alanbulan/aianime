// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useScopedTaskBatchInvalidation } from "@/modules/task_execution/public";
import { useTaskController } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES, isActiveStatus } from "@/modules/task_execution/public";
import type { Beat } from "@/modules/narrative_planning/public";
import type {
  ProductionDataResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import type { GenerateAudioCommand } from "@/modules/production/domain/audio-generation";
import type { AudioModelOption } from "@/modules/model_usage/public";
import type {
  SketchAspectRatio,
  SketchSettingsData,
} from "@/modules/production/domain/image-settings";
import {
  SKETCH_REGEN_MODES,
  createSingleSketchRegenQueueItems,
  createSketchRegenPlanItems,
  getBatchPanelActionDisabled,
  getLockedSketchRegenItemIds,
  overflowBatchCount,
  singleSketchModeForAspect,
  sketchRegenModelCallCount,
  type SketchRegenQueueData,
  type SketchRegenQueueItem,
} from "@/modules/production/domain/sketch-regen-queue";
import type { RegenerateSketchesCommand } from "@/modules/production/domain/sketch-generation";
import type { TaskState } from "@/modules/task_execution/public";

interface GenerateAudioMutation {
  isPending: boolean;
  mutateAsync(
    command: GenerateAudioCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface RegenerateSketchesMutation {
  isPending: boolean;
  mutateAsync(
    command: RegenerateSketchesCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface SaveSketchQueueMutation {
  isPending: boolean;
  mutate(items: SketchRegenQueueItem[]): void;
}

interface SketchQueueQuery {
  data?:
    | ProductionDataResponse<SketchRegenQueueData>
    | ProductionErrorResponse;
}

interface SketchSettingsQuery {
  data?: ProductionDataResponse<SketchSettingsData>;
}

interface CreditCostQuery {
  data?: { data: { cost?: number } };
}

interface TaskListQuery {
  data?: { data: TaskState[] };
}

export interface BatchPanelControllerQueries {
  useAudioModels(mode: "speech", enabled?: boolean): {
    data: AudioModelOption[];
    isLoading: boolean;
  };
  useGenerateAudio(project: string, episode: number): GenerateAudioMutation;
  useRegenerateSketches(
    project: string,
    episode: number,
  ): RegenerateSketchesMutation;
  useSaveSketchRegenQueue(
    project: string,
    episode: number,
  ): SaveSketchQueueMutation;
  useSketchRegenQueue(project: string, episode: number): SketchQueueQuery;
  useSketchSettings(project: string): SketchSettingsQuery;
}

export interface BatchPanelControllerDependencies {
  formatCreditCost(cost: number): string;
  removeStoredValue(key: string): void;
  useGenerationCreditCost(
    kind: "image_selection",
    value: string | undefined,
    options: {
      imageRole: "sketch";
      modeKey: string;
      surface: "ai_anime";
    },
  ): CreditCostQuery;
  useTasks(filter: { project: string; episode: number }): TaskListQuery;
}

export interface BatchPanelControllerOptions {
  beats: Beat[];
  checkedBeats: ReadonlySet<number>;
  episode: number;
  isSeedance2Backend: boolean;
  onClearSelection(): void;
  project: string;
  sketchAspect: SketchAspectRatio;
}

export function createUseBatchPanelController(
  queries: BatchPanelControllerQueries,
  dependencies: BatchPanelControllerDependencies,
) {
  return function useBatchPanelController({
    beats,
    checkedBeats,
    episode,
    isSeedance2Backend,
    onClearSelection,
    project,
    sketchAspect,
  }: BatchPanelControllerOptions) {
    const { t } = useTranslation();
    const regenerateSketches = queries.useRegenerateSketches(project, episode);
    const generateAudio = queries.useGenerateAudio(project, episode);
    const audioModels = queries.useAudioModels("speech", Boolean(project));
    const audioModel = audioModels.data[0]?.value ?? "";
    const sketchSettings = queries.useSketchSettings(project);
    const sketchCostMode = singleSketchModeForAspect(sketchAspect);
    const sketchCost = dependencies.useGenerationCreditCost(
      "image_selection",
      sketchSettings.data?.data.sketch_image_selection,
      {
        surface: "ai_anime",
        imageRole: "sketch",
        modeKey: sketchCostMode.key,
      },
    );
    const tasks = dependencies.useTasks({ project, episode });
    const queueQuery = queries.useSketchRegenQueue(project, episode);
    const saveQueue = queries.useSaveSketchRegenQueue(project, episode);
    const audioTask = useTaskController({
      key: {
        taskType: TASK_TYPES.AUDIO_GENERATION_INDEXTTS2,
        project,
        episode,
      },
      alsoReconcile: [TASK_TYPES.AUDIO_GENERATION],
      invalidateKeys: [
        queryKeys.beats(project, episode),
        queryKeys.pipelineStatus(project),
      ],
    });
    // Render execution fans out into selected_regen tasks identified by task id.
    const { track: trackRenderTask } = useScopedTaskBatchInvalidation({
      project,
      taskType: TASK_TYPES.SELECTED_REGEN,
      matchBy: "task_id",
      invalidateKeys: [
        queryKeys.grids(project, episode),
        queryKeys.beats(project, episode),
        queryKeys.pipelineStatus(project),
      ],
    });
    // Sketch plans fan out into scoped tasks; every scope must invalidate on completion.
    const { track: trackSketchRegeneration } =
      useScopedTaskBatchInvalidation({
        project,
        taskType: TASK_TYPES.SKETCH_REGEN,
        invalidateKeys: [
          queryKeys.grids(project, episode),
          queryKeys.beats(project, episode),
          queryKeys.pipelineStatus(project),
        ],
      });

    const [renderPlanOpen, setRenderPlanOpen] = useState(false);
    const [renderPlanForceOneByOne, setRenderPlanForceOneByOne] =
      useState(false);
    const [sketchPlanOpen, setSketchPlanOpen] = useState(false);
    const sketchQueueStorageKey =
      `st.sketch-regen-queue.${project}.${episode}`;
    const [clearedLegacySketchQueue, setClearedLegacySketchQueue] =
      useState(false);

    useEffect(() => {
      dependencies.removeStoredValue(sketchQueueStorageKey);
    }, [sketchQueueStorageKey]);

    useEffect(() => {
      if (!queueQuery.data?.ok) return;
      if (clearedLegacySketchQueue) return;
      if (queueQuery.data.data.items.length === 0) return;
      dependencies.removeStoredValue(sketchQueueStorageKey);
      saveQueue.mutate([]);
      setClearedLegacySketchQueue(true);
    }, [
      clearedLegacySketchQueue,
      queueQuery.data,
      saveQueue,
      sketchQueueStorageKey,
    ]);

    const beatNumbers = [...checkedBeats].sort((a, b) => a - b);
    const count = beatNumbers.length;
    const sketchPlanItems = useMemo(
      () => createSketchRegenPlanItems(beats, beatNumbers, sketchAspect),
      [beatNumbers, beats, sketchAspect],
    );
    const singleSketchPlanItems = useMemo(
      () =>
        createSingleSketchRegenQueueItems(
          beats,
          beatNumbers,
          sketchAspect,
        ),
      [beatNumbers, beats, sketchAspect],
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
      return dependencies.formatCreditCost(
        unitCost * sketchRegenModelCallCount(sketchPlanItems),
      );
    }, [sketchCost.data?.data.cost, sketchPlanItems]);
    const selectedVideoRunning = useMemo(() => {
      if (beatNumbers.length === 0) return false;
      const selectedBeatNumbers = new Set(beatNumbers);
      return (
        tasks.data?.data.some(
          (task) =>
            task.task_type === TASK_TYPES.SINGLE_VIDEO &&
            isActiveStatus(task.status) &&
            task.beat_num != null &&
            selectedBeatNumbers.has(task.beat_num),
        ) ?? false
      );
    }, [beatNumbers, tasks.data?.data]);

    const clearSketchRegenQueue = () => {
      dependencies.removeStoredValue(sketchQueueStorageKey);
      saveQueue.mutate([]);
    };

    const dispatchSketchPlanItems = async (
      items: readonly SketchRegenQueueItem[],
    ) => {
      if (items.length === 0) return;
      const dispatchableItems = items.filter(
        (item) => !lockedSketchItemIds.has(item.id),
      );
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
      let successfulBeats = 0;
      let successfulGrids = 0;
      let failedGrids = 0;
      let firstError = "";
      const dispatchedItems: SketchRegenQueueItem[] = [];

      for (const item of dispatchableItems) {
        try {
          const response = await regenerateSketches.mutateAsync({
            beatIndices: item.beatNumbers,
            modeKey: item.modeKey,
          });
          if (response.ok === false) {
            failedGrids++;
            firstError ||=
              response.error || t("episode.workbench.batch.dispatchFailed");
            continue;
          }
          successfulGrids++;
          successfulBeats += item.beatNumbers.length;
          dispatchedItems.push(item);
          trackSketchRegeneration(response.scope);
        } catch {
          failedGrids++;
          firstError ||= t("episode.workbench.batch.dispatchFailed");
        }
      }

      if (successfulGrids > 0) {
        const batches = dispatchedItems.reduce((sum, item) => {
          const mode = SKETCH_REGEN_MODES.find(
            (candidate) => candidate.key === item.modeKey,
          );
          return (
            sum +
            (mode
              ? overflowBatchCount(mode, item.beatNumbers.length)
              : 1)
          );
        }, 0);
        const label = t("episode.workbench.batch.sketch");
        toast.success(
          t("episode.workbench.batch.dispatched", {
            count: successfulBeats,
            mode:
              successfulGrids === 1
                ? dispatchedItems[0].modeLabel
                : `${successfulGrids} grids`,
          }) +
            (batches > successfulGrids
              ? t("episode.workbench.batch.dispatchedBatch", { batches })
              : "") +
            " (" +
            label +
            ")",
        );
        onClearSelection();
      }

      if (failedGrids > 0 && successfulGrids === 0 && firstError) {
        toast.error(firstError);
      } else if (failedGrids > 0) {
        toast.warning(
          `${t("episode.workbench.batch.videoPartial", {
            ok: successfulGrids,
            fail: failedGrids,
          })}${firstError ? `: ${firstError}` : ""}`,
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

    const onDispatchSingleSketches = () => {
      void dispatchSketchPlanItems(singleSketchPlanItems);
    };

    const onOpenSketchPlan = () => {
      clearSketchRegenQueue();
      setSketchPlanOpen(true);
    };

    const onConfirmSketchPlan = () => {
      setSketchPlanOpen(false);
      void dispatchSketchPlanItems(sketchPlanItems);
    };

    const onOpenRenderPlan = (forceOneByOne: boolean) => {
      setRenderPlanForceOneByOne(forceOneByOne);
      setRenderPlanOpen(true);
    };

    const onBatchAudio = async () => {
      if (!audioModel) {
        toast.error(t("episode.workbench.audio.modelUnavailable"));
        return;
      }
      try {
        const response = await generateAudio.mutateAsync({
          model: audioModel,
          beatNumbers,
          mode: "redo_selected",
        });
        if (response.ok === false) {
          toast.error(
            response.error || t("episode.workbench.batch.dispatchFailed"),
          );
          return;
        }
        audioTask.start({ scope: response.scope });
        toast.success(
          t("episode.workbench.batch.audioDispatched", { count }),
        );
        onClearSelection();
      } catch {
        toast.error(t("episode.workbench.batch.dispatchFailed"));
      }
    };

    const onRenderDispatched = (taskIds: string[]) => {
      taskIds.forEach((taskId) => trackRenderTask(taskId));
      toast.success(t("episode.renderPlan.dispatched"));
      onClearSelection();
    };

    const actionDisabled = getBatchPanelActionDisabled({
      count,
      regenSketchesPending: regenerateSketches.isPending,
      sketchTaskStarted: false,
      saveSketchQueuePending: saveQueue.isPending,
      generateAudioPending: generateAudio.isPending,
      audioTaskStarted: audioTask.started,
      renderPlanTaskStarted: false,
      selectedVideoRunning,
    });
    if (audioModels.isLoading || !audioModel) {
      actionDisabled.audio = true;
    }

    return {
      actionDisabled,
      audioPending: generateAudio.isPending || audioTask.started,
      beatNumbers,
      isSeedance2Backend,
      lockedSketchItemIds,
      onBatchAudio,
      onClearSelection,
      onConfirmSketchPlan,
      onDispatchSingleSketches,
      onOpenRenderPlan,
      onOpenSketchPlan,
      onRenderDispatched,
      onRenderPlanOpenChange: setRenderPlanOpen,
      onSketchPlanOpenChange: setSketchPlanOpen,
      renderPlanForceOneByOne,
      renderPlanOpen,
      singleSketchUnlockedCount,
      sketchPlanCostDisplay,
      sketchPlanItems,
      sketchPlanOpen,
      sketchPlanUnlockedCount,
    };
  };
}

export type BatchPanelController = ReturnType<
  ReturnType<typeof createUseBatchPanelController>
>;
