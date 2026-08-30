// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef } from "react";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/modules/identity_access/public";
import { useAppStore } from "@/modules/project_workspace/public";
import { queryKeys } from "@/lib/query-keys";
import type { TaskQueryGateway } from "@/modules/task_execution/application/taskQueryPorts";
import type {
  TaskCompletionSourceRegistrar,
  TaskStreamClient,
  TaskStreamClientFactory,
} from "@/modules/task_execution/application/taskStreamPorts";
import { createTaskEventBus } from "@/modules/task_execution/application/taskEventBus";
import type { TaskState } from "@/modules/task_execution/domain/contracts";
import { displayLabel, isTerminal } from "@/modules/task_execution/domain/taskState";
import { TaskEventBusContext } from "@/modules/task_execution/presentation/taskEventBusContext";
import { taskErrorMessage } from "@/modules/task_execution/presentation/taskErrorMessage";
import { useTaskCenterStore } from "@/modules/task_execution/presentation/taskCenterStore";
import { TASK_TYPES } from "@/modules/task_execution/domain/taskTypes";
import type { OkResponse } from "@/types/api";

const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const POLLING_FALLBACK_INTERVAL_MS = 5000;
const POLLING_FALLBACK_MAX_INTERVAL_MS = 30_000;
// A terminal task whose completion is older than this is treated as a replay,
// not a fresh transition — no toast, no auto-expand. Covers the case where
// the user returns from a long idle / sleep and the stream replays or the
// hydrate returns an old-but-unseen terminal task.
const TOAST_FRESHNESS_MS = 2 * 60 * 1000;

function characterNameFromScope(scope: string | null | undefined): string | null {
  const parts = String(scope ?? "").split(":");
  if (parts[0] !== "character") return null;
  return parts[1] || null;
}

function isCharacterIdentitiesQuery(projectId: string, queryKey: readonly unknown[]): boolean {
  return (
    queryKey.length >= 5 &&
    queryKey[0] === "projects" &&
    queryKey[1] === projectId &&
    queryKey[2] === "characters" &&
    queryKey[4] === "identities"
  );
}

function invalidateCompletedAssetQueries(
  queryClient: QueryClient,
  projectId: string,
  task: TaskState,
): void {
  if (task.status !== "completed") return;

  if (
    task.task_type === TASK_TYPES.SCRIPT_WRITER ||
    task.task_type === TASK_TYPES.LITERAL_SCRIPT_WRITER
  ) {
    if (task.episode > 0) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.script(projectId, task.episode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.beats(projectId, task.episode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.pipelineStatus(projectId),
      });
    }
    return;
  }

  if (task.task_type === TASK_TYPES.BEAT_VIDEO_PROMPT) {
    if (task.episode > 0) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.beats(projectId, task.episode),
      });
    }
    return;
  }

  if (task.task_type === "build_characters") {
    queryClient.invalidateQueries({ queryKey: queryKeys.characters(projectId) });
    return;
  }

  if (task.task_type === TASK_TYPES.IDENTITY_PLANNER) {
    queryClient.invalidateQueries({ queryKey: queryKeys.characters(projectId) });
    queryClient.invalidateQueries({
      predicate: (query) => isCharacterIdentitiesQuery(projectId, query.queryKey),
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.episodes(projectId) });
    if (task.episode > 0) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.episodeDetail(projectId, task.episode),
      });
    }
    return;
  }

  if (task.task_type === "character_portrait") {
    const characterName = characterNameFromScope(task.scope);
    if (characterName && task.scope?.includes(":identity_portrait:")) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.identities(projectId, characterName),
      });
    } else {
      queryClient.invalidateQueries({ queryKey: queryKeys.characters(projectId) });
    }
    return;
  }

  if (task.task_type === "identity_image") {
    const characterName = characterNameFromScope(task.scope);
    if (characterName) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.identities(projectId, characterName),
      });
    }
    return;
  }

  if (task.task_type === TASK_TYPES.STYLE_PREVIEW) {
    queryClient.invalidateQueries({ queryKey: queryKeys.styles(projectId) });
    return;
  }

  if (
    task.task_type === "build_scenes" ||
    task.task_type === "scene_reference_asset" ||
    task.task_type === "stage_asset"
  ) {
    queryClient.invalidateQueries({ queryKey: queryKeys.scenes(projectId) });
    return;
  }

  if (
    task.task_type === "build_props" ||
    task.task_type === "prop_reference_asset" ||
    task.task_type === "batch_prop_ref"
  ) {
    queryClient.invalidateQueries({ queryKey: queryKeys.props(projectId) });
    return;
  }

  if (
    task.task_type !== "episode_scene_planner" &&
    task.task_type !== "episode_prop_planner"
  ) {
    return;
  }

  if (task.task_type === "episode_scene_planner") {
    queryClient.invalidateQueries({ queryKey: queryKeys.scenes(projectId) });
  } else {
    queryClient.invalidateQueries({ queryKey: queryKeys.props(projectId) });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.episodes(projectId) });
  if (task.episode > 0) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.episodeDetail(projectId, task.episode),
    });
  }
}

