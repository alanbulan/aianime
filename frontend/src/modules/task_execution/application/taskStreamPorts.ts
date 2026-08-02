// Copyright (c) 2026 AI anime
import type {
  StreamHealth,
  TaskState,
} from "@/modules/task_execution/domain/contracts";

export interface TaskStreamClientOptions {
  streamPath: string;
  onEvent: (task: TaskState, source: "live" | "snapshot") => void;
  onDelete: (taskKey: string) => void;
  onHealth: (health: StreamHealth) => void;
  onReconnected?: () => void;
  onPollingStart?: () => void;
  onPollingStop?: () => void;
  onUnrecoverable?: () => void;
  backoffMs?: number[];
  watchdogMs?: number;
  pollingRetryMs?: number;
  snapshotQueryParam?: boolean;
  maxInitialFailures?: number;
}

export interface TaskStreamClient {
  start(): void;
  close(): void;
}

export type TaskStreamClientFactory = (
  options: TaskStreamClientOptions,
) => TaskStreamClient;
