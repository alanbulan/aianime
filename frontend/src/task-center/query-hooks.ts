// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { api } from "@/shared/api/transport";
import { p } from "@/shared/api/path";
import { useTaskCenterStore } from "@/task-center/store";
import type { OkResponse } from "@/types/api";
import type { Task } from "@/types/task";

interface UseTasksFilter {
  /** Route project id. Legacy task.project may still contain the display/path name. */
  project?: string;
  episode?: number;
}

export function useTasks(filter?: UseTasksFilter) {
  const project = filter?.project;
  const taskCenterProjectId = useTaskCenterStore((state) => state.projectId);
  const streamHealth = useTaskCenterStore((state) => state.streamHealth);
  const taskCenterOwnsProject =
    !!project &&
    taskCenterProjectId === project &&
    (streamHealth === "connected" || streamHealth === "polling");

  return useQuery({
    queryKey: queryKeys.tasks(project),
    queryFn: ({ signal }) => {
      if (!project) return Promise.resolve({ ok: true as const, data: [] });
      return api
        .get(p`api/v1/projects/${project}/tasks`, { signal })
        .json<OkResponse<Task[]>>();
    },
    // When Task Center owns this project, its SSE/polling path already keeps
    // the shared query cache fresh.
    refetchInterval: (query) => {
      if (taskCenterOwnsProject) return false;
      const tasks = query.state.data?.data;
      if (
        tasks?.some(
          (task) =>
            task.status === "submitting" ||
            task.status === "queued" ||
            task.status === "pending" ||
            task.status === "starting" ||
            task.status === "running",
        )
      ) {
        return 2000;
      }
      return 30000;
    },
    select: filter
      ? (response) => ({
          ...response,
          data: response.data.filter(
            (task) =>
              filter.episode === undefined || task.episode === filter.episode,
          ),
        })
      : undefined,
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      project,
      episode,
      beatNum,
      scope,
    }: {
      type: string;
      project: string;
      episode: number;
      beatNum?: number;
      scope?: string;
    }) => {
      const searchParams: Record<string, string> = {};
      if (beatNum !== undefined) searchParams.beat_num = String(beatNum);
      if (scope) searchParams.scope = scope;
      const path = p`api/v1/projects/${project}/tasks/${type}/${episode}`;
      return api
        .delete(
          path,
          Object.keys(searchParams).length ? { searchParams } : undefined,
        )
        .json<OkResponse<unknown>>();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks(variables.project),
      });
    },
  });
}

export function useClearCompleted(project: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api
        .delete(p`api/v1/projects/${project}/tasks/completed`)
        .json<OkResponse<unknown>>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      project,
      episode,
    }: {
      type: string;
      project: string;
      episode: number;
    }) =>
      api
        .delete(p`api/v1/projects/${project}/tasks/${type}/${episode}`)
        .json<OkResponse<unknown>>(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.tasks(variables.project),
      });
    },
  });
}
