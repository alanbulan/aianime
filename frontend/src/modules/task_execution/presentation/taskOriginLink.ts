// Copyright (c) 2026 AI anime
import type { TaskState } from "@/modules/task_execution/domain/contracts";
import { episodeRouteSegmentForTaskType } from "@/modules/task_execution/domain/taskOrigin";

export interface TaskOriginLink {
  to: string;
  params: Record<string, string>;
}

export function taskOriginLink(task: TaskState): TaskOriginLink | null {
  const routeSegment = episodeRouteSegmentForTaskType(task.task_type);
  if (!routeSegment) return null;
  return {
    to: `/projects/$project/episodes/$episode${routeSegment}`,
    params: {
      project: task.project_id ?? task.project,
      episode: String(task.episode),
    },
  };
}
