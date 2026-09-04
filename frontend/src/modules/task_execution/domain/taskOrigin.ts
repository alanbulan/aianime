// Copyright (c) 2026 AI anime
import {
  TASK_TYPES,
  type TaskType,
} from "@/modules/task_execution/domain/taskTypes";

export type TaskEpisodeStageId =
  | "script"
  | "sketch"
  | "audio"
  | "video"
  | "compose";

export type TaskEpisodeRouteSegment =
  | "/script"
  | "/sketches"
  | "/audio"
  | "/video"
  | "/compose";

export interface TaskEpisodeStageDefinition {
  readonly routeSegment: TaskEpisodeRouteSegment;
  readonly taskTypes: readonly TaskType[];
}

export const TASK_EPISODE_STAGES: Readonly<
  Record<TaskEpisodeStageId, TaskEpisodeStageDefinition>
> = {
  script: {
    routeSegment: "/script",
    taskTypes: [
      TASK_TYPES.SCRIPT_WRITER,
      TASK_TYPES.LITERAL_SCRIPT_WRITER,
      TASK_TYPES.DIRECTOR_NOTES,
      TASK_TYPES.IDENTITY_PLANNER,
    ],
  },
  sketch: {
    routeSegment: "/sketches",
    taskTypes: [
      TASK_TYPES.SKETCH_GENERATION,
      TASK_TYPES.BATCH_SKETCH,
      TASK_TYPES.SKETCH_REGEN,
      TASK_TYPES.GRID_REGENERATE,
    ],
  },
  audio: {
    routeSegment: "/audio",
    taskTypes: [
      TASK_TYPES.EPISODE_AUDIO_GENERATION,
      TASK_TYPES.AUDIO_GENERATION,
    ],
  },
  video: {
    routeSegment: "/video",
    taskTypes: [
      TASK_TYPES.BEAT_VIDEO_PROMPT,
      TASK_TYPES.VIDEO_PROMPT_OPTIMIZATION,
      TASK_TYPES.SINGLE_VIDEO,
      TASK_TYPES.GLOBAL_OPTIMIZE_VIDEO,
      TASK_TYPES.SELECTED_REGEN,
    ],
  },
  compose: {
    routeSegment: "/compose",
    taskTypes: [TASK_TYPES.COMPOSE_EPISODE],
  },
};

export function episodeRouteSegmentForTaskType(
  taskType: string,
): TaskEpisodeRouteSegment | null {
  for (const stage of Object.values(TASK_EPISODE_STAGES)) {
    if ((stage.taskTypes as readonly string[]).includes(taskType)) {
      return stage.routeSegment;
    }
  }
  return null;
}