function isTypingInForm(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function isHydrateCancelledError(error: unknown): boolean {
  if (isCancelledError(error)) return true;
  if (!(error instanceof Error)) return false;
  return error.name === "CancelledError" || error.message === "CancelledError";
}

export interface TaskCenterProviderProps {
  children: ReactNode;
  projectId: string | null;
}

export interface TaskCenterProviderViewProps extends TaskCenterProviderProps {
  completionSourceRegistrar: TaskCompletionSourceRegistrar;
  gateway: TaskQueryGateway;
  streamClientFactory: TaskStreamClientFactory;
}

export function TaskCenterProviderView({
  children,
  projectId,
  completionSourceRegistrar,
  gateway,
  streamClientFactory,
}: TaskCenterProviderViewProps) {
  const { t } = useTranslation();
  // Gate on `username` instead of `apiKey`: the SPA is now cookie-backed and
  // no longer persists a raw credential. Presence of a username signals a
  // completed login; the HttpOnly cookie carries the real credential.
  const username = useAuthStore((s) => s.username);
  const queryClient = useQueryClient();
  const bus = useMemo(createTaskEventBus, []);
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSessionRef = useRef<{ username: string; projectId: string } | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  // Keyboard shortcut ⌘J / Ctrl+J
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j")) return;
      if (isTypingInForm(e.target)) return;
      e.preventDefault();
      const current = useAppStore.getState().taskPanelOpen;
      useAppStore.getState().setTaskPanelOpen(!current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pruning tick
  useEffect(() => {
    const id = setInterval(() => useTaskCenterStore.getState().prune(), PRUNE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Main lifecycle: hydrate-first, then open stream with snapshot=false.
  // Deps exclude `t` so language change doesn't tear down the connection.
  useEffect(() => {
    if (!username || !projectId) {
      const previous = activeSessionRef.current;
      activeSessionRef.current = null;
      useTaskCenterStore.getState().reset();
      queryClient.removeQueries({ queryKey: queryKeys.tasks() });
      if (previous) {
        queryClient.removeQueries({ queryKey: queryKeys.tasks(previous.projectId) });
      }
      return;
    }

    const previous = activeSessionRef.current;
    if (previous && previous.username !== username) {
      queryClient.removeQueries({ queryKey: queryKeys.tasks(previous.projectId) });
    }
    activeSessionRef.current = { username, projectId };
    useTaskCenterStore.getState().setProject(projectId);
    const completionSource = completionSourceRegistrar(projectId);

    let cancelled = false;
    let client: TaskStreamClient | null = null;
    let hydrateInFlight: Promise<boolean> | null = null;
    let pollingActive = false;
    let pollingFailureCount = 0;

    const runHydrate = async (): Promise<boolean> => {
      try {
        const res = await queryClient.fetchQuery({
          queryKey: queryKeys.tasks(projectId),
          queryFn: async ({ signal }) => ({
            ok: true as const,
            data: await gateway.listProjectTasks(projectId, signal),
          }),
        });
        if (!cancelled) {
          for (const task of res.data) {
            completionSource.onTask(task);
          }
          useTaskCenterStore.getState().hydrate(res.data);
        }
        return true;
      } catch (err) {
        if (isHydrateCancelledError(err)) return false;
        console.error("[task-center] hydrate failed", err);
        return false;
      }
    };

    const hydrate = (): Promise<boolean> => {
      if (hydrateInFlight) return hydrateInFlight;
      const pending = runHydrate();
      hydrateInFlight = pending;
      const clear = () => {
        if (hydrateInFlight === pending) hydrateInFlight = null;
      };
      void pending.then(clear, clear);
      return pending;
    };

    const schedulePolling = (delayMs: number) => {
      if (!pollingActive || cancelled || pollIntervalRef.current) return;
      pollIntervalRef.current = setTimeout(() => {
        pollIntervalRef.current = null;
        void (async () => {
          const succeeded = await hydrate();
          if (!pollingActive || cancelled) return;
          pollingFailureCount = succeeded
            ? 0
            : Math.min(pollingFailureCount + 1, 3);
          const nextDelay = succeeded
            ? POLLING_FALLBACK_INTERVAL_MS
            : Math.min(
                POLLING_FALLBACK_INTERVAL_MS * 2 ** pollingFailureCount,
                POLLING_FALLBACK_MAX_INTERVAL_MS,
              );
          schedulePolling(nextDelay);
        })();
      }, delayMs);
    };

    const startPolling = () => {
      if (pollingActive) return;
      pollingActive = true;
      pollingFailureCount = 0;
      schedulePolling(0);
    };
    const stopPolling = () => {
      pollingActive = false;
      pollingFailureCount = 0;
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    (async () => {
      await hydrate();
      if (cancelled) return;
      useTaskCenterStore.getState().markHydrated();

      client = streamClientFactory({
        streamPath: `/api/v1/projects/${encodeURIComponent(projectId)}/tasks/stream`,
        snapshotQueryParam: true,
        onUnrecoverable: () => {
          // Cold-start SSE failure (likely auth). Force one hydrate via ky so
          // the global 401 handler observes the rejected credential and
          // triggers logout + redirect to /login. If the failure was actually
          // network-level the hydrate will also fail but at least we stop
          // hammering the SSE endpoint every 15s.
          void hydrate();
        },
        onAuthRevoked: () => completionSource.onAuthRevoked(),
        onEvent: (task, source) => {
          completionSource.onTask(task);
          const prev = useTaskCenterStore.getState().upsert(task);

          // Push-through cache update (not invalidate) to keep legacy `useTasks()` consumers
          // in sync without hammering the backend.
          queryClient.setQueryData<OkResponse<TaskState[]>>(
            queryKeys.tasks(projectId),
            (old) => {
              const list = old?.data ?? [];
              const idx = list.findIndex((x) => x.task_key === task.task_key);
              const next =
                idx >= 0
                  ? [...list.slice(0, idx), task, ...list.slice(idx + 1)]
                  : [...list, task];
              return { ok: true as const, data: next };
            },
          );

          bus.emit({ type: "task_updated", task, previous: prev });

          // Belt-and-suspenders: if the BE's completed_at is old, treat it
          // as a replay even if we happened to observe it running once. A
          // genuine transition will always be within a few seconds.
          const completedAt = task.completed_at
            ? Date.parse(task.completed_at)
            : NaN;
          const isFresh =
            Number.isNaN(completedAt) ||
            Date.now() - completedAt < TOAST_FRESHNESS_MS;
          const sawRunning = prev !== null && !isTerminal(prev);
          const firstFreshObservation = isFresh && prev === null;

          // Invalidate asset queries for any genuinely-new completion, even
          // when it arrives via a reconnect/hydration snapshot — otherwise an
          // async planner finishing while the stream is down leaves the asset
          // pages stale until a manual reload. Replays stay guarded: an old
          // completed_at on a task we never saw running is skipped, and a
          // duplicate terminal event for an already-terminal row is ignored.
          if (firstFreshObservation || sawRunning) {
            invalidateCompletedAssetQueries(queryClient, projectId, task);
            if (isTerminal(task)) {
              void queryClient.invalidateQueries({
                queryKey: queryKeys.commercialQuota(),
              });
            }
          }

          if (source === "snapshot") return;
          if (!useTaskCenterStore.getState().isHydrated) return;
          if (!isFresh) return;

          // Only toast on a *real* transition that happened in this session:
          //   prev must exist AND have been non-terminal.
          // Previous guard (`!wasTerminal` with prev=null → false) fired
          // toasts for any first-time-seen terminal task, which is exactly
          // what shows up after reconnect-replay or post-idle hydration.
          if (!sawRunning) return;

          if (task.status === "completed") {
            bus.emit({ type: "task_complete", task, previous: prev });
            toast.success(
              tRef.current("taskCenter.toast.completed", {
                label: displayLabel(task, tRef.current),
              }),
            );
          } else if (task.status === "failed") {
            bus.emit({ type: "task_failed", task, previous: prev });
            toast.error(
              tRef.current("taskCenter.toast.failed", {
                label: displayLabel(task, tRef.current),
                error: taskErrorMessage(task, tRef.current),
              }),
            );
          }
        },
        onDelete: (key) => {
          useTaskCenterStore.getState().remove(key);
          bus.emit({ type: "task_removed", taskKey: key });
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks(projectId) });
        },
        onHealth: (h) => useTaskCenterStore.getState().setHealth(h),
        onReconnected: () => {
          void hydrate();
        },
        onPollingStart: startPolling,
        onPollingStop: stopPolling,
      });

      client.start();
    })();

    return () => {
      cancelled = true;
      client?.close();
      completionSource.close();
      stopPolling();
      useTaskCenterStore.getState().reset();
    };
  }, [
    username,
    projectId,
    queryClient,
    bus,
    completionSourceRegistrar,
    gateway,
    streamClientFactory,
  ]);

  return (
    <TaskEventBusContext.Provider value={bus}>
      {children}
    </TaskEventBusContext.Provider>
  );
}
