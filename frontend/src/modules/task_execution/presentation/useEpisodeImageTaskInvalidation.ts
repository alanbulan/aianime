// Copyright (c) 2026 AI anime
import { useCallback } from "react";
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

  const invalidateEpisodeImageData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.grids(project, episode) });
    queryClient.invalidateQueries({ queryKey: queryKeys.beats(project, episode) });
    queryClient.invalidateQueries({ queryKey: queryKeys.pipelineStatus(project) });
  }, [episode, project, queryClient]);

  useTaskSubscribe({
    match: useCallback(
      (task) => matchesEpisodeImageTask(task, project, episode),
      [episode, project],
    ),
    onComplete: invalidateEpisodeImageData,
  });
}
