// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  TaskDeleteTarget,
  TaskQueryGateway,
  TaskTarget,
} from "@/modules/task_execution/application/taskQueryPorts";
import { isActive } from "@/modules/task_execution/domain/taskState";
import { queryKeys } from "@/lib/query-keys";
import { useTaskCenterStore } from "@/modules/task_execution/presentation/taskCenterStore";

export interface UseTasksFilter {
  readonly project?: string;
  readonly episode?: number;
}

export function createTaskQueryHooks(gateway: TaskQueryGateway) {
  function useTasks(filter?: UseTasksFilter) {
    const project = filter?.project;
    const taskCenterProjects = useTaskCenterStore((state) => state.projects);
    const taskCenterHydrated = useTaskCenterStore((state) => state.isHydrated);
    const taskCenterOwnsProject =
      !!project &&
      taskCenterHydrated &&
      taskCenterProjects.some((candidate) => candidate.id === project);

    return useQuery({
      queryKey: queryKeys.tasks(project),
      queryFn: async ({ signal }) => ({
        ok: true as const,
        data: project ? await gateway.listProjectTasks(project, signal) : [],
      }),
      refetchInterval: (query) => {
        if (taskCenterOwnsProject) return false;
        return query.state.data?.data.some(isActive) ? 2000 : 30000;
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

  function useCancelTask() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (target: TaskTarget) => gateway.cancelTask(target),
      onSuccess: (_data, target) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(target.project) });
        queryClient.invalidateQueries({ queryKey: queryKeys.commercialInvocations() });
        queryClient.invalidateQueries({ queryKey: queryKeys.commercialQuota() });
      },
    });
  }

  function useClearCompleted(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.clearCompletedTasks(project),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) });
      },
    });
  }

  function useDeleteTask() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (target: TaskDeleteTarget) => gateway.deleteTask(target),
      onSuccess: (_data, target) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(target.project) });
      },
    });
  }

  return {
    useCancelTask,
    useClearCompleted,
    useDeleteTask,
    useTasks,
  };
}
