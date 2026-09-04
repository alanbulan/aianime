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
import type {
  StreamHealth,
  TaskCenterProject,
  TaskState,
} from "@/modules/task_execution/domain/contracts";
import {
  displayLabel,
  isActive,
  isTerminal,
  taskProjectId,
} from "@/modules/task_execution/domain/taskState";
import { TaskEventBusContext } from "@/modules/task_execution/presentation/taskEventBusContext";
import { taskErrorMessage } from "@/modules/task_execution/presentation/taskErrorMessage";
import { useTaskCenterStore } from "@/modules/task_execution/presentation/taskCenterStore";
import { TASK_TYPES } from "@/modules/task_execution/domain/taskTypes";
import type { OkResponse } from "@/types/api";

const PRUNE_INTERVAL_MS = 5 * 60 * 1000;
const POLLING_FALLBACK_INTERVAL_MS = 5000;
const GLOBAL_DISCOVERY_INTERVAL_MS = 30_000;
const MAX_LIVE_PROJECT_STREAMS = 4;
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

  if (
    task.task_type === TASK_TYPES.BEAT_VIDEO_PROMPT ||
    task.task_type === TASK_TYPES.VIDEO_PROMPT_OPTIMIZATION
  ) {
    if (task.episode > 0) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.beats(projectId, task.episode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.pipelineStatus(projectId),
      });
      if (
        task.task_type === TASK_TYPES.VIDEO_PROMPT_OPTIMIZATION &&
        task.beat_num != null
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.videoReferenceBeatStatus(
            projectId,
            task.episode,
            task.beat_num,
          ),
        });
      }
    }
    return;
  }

  if (task.task_type === TASK_TYPES.SINGLE_VIDEO) {
    if (task.episode > 0) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.beats(projectId, task.episode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.videoPool(projectId, task.episode),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.pipelineStatus(projectId),
      });
      if (task.beat_num != null) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.videoReferenceBeatStatus(
            projectId,
            task.episode,
            task.beat_num,
          ),
        });
      }
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
  projects: TaskCenterProject[];
  activeProjectId: string | null;
}

export interface TaskCenterProviderViewProps extends TaskCenterProviderProps {
  completionSourceRegistrar: TaskCompletionSourceRegistrar;
  gateway: TaskQueryGateway;
  streamClientFactory: TaskStreamClientFactory;
}

