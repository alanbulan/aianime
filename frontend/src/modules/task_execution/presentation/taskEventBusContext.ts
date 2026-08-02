// Copyright (c) 2026 AI anime
import { createContext, useContext } from "react";
import type { TaskEventBus } from "@/modules/task_execution/application/taskEventBus";

export const TaskEventBusContext = createContext<TaskEventBus | null>(null);

export function useTaskEventBus(): TaskEventBus {
  const bus = useContext(TaskEventBusContext);
  if (!bus) {
    throw new Error("useTaskEventBus must be used inside <TaskCenterProvider>");
  }
  return bus;
}
