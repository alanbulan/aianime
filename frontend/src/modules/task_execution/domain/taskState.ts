// Copyright (c) 2026 AI anime
import type { TaskState } from "@/modules/task_execution/domain/contracts";

export const isTerminal = (t: TaskState): boolean =>
  t.status === "completed" || t.status === "failed" || t.status === "cancelled";

export const isActive = (t: TaskState): boolean =>
  t.status === "submitting" ||
  t.status === "queued" ||
  t.status === "pending" ||
  t.status === "starting" ||
  t.status === "running";

export function isStaleTaskSnapshot(incoming: TaskState, current: TaskState): boolean {
  if (incoming.task_id !== current.task_id) {
    return Date.parse(incoming.created_at) < Date.parse(current.created_at);
  }
  if (isTerminal(current) && incoming.status !== current.status) return true;
  return Date.parse(incoming.updated_at) < Date.parse(current.updated_at);
}

export const ageMs = (t: TaskState, now: number = Date.now()): number =>
  now - Date.parse(t.updated_at);

export const taskProgressRatio = (task: TaskState): number => {
  if (task.status === "completed") return 1;
  const progress = Number.isFinite(task.progress) ? task.progress : 0;
  return Math.max(0, Math.min(1, progress));
};

export const taskProgressPercent = (task: TaskState): number =>
  Math.round(taskProgressRatio(task) * 100);

type TFn = (key: string, options?: Record<string, unknown>) => string;

function isInternalRunScope(scope: string | null | undefined): boolean {
  return /^scene_run_[a-z0-9]+$/i.test(scope ?? "") || /^prop_run_[a-z0-9]+$/i.test(scope ?? "");
}

export const displayLabel = (t: TaskState, tFn: TFn): string => {
  if (t.display_name) return t.display_name;

  const parts = [t.task_type_label || tFn(`tasks.types.${t.task_type}`)];
  if (t.episode > 0) parts.push(`ep${t.episode}`);
  if (t.beat_num != null) parts.push(`beat ${t.beat_num}`);
  if (t.scope && !isInternalRunScope(t.scope)) parts.push(t.scope);
  return parts.join(" · ");
};
