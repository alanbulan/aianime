// Copyright (c) 2026 AI anime
import type {
  TaskDeleteTarget,
  TaskQueryGateway,
  TaskTarget,
} from "@/modules/task_execution/application/taskQueryPorts";
import type { TaskState } from "@/modules/task_execution/domain/contracts";
import { api } from "@/shared/api/transport";
import { p } from "@/shared/api/path";
import type { OkResponse } from "@/types/api";

function taskPath(target: TaskDeleteTarget): string {
  return p`api/v1/projects/${target.project}/tasks/${target.type}/${target.episode}`;
}

async function cancelTask(target: TaskTarget): Promise<unknown> {
  const searchParams: Record<string, string> = {};
  if (target.beatNum !== undefined) {
    searchParams.beat_num = String(target.beatNum);
  }
  if (target.scope) searchParams.scope = target.scope;

  return api
    .delete(
      taskPath(target),
      Object.keys(searchParams).length ? { searchParams } : undefined,
    )
    .json<OkResponse<unknown>>();
}

export const httpTaskQueryGateway: TaskQueryGateway = {
  async listProjectTasks(projectId, signal) {
    const response = await api
      .get(p`api/v1/projects/${projectId}/tasks`, { signal })
      .json<OkResponse<TaskState[]>>();
    return response.data;
  },
  cancelTask,
  clearCompletedTasks: (projectId) =>
    api
      .delete(p`api/v1/projects/${projectId}/tasks/completed`)
      .json<OkResponse<unknown>>(),
  deleteTask: (target) =>
    api.delete(taskPath(target)).json<OkResponse<unknown>>(),
};
