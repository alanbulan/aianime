// Copyright (c) 2026 AI anime
import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useTaskSubscribe } from "../public";
import type { TaskState } from "../public";

const EPISODE_IMAGE_TASK_TYPES = new Set([
  "sketch_generation",
  "sketch_regen",
  "selected_regen",
  "grid_regenerate",
  "global_optimize_video",
]);

const INCREMENTAL_IMAGE_TASK_TYPES = new Set([
  "sketch_regen",
  "selected_regen",
]);

const INCREMENTAL_GENERATION_PROGRESS_START = 0.2;

function matchesEpisodeImageTask(
  task: TaskState,
  project: string,
  episode: number,
) {
  if (task.episode !== episode) return false;
  if (!EPISODE_IMAGE_TASK_TYPES.has(task.task_type)) return false;
  if ((task.project_id ?? task.project) !== project) return false;
  return true;
}

export function useEpisodeImageTaskInvalidation(
  project: string,
  episode: number,
) {
  const queryClient = useQueryClient();
  const refreshedProgressRef = useRef(new Map<string, number>());

  const invalidateEpisodeImageData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.grids(project, episode) });
    queryClient.invalidateQueries({ queryKey: queryKeys.beats(project, episode) });
    queryClient.invalidateQueries({ queryKey: queryKeys.pipelineStatus(project) });
  }, [episode, project, queryClient]);

  const invalidateIncrementalImageData = useCallback(
    (task: TaskState) => {
      if (!INCREMENTAL_IMAGE_TASK_TYPES.has(task.task_type)) return;
      const previousProgress =
        refreshedProgressRef.current.get(task.task_id) ??
        INCREMENTAL_GENERATION_PROGRESS_START;
      if (task.progress <= previousProgress) return;
      refreshedProgressRef.current.set(task.task_id, task.progress);
      invalidateEpisodeImageData();
    },
    [invalidateEpisodeImageData],
  );

  const invalidateCompletedImageData = useCallback(
    (task: TaskState) => {
      refreshedProgressRef.current.delete(task.task_id);
      invalidateEpisodeImageData();
    },
    [invalidateEpisodeImageData],
  );

  useTaskSubscribe({
    match: useCallback(
      (task) => matchesEpisodeImageTask(task, project, episode),
      [episode, project],
    ),
    onProgress: invalidateIncrementalImageData,
    onComplete: invalidateCompletedImageData,
    onFailed: invalidateCompletedImageData,
  });
}
