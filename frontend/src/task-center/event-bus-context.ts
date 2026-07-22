// Copyright (c) 2026 AI anime
import { createContext, useContext } from "react";
import type { TaskEventBus } from "./event-bus";

export const EventBusContext = createContext<TaskEventBus | null>(null);

export function useEventBus(): TaskEventBus {
  const bus = useContext(EventBusContext);
  if (!bus) throw new Error("useEventBus must be used inside <TaskCenterProvider>");
  return bus;
}
