// Copyright (c) 2026 AI anime
import {
  EPISODE_STAGE_REGISTRY,
  type StageDef,
  type StageId,
} from "@/lib/episode-stage-registry";
import {
  SCOPED_TASK_TYPES,
  type TaskStatus,
} from "@/modules/task_execution/public";

const ACTIVE_STATUSES = new Set([
  "submitting",
  "queued",
  "pending",
  "starting",
  "running",
]);
const BEAT_STAGES: Array<Exclude<StageId, "compose">> = [
  "script",
  "sketch",
  "audio",
  "video",
];
const STAGE_DEFINITIONS: Record<
  Exclude<StageId, "compose">,
  StageDef
> = {
  script: EPISODE_STAGE_REGISTRY.find((stage) => stage.id === "script")!,
  sketch: EPISODE_STAGE_REGISTRY.find((stage) => stage.id === "sketch")!,
  audio: EPISODE_STAGE_REGISTRY.find((stage) => stage.id === "audio")!,
  video: EPISODE_STAGE_REGISTRY.find((stage) => stage.id === "video")!,
};

/**
 * Per-beat per-stage derived state.
 * - missing: asset absent; no active task attributable to this beat/stage
 * - generating: active task matches this beat (scoped) OR is a batch and beat is still missing
 * - ready: asset present (URL non-null)
 * - failed: task terminal=failed AND task.beat_num === n AND asset still absent
 *
 * Note: `skipped` was considered (for 1.5-model audio bundling) but dropped —
 * compose currently requires an audio file for every beat regardless of video
 * model. See `docs/superpowers/specs/2026-04-14-episode-workbench-design.md`
 * Part 1 for derivation rules.
 */
export type BeatStageState = "missing" | "generating" | "ready" | "failed";

export type BeatStates = Record<
  number,
  Record<Exclude<StageId, "compose">, BeatStageState>
>;

export interface StageCount {
  /** Beats in `ready` state. */
  ready: number;
  /** Total beats considered — excludes a beat if state derivation had no inputs. */
  total: number;
  /** Beats with any non-ready state other than `missing` (generating + failed). */
  active: number;
  /** Beats in `failed` state. */
  failed: number;
}

export interface EpisodeCounts {
  script: StageCount;
  sketch: StageCount;
  audio: StageCount;
  video: StageCount;
  compose: {
    ready: boolean;
    missing: Array<{ beatNum: number; stages: Array<Exclude<StageId, "compose">> }>;
  };
}

export interface BeatStateSource {
  audio_url?: string | null;
  beat_number: number;
  sketch_url?: string | null;
  video_url?: string | null;
  visual_description?: string | null;
}

export interface BeatStateTaskSource {
  beat_num?: number | null;
  status: TaskStatus;
  task_type: string;
}

export function deriveBeatStates(
  beats: BeatStateSource[],
  tasks: BeatStateTaskSource[],
): BeatStates {
  const tasksByType = new Map<string, BeatStateTaskSource[]>();
  for (const task of tasks) {
    const bucket = tasksByType.get(task.task_type) ?? [];
    bucket.push(task);
    tasksByType.set(task.task_type, bucket);
  }

  const result: BeatStates = {};
  for (const beat of beats) {
    const stateForBeat: Record<
      Exclude<StageId, "compose">,
      BeatStageState
    > = {
      script: "missing",
      sketch: "missing",
      audio: "missing",
      video: "missing",
    };
    for (const stage of BEAT_STAGES) {
      stateForBeat[stage] = deriveStageState(
        stage,
        beat,
        tasksByType,
        STAGE_DEFINITIONS[stage],
      );
    }
    result[beat.beat_number] = stateForBeat;
  }
  return result;
}

function deriveStageState(
  stage: Exclude<StageId, "compose">,
  beat: BeatStateSource,
  tasksByType: Map<string, BeatStateTaskSource[]>,
  definition: StageDef,
): BeatStageState {
  if (
    (stage === "script" && beat.visual_description?.trim()) ||
    (stage === "sketch" && beat.sketch_url) ||
    (stage === "audio" && beat.audio_url) ||
    (stage === "video" && beat.video_url)
  ) {
    return "ready";
  }

  const relevantTasks = definition.taskTypes.flatMap(
    (taskType) => tasksByType.get(taskType) ?? [],
  );
  const activeTask = relevantTasks.find(
    (task) =>
      ACTIVE_STATUSES.has(task.status) &&
      (!isScopedTaskType(task.task_type) ||
        task.beat_num === beat.beat_number),
  );
  if (activeTask) return "generating";

  const failedTask = relevantTasks.find(
    (task) =>
      task.status === "failed" &&
      isScopedTaskType(task.task_type) &&
      task.beat_num === beat.beat_number,
  );
  return failedTask ? "failed" : "missing";
}

function isScopedTaskType(taskType: string): boolean {
  return SCOPED_TASK_TYPES.has(taskType as never);
}

export function deriveEpisodeCounts(
  states: BeatStates,
  totalBeats: number,
  requireAudio: boolean,
): EpisodeCounts {
  const perStage: Record<Exclude<StageId, "compose">, StageCount> = {
    script: { ready: 0, total: totalBeats, active: 0, failed: 0 },
    sketch: { ready: 0, total: totalBeats, active: 0, failed: 0 },
    audio: { ready: 0, total: totalBeats, active: 0, failed: 0 },
    video: { ready: 0, total: totalBeats, active: 0, failed: 0 },
  };

  for (const stageStates of Object.values(states)) {
    for (const stage of BEAT_STAGES) {
      const state = stageStates[stage];
      if (state === "ready") perStage[stage].ready += 1;
      else if (state === "generating") perStage[stage].active += 1;
      else if (state === "failed") perStage[stage].failed += 1;
    }
  }

  const missing: EpisodeCounts["compose"]["missing"] = [];
  for (const [beatNumber, stageStates] of Object.entries(states)) {
    const blockers: Array<Exclude<StageId, "compose">> = [];
    if (requireAudio && stageStates.audio !== "ready") {
      blockers.push("audio");
    }
    if (stageStates.video !== "ready") blockers.push("video");
    if (blockers.length > 0) {
      missing.push({ beatNum: Number(beatNumber), stages: blockers });
    }
  }

  return {
    ...perStage,
    compose: {
      ready: missing.length === 0 && totalBeats > 0,
      missing,
    },
  };
}
