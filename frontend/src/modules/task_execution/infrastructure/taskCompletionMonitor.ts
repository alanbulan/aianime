// Copyright (c) 2026 AI anime
// Project-scoped task monitoring: read task state and subscribe to SSE.
//
// We use native EventSource because AI anime auth is cookie-based and
// HttpOnly cookies are sent on the EventSource handshake automatically
// (no header needed). If the cookie is missing/expired, the stream returns
// a 401 immediately and we surface that to the caller.

import type {
  TaskState,
  TaskStatus,
} from "@/modules/task_execution/domain/contracts";
import type { TaskCompletionSourceRegistrar } from "@/modules/task_execution/application/taskStreamPorts";
import { apiCall } from "@/shared/api/client";

export type TaskCompletionFailureStatus = Extract<
  TaskStatus,
  "failed" | "cancelled"
>;

export class TaskCompletionError extends Error {
  constructor(
    message: string,
    public readonly status: TaskCompletionFailureStatus,
    public readonly taskKey: string,
  ) {
    super(message);
    this.name = "TaskCompletionError";
  }
}

function resolveTaskProjectId(projectId: string): string {
  const resolved = projectId.trim();
  if (!resolved) {
    throw new Error("project_id is required for task monitoring");
  }
  return resolved;
}

export async function listTasks(projectId: string): Promise<TaskState[]> {
  const resolved = resolveTaskProjectId(projectId);
  return await apiCall<TaskState[]>(
    `projects/${encodeURIComponent(resolved)}/tasks`,
  );
}

interface SseHandle {
  close(): void;
}

interface TaskStreamHandler {
  onTask: (task: TaskState) => void;
  onError?: (err: Event) => void;
  onAuthRevoked?: () => void;
  projectId: string;
}

/**
 * Open a project SSE stream that fans every `task_updated` event out to the
 * registered handler. Reconnects with exponential backoff on transient errors.
 */
function openTaskStream(handler: TaskStreamHandler): SseHandle {
  const projectId = resolveTaskProjectId(handler.projectId);
  let es: EventSource | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    es = new EventSource(
      `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/stream?snapshot=false`,
      { withCredentials: true },
    );

    es.addEventListener("task_updated", (event) => {
      attempt = 0;
      try {
        const data = JSON.parse((event as MessageEvent).data);
        handler.onTask(data as TaskState);
      } catch (err) {
        console.warn("[freezone] task_updated parse failed", err);
      }
    });
    es.addEventListener("auth_revoked", () => {
      handler.onAuthRevoked?.();
    });
    es.onerror = (err) => {
      handler.onError?.(err);
      es?.close();
      es = null;
      if (closed) return;
      attempt += 1;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt - 1));
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      es?.close();
      es = null;
    },
  };
}

// ---------------------------------------------------------------------- //
// In-process job tracker: callers can `await` a freezone job by task_key
// and the underlying SSE stream resolves the promise on completion / failure.

interface PendingResolver {
  resolve: (task: TaskState) => void;
  reject: (err: Error) => void;
  projectId: string;
  expiresAt: number;
}