export function TaskCenterProviderView({
  children,
  projects,
  activeProjectId,
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
  const activeUsernameRef = useRef<string | null>(null);
  const activeProjectIdRef = useRef(activeProjectId);
  const reconcileStreamsRef = useRef<(() => void) | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
    reconcileStreamsRef.current?.();
  }, [activeProjectId]);

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

  // Main lifecycle: hydrate every accessible project, then keep the most
  // relevant projects on SSE while polling the remainder. The backend remains
  // project-scoped so OpenResty can route every request to the project's home
  // node; aggregation belongs here in the global desktop shell.
  useEffect(() => {
    if (!username) {
      const previousProjectIds = useTaskCenterStore
        .getState()
        .projects.map((project) => project.id);
      activeUsernameRef.current = null;
      useTaskCenterStore.getState().reset();
      queryClient.removeQueries({ queryKey: queryKeys.tasks() });
      for (const projectId of previousProjectIds) {
        queryClient.removeQueries({ queryKey: queryKeys.tasks(projectId) });
      }
      return;
    }

    if (activeUsernameRef.current && activeUsernameRef.current !== username) {
      const previousProjectIds = useTaskCenterStore
        .getState()
        .projects.map((project) => project.id);
      queryClient.removeQueries({ queryKey: queryKeys.tasks() });
      for (const projectId of previousProjectIds) {
        queryClient.removeQueries({ queryKey: queryKeys.tasks(projectId) });
      }
      useTaskCenterStore.getState().reset();
    }
    activeUsernameRef.current = username;
    useTaskCenterStore.getState().setProjects(projects);

    if (projects.length === 0) {
      useTaskCenterStore.getState().setHealth("idle");
      useTaskCenterStore.getState().markHydrated();
      return;
    }

    let cancelled = false;
    let initialHydrationComplete = false;
    let discoveryTimer: ReturnType<typeof setInterval> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    const clients = new Map<string, TaskStreamClient>();
    const completionSources = new Map(
      projects.map((project) => [
        project.id,
        completionSourceRegistrar(project.id),
      ]),
    );
    const hydrateInFlight = new Map<string, Promise<boolean>>();
    const streamHealth = new Map<string, StreamHealth>();
    const pollingProjects = new Set<string>();
    const projectById = new Map(projects.map((project) => [project.id, project]));

    const normalizeTask = (project: TaskCenterProject, task: TaskState): TaskState => ({
      ...task,
      project_id: project.id,
      project_name: task.project_name || project.name,
    });

    const updateAggregateHealth = () => {
      if (cancelled) return;
      const values = Array.from(streamHealth.values());
      const hasPollingCoverage = clients.size < projects.length || pollingProjects.size > 0;
      let health: StreamHealth = "idle";
      if (hasPollingCoverage) health = "polling";
      else if (values.includes("failed")) health = "failed";
      else if (values.includes("polling")) health = "polling";
      else if (values.includes("reconnecting")) health = "reconnecting";
      else if (values.includes("connecting")) health = "connecting";
      else if (values.length > 0 && values.every((value) => value === "connected")) {
        health = "connected";
      }
      useTaskCenterStore.getState().setHealth(health);
    };

    const runHydrate = async (project: TaskCenterProject): Promise<boolean> => {
      try {
        const res = await queryClient.fetchQuery({
          queryKey: queryKeys.tasks(project.id),
          staleTime: 0,
          queryFn: async ({ signal }) => ({
            ok: true as const,
            data: await gateway.listProjectTasks(project.id, signal),
          }),
        });
        if (!cancelled) {
          const tasks = res.data.map((task) => normalizeTask(project, task));
          useTaskCenterStore.getState().hydrateProject(project.id, tasks);
          useTaskCenterStore.getState().setLastEventAt(Date.now());
          queryClient.setQueryData(queryKeys.tasks(project.id), { ok: true, data: tasks });
          for (const task of tasks) {
            completionSources.get(project.id)?.onTask(task);
          }
        }
        return true;
      } catch (err) {
        if (isHydrateCancelledError(err)) return false;
        console.error(`[task-center] hydrate failed for project ${project.id}`, err);
        return false;
      }
    };

    const hydrate = (project: TaskCenterProject): Promise<boolean> => {
      const existing = hydrateInFlight.get(project.id);
      if (existing) return existing;
      const pending = runHydrate(project);
      hydrateInFlight.set(project.id, pending);
      const clear = () => {
        if (hydrateInFlight.get(project.id) === pending) {
          hydrateInFlight.delete(project.id);
        }
      };
      void pending.then(clear, clear);
      return pending;
    };

    const pushTask = (
      project: TaskCenterProject,
      taskValue: TaskState,
      source: "live" | "snapshot",
    ) => {
      const task = normalizeTask(project, taskValue);
      const prev = useTaskCenterStore.getState().upsert(task);
      if (useTaskCenterStore.getState().tasks.get(task.task_key) !== task) return;
      completionSources.get(project.id)?.onTask(task);

      queryClient.setQueryData<OkResponse<TaskState[]>>(
        queryKeys.tasks(project.id),
        (old) => {
          const list = old?.data ?? [];
          const idx = list.findIndex((item) => item.task_key === task.task_key);
          const next = idx >= 0
            ? [...list.slice(0, idx), task, ...list.slice(idx + 1)]
            : [...list, task];
          return { ok: true as const, data: next };
        },
      );

      bus.emit({ type: "task_updated", task, previous: prev });
      const completedAt = task.completed_at ? Date.parse(task.completed_at) : NaN;
      const isFresh = Number.isNaN(completedAt) || Date.now() - completedAt < TOAST_FRESHNESS_MS;
      const sawRunning = prev !== null && prev.task_id === task.task_id && !isTerminal(prev);
      const firstFreshObservation = isFresh && (prev === null || prev.task_id !== task.task_id);

      if (firstFreshObservation || sawRunning) {
        invalidateCompletedAssetQueries(queryClient, project.id, task);
        if (isTerminal(task)) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.commercialQuota() });
          void queryClient.invalidateQueries({ queryKey: queryKeys.commercialInvocations() });
        }
      }

      if (source === "snapshot" || !useTaskCenterStore.getState().isHydrated || !isFresh || !sawRunning) {
        return;
      }

      const label = `${project.name} · ${displayLabel(task, tRef.current)}`;
      if (task.status === "completed") {
        bus.emit({ type: "task_complete", task, previous: prev });
        toast.success(tRef.current("taskCenter.toast.completed", { label }));
      } else if (task.status === "failed") {
        bus.emit({ type: "task_failed", task, previous: prev });
        toast.error(
          tRef.current("taskCenter.toast.failed", {
            label,
            error: taskErrorMessage(task, tRef.current),
          }),
        );
      }
    };

    const openStream = (project: TaskCenterProject) => {
      if (clients.has(project.id) || cancelled) return;
      const client = streamClientFactory({
        streamPath: `/api/v1/projects/${encodeURIComponent(project.id)}/tasks/stream`,
        snapshotQueryParam: true,
        onUnrecoverable: () => {
          void hydrate(project);
        },
        onAuthRevoked: () => completionSources.get(project.id)?.onAuthRevoked(),
        onEvent: (task, source) => pushTask(project, task, source),
        onDelete: (key) => {
          useTaskCenterStore.getState().remove(key);
          bus.emit({ type: "task_removed", taskKey: key });
          void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project.id) });
        },
        onHealth: (h) => {
          streamHealth.set(project.id, h);
          updateAggregateHealth();
          if (h === "connected") useTaskCenterStore.getState().setLastEventAt(Date.now());
        },
        onReconnected: () => {
          void hydrate(project);
        },
        onPollingStart: () => {
          pollingProjects.add(project.id);
          updateAggregateHealth();
          void hydrate(project);
        },
        onPollingStop: () => {
          pollingProjects.delete(project.id);
          updateAggregateHealth();
        },
      });
      clients.set(project.id, client);
      client.start();
    };

    const reconcileStreams = () => {
      if (cancelled || !initialHydrationComplete) return;
      const activeTaskProjects = new Set(
        Array.from(useTaskCenterStore.getState().tasks.values())
          .filter(isActive)
          .map(taskProjectId),
      );
      const ordered = projects.slice().sort((left, right) => {
        const leftPriority = left.id === activeProjectIdRef.current ? 0 : activeTaskProjects.has(left.id) ? 1 : 2;
        const rightPriority = right.id === activeProjectIdRef.current ? 0 : activeTaskProjects.has(right.id) ? 1 : 2;
        return leftPriority - rightPriority;
      });
      const desired = new Set(
        ordered.slice(0, MAX_LIVE_PROJECT_STREAMS).map((project) => project.id),
      );
      for (const [projectId, client] of clients) {
        if (desired.has(projectId)) continue;
        client.close();
        clients.delete(projectId);
        streamHealth.delete(projectId);
        pollingProjects.delete(projectId);
      }
      for (const projectId of desired) {
        const project = projectById.get(projectId);
        if (project) openStream(project);
      }
      updateAggregateHealth();
    };
    reconcileStreamsRef.current = reconcileStreams;

    void (async () => {
      await Promise.all(projects.map(hydrate));
      if (cancelled) return;
      initialHydrationComplete = true;
      useTaskCenterStore.getState().markHydrated();
      reconcileStreams();

      discoveryTimer = setInterval(() => {
        void Promise.all(projects.map(hydrate)).then(reconcileStreams);
      }, GLOBAL_DISCOVERY_INTERVAL_MS);
      fallbackTimer = setInterval(() => {
        const targets = projects.filter(
          (project) => !clients.has(project.id) || pollingProjects.has(project.id),
        );
        if (targets.length > 0) {
          void Promise.all(targets.map(hydrate)).then(reconcileStreams);
        }
      }, POLLING_FALLBACK_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (discoveryTimer) clearInterval(discoveryTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      for (const client of clients.values()) client.close();
      for (const completionSource of completionSources.values()) completionSource.close();
      clients.clear();
      completionSources.clear();
      streamHealth.clear();
      pollingProjects.clear();
      if (reconcileStreamsRef.current === reconcileStreams) {
        reconcileStreamsRef.current = null;
      }
    };
  }, [
    username,
    projects,
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
