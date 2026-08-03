// Copyright (c) 2026 AI anime

export interface CanvasNodeGenerationTask {
  status: string;
  error?: string | null;
}

const ACTIVE_TASK_STATUSES = new Set([
  "submitting",
  "queued",
  "pending",
  "starting",
  "running",
]);

function isActiveTask(task: CanvasNodeGenerationTask): boolean {
  return ACTIVE_TASK_STATUSES.has(task.status);
}

export interface NodeGenerationTaskState {
  taskKey: string;
  task: CanvasNodeGenerationTask | null;
  taskIsActive: boolean;
  waitingForTaskRecord: boolean;
  optimisticOnly: boolean;
  isGenerating: boolean;
}

export interface ResolveNodeGenerationTaskStateParams {
  data: unknown;
  task: CanvasNodeGenerationTask | null;
  taskCenterHydrated: boolean;
  now?: number;
  taskKey?: string;
}

const RECENTLY_STARTED_GRACE_MS = 10_000;

function nodeGenerationRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object"
    ? data as Record<string, unknown>
    : {};
}

export function readNodeGenerationTaskKey(data: unknown): string {
  const record = nodeGenerationRecord(data);
  return typeof record.generationTaskKey === "string"
    ? record.generationTaskKey.trim()
    : "";
}

export function resolveNodeGenerationTaskState({
  data,
  task,
  taskCenterHydrated,
  now = Date.now(),
  taskKey = readNodeGenerationTaskKey(data),
}: ResolveNodeGenerationTaskStateParams): NodeGenerationTaskState {
  const record = nodeGenerationRecord(data);
  const taskIsActive = task ? isActiveTask(task) : false;
  const localGenerating = record.isGenerating === true;
  const startedAt =
    typeof record.generationStartedAt === "number"
      ? record.generationStartedAt
      : null;
  const recentlyStarted =
    startedAt != null && now - startedAt < RECENTLY_STARTED_GRACE_MS;
  const waitingForTaskRecord =
    localGenerating &&
    taskKey.length > 0 &&
    !task &&
    (!taskCenterHydrated || recentlyStarted);
  const optimisticOnly = localGenerating && taskKey.length === 0;

  return {
    taskKey,
    task,
    taskIsActive,
    waitingForTaskRecord,
    optimisticOnly,
    isGenerating: taskIsActive || waitingForTaskRecord || optimisticOnly,
  };
}
