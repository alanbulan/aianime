// Copyright (c) 2026 AI anime
import { ScrollText, Pencil, Mic2, Video, Film, type LucideIcon } from "lucide-react";
import {
  TASK_EPISODE_STAGES,
  type TaskEpisodeRouteSegment,
  type TaskType,
} from "@/modules/task_execution/public";

export type StageId = "script" | "sketch" | "audio" | "video" | "compose";

export interface StageDef {
  id: StageId;
  labelKey: string;
  /** Path segment appended to `/projects/$project/episodes/$episode`. */
  routeSegment: TaskEpisodeRouteSegment;
  icon: LucideIcon;
  /** Backend task types that belong to this stage (any of these running → stage is busy). */
  taskTypes: readonly TaskType[];
  /** Hard prerequisites. All must be `ready` for this stage's primary action to unlock. */
  dependsOn: readonly StageId[];
  /** True if the stage supports per-beat navigation (drawer can open to it). */
  supportsBeatJump: boolean;
}

export const EPISODE_STAGE_REGISTRY: readonly StageDef[] = [
  {
    id: "script",
    labelKey: "episode.stage.script",
    routeSegment: TASK_EPISODE_STAGES.script.routeSegment,
    icon: ScrollText,
    taskTypes: TASK_EPISODE_STAGES.script.taskTypes,
    dependsOn: [],
    supportsBeatJump: true,
  },
  {
    id: "sketch",
    labelKey: "episode.stage.sketch",
    routeSegment: TASK_EPISODE_STAGES.sketch.routeSegment,
    icon: Pencil,
    taskTypes: TASK_EPISODE_STAGES.sketch.taskTypes,
    dependsOn: ["script"],
    supportsBeatJump: true,
  },
  {
    id: "audio",
    labelKey: "episode.stage.audio",
    routeSegment: TASK_EPISODE_STAGES.audio.routeSegment,
    icon: Mic2,
    taskTypes: TASK_EPISODE_STAGES.audio.taskTypes,
    dependsOn: ["script"],
    supportsBeatJump: true,
  },
  {
    id: "video",
    labelKey: "episode.stage.video",
    routeSegment: TASK_EPISODE_STAGES.video.routeSegment,
    icon: Video,
    taskTypes: TASK_EPISODE_STAGES.video.taskTypes,
    dependsOn: ["sketch"],
    supportsBeatJump: true,
  },
  {
    id: "compose",
    labelKey: "episode.stage.compose",
    routeSegment: TASK_EPISODE_STAGES.compose.routeSegment,
    icon: Film,
    taskTypes: TASK_EPISODE_STAGES.compose.taskTypes,
    dependsOn: ["sketch", "video", "audio"],
    supportsBeatJump: false,
  },
];

/**
 * Look up the stage that owns a given backend task_type. Returns undefined
 * for project-level task types (build_characters, ingest_fast, build_episodes).
 */
export function stageForTaskType(taskType: string): StageDef | undefined {
  return EPISODE_STAGE_REGISTRY.find((s) =>
    (s.taskTypes as readonly string[]).includes(taskType),
  );
}