interface ProjectPoller {
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  failureLogged: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 4000;
const DEFAULT_MAX_POLL_MS = 20 * 60 * 1000;
const pendingByTaskKey = new Map<string, PendingResolver>();
const sharedStreamsByProject = new Map<string, SseHandle>();
const pollersByProject = new Map<string, ProjectPoller>();
const taskCompletionSourceCountsByProject = new Map<string, number>();

function closeAllTaskMonitoring(err?: Error): void {
  for (const [, stream] of sharedStreamsByProject) {
    stream.close();
  }
  sharedStreamsByProject.clear();

  for (const [, poller] of pollersByProject) {
    if (poller.timer != null) {
      clearTimeout(poller.timer);
    }
  }
  pollersByProject.clear();
  taskCompletionSourceCountsByProject.clear();

  if (err) {
    for (const [, pending] of pendingByTaskKey) {
      pending.reject(err);
    }
    pendingByTaskKey.clear();
  }
}

function pendingCountForProject(projectId: string): number {
  let count = 0;
  for (const pending of pendingByTaskKey.values()) {
    if (pending.projectId === projectId) count += 1;
  }
  return count;
}

function maybeStopProjectMonitoring(projectId: string): void {
  if (pendingCountForProject(projectId) > 0) return;

  const poller = pollersByProject.get(projectId);
  if (poller) {
    if (poller.timer != null) {
      clearTimeout(poller.timer);
    }
    pollersByProject.delete(projectId);
  }

  // No job awaiting this project anymore — tear down the shared SSE stream too,
  // otherwise an idle connection (and its backoff reconnects) keeps hitting
  // /tasks/stream forever. It re-opens lazily on the next awaitTaskCompletion.
  const stream = sharedStreamsByProject.get(projectId);
  if (stream) {
    stream.close();
    sharedStreamsByProject.delete(projectId);
  }
}

function settleTask(task: TaskState): void {
  const pending = pendingByTaskKey.get(task.task_key);
  if (!pending) return;
  if (task.status === "completed") {
    pending.resolve(task);
    pendingByTaskKey.delete(task.task_key);
    maybeStopProjectMonitoring(pending.projectId);
  } else if (task.status === "failed" || task.status === "cancelled") {
    pending.reject(new TaskCompletionError(task.error ?? `task ${task.status}`, task.status, task.task_key));
    pendingByTaskKey.delete(task.task_key);
    maybeStopProjectMonitoring(pending.projectId);
  }
}

function rejectProjectPending(projectId: string, err: Error): void {
  for (const [taskKey, pending] of pendingByTaskKey) {
    if (pending.projectId !== projectId) continue;
    pending.reject(err);
    pendingByTaskKey.delete(taskKey);
  }
  maybeStopProjectMonitoring(projectId);
}

function ensureSharedStream(projectId: string) {
  const resolved = resolveTaskProjectId(projectId);
  if ((taskCompletionSourceCountsByProject.get(resolved) ?? 0) > 0) return;
  if (sharedStreamsByProject.has(resolved)) return;
  const stream = openTaskStream({
    projectId: resolved,
    onTask: (task) => {
      settleTask(task);
    },
    onAuthRevoked: () => {
      rejectProjectPending(resolved, new Error("auth revoked"));
    },
  });
  sharedStreamsByProject.set(resolved, stream);
}

export const registerTaskCompletionSource: TaskCompletionSourceRegistrar = (
  projectId,
) => {
  const resolved = resolveTaskProjectId(projectId);
  taskCompletionSourceCountsByProject.set(
    resolved,
    (taskCompletionSourceCountsByProject.get(resolved) ?? 0) + 1,
  );

  const fallbackStream = sharedStreamsByProject.get(resolved);
  if (fallbackStream) {
    fallbackStream.close();
    sharedStreamsByProject.delete(resolved);
  }

  let closed = false;
  return {
    onTask(task) {
      const pending = pendingByTaskKey.get(task.task_key);
      if (pending?.projectId === resolved) {
        settleTask(task);
      }
    },
    onAuthRevoked() {
      rejectProjectPending(resolved, new Error("auth revoked"));
    },
    close() {
      if (closed) return;
      closed = true;
      const remaining =
        (taskCompletionSourceCountsByProject.get(resolved) ?? 1) - 1;
      if (remaining > 0) {
        taskCompletionSourceCountsByProject.set(resolved, remaining);
        return;
      }
      taskCompletionSourceCountsByProject.delete(resolved);
      if (pendingCountForProject(resolved) > 0) {
        ensureSharedStream(resolved);
        ensureProjectPoller(resolved);
      }
    },
  };
};

/**
 * Shared HTTP polling fallback for {@link awaitTaskCompletion}. SSE is the
 * primary channel, but the stream can drop events during reconnect windows,
 * idle disconnects, or proxy hiccups. Keep one poller per project so concurrent
 * jobs share a single `/projects/:project/tasks` request cadence.
 */
function ensureProjectPoller(projectId: string): void {
  if (pollersByProject.has(projectId)) return;

  const poller: ProjectPoller = {
    timer: null,
    inFlight: false,
    failureLogged: false,
  };
  pollersByProject.set(projectId, poller);

  const schedule = () => {
    if (!pollersByProject.has(projectId)) return;
    poller.timer = setTimeout(run, DEFAULT_POLL_INTERVAL_MS);
  };

  const run = async () => {
    poller.timer = null;
    if (pendingCountForProject(projectId) === 0) {
      pollersByProject.delete(projectId);
      return;
    }
    if (poller.inFlight) {
      schedule();
      return;
    }

    poller.inFlight = true;
    try {
      const tasks = await listTasks(projectId);
      poller.failureLogged = false;
      const tasksByKey = new Map(tasks.map((task) => [task.task_key, task]));
      for (const [taskKey, pending] of pendingByTaskKey) {
        if (pending.projectId !== projectId) continue;
        const found = tasksByKey.get(taskKey);
        if (found) {
          settleTask(found);
        }
      }
    } catch (error) {
      if (!poller.failureLogged) {
        console.warn("[task-monitor] task polling failed; retrying", error);
        poller.failureLogged = true;
      }
    } finally {
      poller.inFlight = false;
    }

    const now = Date.now();
    for (const [taskKey, pending] of pendingByTaskKey) {
      if (pending.projectId !== projectId) continue;
      // Timeout independently of the list request result. A persistent network
      // failure must not leave the caller's promise pending forever.
      if (now >= pending.expiresAt) {
        pending.reject(new Error("task polling timed out"));
        pendingByTaskKey.delete(taskKey);
      }
    }

    if (pendingCountForProject(projectId) === 0) {
      pollersByProject.delete(projectId);
      return;
    }
    schedule();
  };

  schedule();
}

export function awaitTaskCompletion(
  taskKey: string,
  projectId: string,
): Promise<TaskState> {
  const resolved = resolveTaskProjectId(projectId);
  ensureSharedStream(resolved);
  ensureProjectPoller(resolved);
  const promise = new Promise<TaskState>((resolve, reject) => {
    pendingByTaskKey.set(taskKey, {
      resolve,
      reject,
      projectId: resolved,
      expiresAt: Date.now() + DEFAULT_MAX_POLL_MS,
    });
  });
  return promise.finally(() => {
    pendingByTaskKey.delete(taskKey);
    maybeStopProjectMonitoring(resolved);
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    closeAllTaskMonitoring(new Error("task monitor reloaded"));
  });
}
