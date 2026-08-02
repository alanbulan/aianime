// Copyright (c) 2026 AI anime
import { createElement } from "react";

import { httpTaskQueryGateway } from "@/modules/task_execution/infrastructure/httpTaskQueryGateway";
import { createStreamClient } from "@/modules/task_execution/infrastructure/taskStreamClient";
import {
  TaskCenterProviderView,
  type TaskCenterProviderProps,
} from "@/modules/task_execution/presentation/TaskCenterProvider";
import { createTaskQueryHooks } from "@/modules/task_execution/presentation/taskQueryHooks";

const taskQueryHooks = createTaskQueryHooks(httpTaskQueryGateway);

export const {
  useCancelTask,
  useClearCompleted,
  useDeleteTask,
  useTasks,
} = taskQueryHooks;

export function TaskCenterProvider(props: TaskCenterProviderProps) {
  return createElement(TaskCenterProviderView, {
    ...props,
    gateway: httpTaskQueryGateway,
    streamClientFactory: createStreamClient,
  });
}
