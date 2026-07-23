// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useScopedTaskBatchInvalidation } from "@/hooks/use-scoped-task-batch-invalidation";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/lib/task-types";
import type { Beat } from "@/modules/narrative_planning/domain/types";
import type { Task } from "@/types/task";

export type SketchAspectRatio = "2:3" | "16:9";

export interface SketchPlanItem {
  id: string;
  beatNumbers: number[];
  modeKey: string;
  modeLabel: string;
  sceneIds: string[];
}

interface TaskListQuery {
  data?: { data: Task[] };
}

interface CreditCostQuery {
  data?: { data: { cost?: number } };
}

interface RegenerateSketchesMutation {
  mutateAsync(params: {
    beatIndices: number[];
    modeKey?: string;
  }): Promise<
    | { ok: true; scope?: string }
    | { ok: false; error?: string }
  >;
}

export interface BeatsSketchPlanControllerDependencies {
  createSketchPlanItems(
    beats: Beat[],
    beatNumbers: number[],
    aspectRatio: SketchAspectRatio,
  ): SketchPlanItem[];
  formatCreditCost(cost: number): string;
  getLockedSketchItemIds(
    tasks: Task[] | undefined,
    items: readonly SketchPlanItem[],
  ): Set<string>;
  sketchModelCallCount(items: readonly SketchPlanItem[]): number;
  useGenerationCreditCost(
    kind: string,
    value?: string | null,
    options?: {
      surface?: "ai_anime" | "canvas" | null;
      imageRole?: string | null;
      modeKey?: string | null;
    },
  ): CreditCostQuery;
  useRegenerateSketches(
    project: string,
    episode: number,
  ): RegenerateSketchesMutation;
  useTasks(filter: { project: string; episode: number }): TaskListQuery;
}

export interface BeatsSketchPlanControllerOptions {
  beats: Beat[];
  checkedBeatNumbers: number[];
  clearSelection(): void;
  episodeNumber: number;
  imageGenerationSelection?: string;
  project: string;
  sketchAspectRatio: SketchAspectRatio;
}

export function createUseBeatsSketchPlanController(
  dependencies: BeatsSketchPlanControllerDependencies,
) {
  return function useBeatsSketchPlanController(
    options: BeatsSketchPlanControllerOptions,
  ) {
    const {
      beats,
      checkedBeatNumbers,
      clearSelection,
      episodeNumber,
      imageGenerationSelection,
      project,
      sketchAspectRatio,
    } = options;
    const { t } = useTranslation();
    const regenerateSketches = dependencies.useRegenerateSketches(
      project,
      episodeNumber,
    );
    const tasks = dependencies.useTasks({ project, episode: episodeNumber });
    const sketchCostModeKey =
      sketchAspectRatio === "16:9" ? "1x1_16-9_sketch" : "1x1_2-3_sketch";
    const sketchCost = dependencies.useGenerationCreditCost(
      "image_selection",
      imageGenerationSelection,
      {
        surface: "ai_anime",
        imageRole: "sketch",
        modeKey: sketchCostModeKey,
      },
    );
    const { track: trackSketchRegeneration } =
      useScopedTaskBatchInvalidation({
        project,
        taskType: TASK_TYPES.SKETCH_REGEN,
        invalidateKeys: [
          queryKeys.grids(project, episodeNumber),
          queryKeys.beats(project, episodeNumber),
          queryKeys.pipelineStatus(project),
        ],
      });
    const { track: trackRenderTask } = useScopedTaskBatchInvalidation({
      project,
      taskType: TASK_TYPES.SELECTED_REGEN,
      matchBy: "task_id",
      invalidateKeys: [
        queryKeys.grids(project, episodeNumber),
        queryKeys.beats(project, episodeNumber),
        queryKeys.sketchImageUsage(project, episodeNumber),
        queryKeys.pipelineStatus(project),
      ],
    });

    const [sketchPlanOpen, setSketchPlanOpen] = useState(false);
    const [renderPlanOpen, setRenderPlanOpen] = useState(false);
    const sketchPlanItems = useMemo(
      () =>
        dependencies.createSketchPlanItems(
          beats,
          checkedBeatNumbers,
          sketchAspectRatio,
        ),
      [beats, checkedBeatNumbers, sketchAspectRatio],
    );
    const lockedSketchItemIds = useMemo(
      () =>
        dependencies.getLockedSketchItemIds(
          tasks.data?.data,
          sketchPlanItems,
        ),
      [sketchPlanItems, tasks.data?.data],
    );
    const sketchPlanUnlockedCount = sketchPlanItems.filter(
      (item) => !lockedSketchItemIds.has(item.id),
    ).length;
    const sketchPlanCostDisplay = useMemo(() => {
      const unitCost = sketchCost.data?.data.cost;
      if (typeof unitCost !== "number") return null;
      return dependencies.formatCreditCost(
        unitCost * dependencies.sketchModelCallCount(sketchPlanItems),
      );
    }, [sketchCost.data?.data.cost, sketchPlanItems]);

    const openSketchPlan = useCallback(() => {
      if (checkedBeatNumbers.length === 0) return;
      setSketchPlanOpen(true);
    }, [checkedBeatNumbers.length]);

    const openRenderPlan = useCallback(() => {
      if (checkedBeatNumbers.length === 0) return;
      setRenderPlanOpen(true);
    }, [checkedBeatNumbers.length]);

    const dispatchSketchPlanItems = useCallback(async () => {
      const dispatchableItems = sketchPlanItems.filter(
        (item) => !lockedSketchItemIds.has(item.id),
      );
      if (dispatchableItems.length === 0) {
        toast.warning(
          t("episode.workbench.batch.sketchGroupRunning", {
            defaultValue: "相同草图组正在运行中",
          }),
        );
        return;
      }

      let successfulBeats = 0;
      let successfulGrids = 0;
      let failedGrids = 0;
      let firstError = "";

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
          trackSketchRegeneration(response.scope);
        } catch {
          failedGrids++;
          firstError ||= t("episode.workbench.batch.dispatchFailed");
        }
      }

      if (successfulGrids > 0) {
        clearSelection();
        toast.success(
          t("episode.workbench.batch.dispatched", {
            count: successfulBeats,
            mode:
              successfulGrids === 1
                ? dispatchableItems[0].modeLabel
                : `${successfulGrids} grids`,
          }),
        );
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
    }, [
      clearSelection,
      lockedSketchItemIds,
      regenerateSketches,
      sketchPlanItems,
      t,
      trackSketchRegeneration,
    ]);

    const handleConfirmSketchPlan = useCallback(() => {
      setSketchPlanOpen(false);
      void dispatchSketchPlanItems();
    }, [dispatchSketchPlanItems]);

    const handleRenderDispatched = useCallback(
      (taskIds: string[]) => {
        taskIds.forEach((taskId) => trackRenderTask(taskId));
        toast.success(t("episode.renderPlan.dispatched"));
        clearSelection();
      },
      [clearSelection, t, trackRenderTask],
    );

    return {
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
    };
  };
}

export type BeatsSketchPlanController = ReturnType<
  ReturnType<typeof createUseBeatsSketchPlanController>
>;
