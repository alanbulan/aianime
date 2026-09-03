// Copyright (c) 2026 AI anime
export type TaskStatus =
  | "submitting"
  | "queued"
  | "pending"
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskState {
  task_key: string;
  task_id: string;
  task_type: string;
  username: string;
  project: string;
  project_id?: string;
  episode: number;
  beat_num: number | null;
  scope: string | null;
  status: TaskStatus;
  progress: number;
  current_task: string;
  result: unknown | null;
  metadata?: Record<string, unknown> | null;
  error: string | null;
  error_code?: string | null;
  logs: string[];
  task_type_label?: string;
  display_name?: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
  expires_at?: string | null;
}

export interface TaskStreamEvent {
  task_id: string;
  task_key?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
  status: TaskStatus;
  progress: number;
  current_task?: string;
  result?: unknown;
  error?: string;
  error_code?: string | null;
  logs?: string[];
}

export type StreamHealth =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "polling"
  | "failed";

export type TaskEvent =
  | { type: "task_updated"; task: TaskState; previous: TaskState | null }
  | { type: "task_complete"; task: TaskState; previous: TaskState | null }
  | { type: "task_failed"; task: TaskState; previous: TaskState | null }
  | { type: "task_removed"; taskKey: string };

export type TaskEventType = TaskEvent["type"];
export type TaskEventListener = (e: TaskEvent) => void;
