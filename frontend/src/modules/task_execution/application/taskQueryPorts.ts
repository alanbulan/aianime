// Copyright (c) 2026 AI anime
import type { TaskState } from "@/modules/task_execution/domain/contracts";

export interface TaskTarget {
  readonly type: string;
  readonly project: string;
  readonly episode: number;
  readonly beatNum?: number;
  readonly scope?: string;
}

export interface TaskDeleteTarget {
  readonly type: string;
  readonly project: string;
  readonly episode: number;
}

export interface TaskQueryGateway {
  listProjectTasks(projectId: string, signal?: AbortSignal): Promise<TaskState[]>;
  cancelTask(target: TaskTarget): Promise<unknown>;
  clearCompletedTasks(projectId: string): Promise<unknown>;
  deleteTask(target: TaskDeleteTarget): Promise<unknown>;
}
