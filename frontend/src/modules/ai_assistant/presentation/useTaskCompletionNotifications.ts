// Copyright (c) 2026 AI anime
import { useEffect, useRef } from "react";

import { buildChatTaskLabel } from "@/modules/ai_assistant/presentation/taskNotificationLabel";
import { useTaskEventBus } from "@/modules/task_execution/public";

type AppendNotification = (text: string) => Promise<boolean>;
type Translate = Parameters<typeof buildChatTaskLabel>[1];

type UseTaskCompletionNotificationsOptions = {
  project?: string;
  appendNotification: AppendNotification;
  t: Translate;
};

export function useTaskCompletionNotifications({
  project,
  appendNotification,
  t,
}: UseTaskCompletionNotificationsOptions): void {
  const taskEventBus = useTaskEventBus();
  const notifiedTaskKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const scopedProject = project?.trim();
    if (!scopedProject) return;

    return taskEventBus.on("*", (event) => {
      if (event.type !== "task_complete" && event.type !== "task_failed") return;
      const taskProject = (event.task.project_id ?? event.task.project).trim();
      if (taskProject !== scopedProject) return;

      const dedupeKey = `${event.type}:${event.task.task_key || event.task.task_id}`;
      if (notifiedTaskKeysRef.current.has(dedupeKey)) return;
      notifiedTaskKeysRef.current.add(dedupeKey);

      const label = buildChatTaskLabel(event.task, t);
      const text =
        event.type === "task_complete"
          ? `✅ ${label}已完成。你可以让我查看结果，或继续下一步。`
          : `${label}失败：${event.task.error || event.task.current_task || "未提供具体错误原因"}\n请根据错误处理前置条件后再继续。`;
      void appendNotification(text);
    });
  }, [appendNotification, project, t, taskEventBus]);
}
